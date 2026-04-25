/**
 * Normalizes raw themeparks.wiki responses into Parkio's stable JSON shape.
 *
 * The website AND the iOS app both consume the normalized output. Keep
 * field names and value sets backwards-compatible — older app versions
 * may still be in the wild.
 */

import { RIDES } from "./data";
import { getParkConfig } from "./disneyParkConfig";
import type {
  ApiAttraction,
  ApiAttractionStatus,
  ApiHoursWindow,
  ApiPark,
  ApiParkHours,
  ApiParkLive,
  ApiParkStatus,
} from "./types";
import type {
  ThemeparksLiveResponse,
  ThemeparksScheduleEntry,
  ThemeparksScheduleResponse,
} from "./themeparksApi";

/* ─────────────────────── Helpers ─────────────────────── */

function nowIso(): string {
  return new Date().toISOString();
}

function todayKey(timezone: string): string {
  // Date in the park's local timezone, formatted "YYYY-MM-DD".
  // Intl.DateTimeFormat is available in the edge runtime.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function pickTodayHours(
  schedule: ThemeparksScheduleEntry[] | undefined,
  timezone: string,
): ApiHoursWindow | null {
  if (!schedule) return null;
  const today = todayKey(timezone);
  const entry = schedule.find((s) => s.date === today && s.type === "OPERATING");
  if (!entry?.openingTime || !entry.closingTime) return null;
  return { open: entry.openingTime, close: entry.closingTime };
}

function deriveParkStatus(
  schedule: ThemeparksScheduleEntry[] | undefined,
  timezone: string,
): ApiParkStatus {
  if (!schedule) return "UNKNOWN";
  const today = todayKey(timezone);
  const entry = schedule.find((s) => s.date === today);
  if (!entry) return "UNKNOWN";
  if (entry.type === "OPERATING" || entry.type === "EXTRA_HOURS") return "OPEN";
  if (entry.type === "CLOSED") return "CLOSED";
  return "UNKNOWN";
}

function normalizeAttractionStatus(
  raw: string | undefined,
): ApiAttractionStatus {
  switch (raw) {
    case "OPERATING":
    case "DOWN":
    case "CLOSED":
    case "REFURBISHMENT":
      return raw;
    default:
      return "UNKNOWN";
  }
}

/* ─────────────────────── Park ─────────────────────── */

/**
 * Build an ApiPark from the schedule response and the static config.
 * `schedule` may be omitted when the upstream is unavailable — in that
 * case status is UNKNOWN and todayHours is null.
 */
export function normalizePark(
  parkSlug: string,
  schedule?: ThemeparksScheduleResponse | null,
): ApiPark | null {
  const cfg = getParkConfig(parkSlug);
  if (!cfg) return null;

  return {
    id: cfg.externalId,
    slug: cfg.slug,
    name: cfg.name,
    resortSlug: cfg.resortSlug,
    status: deriveParkStatus(schedule?.schedule, cfg.timezone),
    timezone: cfg.timezone,
    todayHours: pickTodayHours(schedule?.schedule, cfg.timezone),
    lastUpdated: nowIso(),
  };
}

/* ─────────────────────── Hours ─────────────────────── */

export function normalizeHours(
  parkSlug: string,
  schedule?: ThemeparksScheduleResponse | null,
): ApiParkHours | null {
  const cfg = getParkConfig(parkSlug);
  if (!cfg) return null;

  const upcoming = (schedule?.schedule ?? [])
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(0, 14)
    .map((entry) => ({
      date: entry.date,
      type: ((): "OPERATING" | "INFO" | "EXTRA_HOURS" | "CLOSED" => {
        if (entry.type === "OPERATING") return "OPERATING";
        if (entry.type === "INFO") return "INFO";
        if (entry.type === "EXTRA_HOURS") return "EXTRA_HOURS";
        return "CLOSED";
      })(),
      open: entry.openingTime ?? null,
      close: entry.closingTime ?? null,
    }));

  return {
    parkSlug: cfg.slug,
    timezone: cfg.timezone,
    today: pickTodayHours(schedule?.schedule, cfg.timezone),
    schedule: upcoming,
    lastUpdated: nowIso(),
  };
}

/* ─────────────────────── Live attractions ─────────────────────── */

/**
 * Build the live attractions response for a park. Uses Parkio's static
 * `RIDES` list as the canonical set of attractions (so slugs are stable
 * for iOS), then layers live wait/status from the upstream by externalId.
 *
 * If `live` is omitted/null, every attraction comes back with a fallback
 * `baseWait` and status UNKNOWN — the caller can mark `live: false`.
 */
export function normalizeLive(
  parkSlug: string,
  live?: ThemeparksLiveResponse | null,
): ApiParkLive | null {
  const cfg = getParkConfig(parkSlug);
  if (!cfg) return null;

  const liveById = new Map<string, ApiAttraction>();
  for (const entry of live?.liveData ?? []) {
    liveById.set(entry.id, {
      id: entry.id,
      slug: "", // filled in below from static config
      parkSlug: cfg.slug,
      name: entry.name,
      status: normalizeAttractionStatus(entry.status),
      waitMinutes:
        typeof entry.queue?.STANDBY?.waitTime === "number"
          ? (entry.queue.STANDBY.waitTime as number)
          : null,
      coordinates: null, // filled in below from static config
      lastUpdated: entry.lastUpdated ?? nowIso(),
    });
  }

  // Iterate Parkio's static attractions for this park. Stable slugs for iOS.
  const parkRides = RIDES.filter((r) => {
    const ridePark = getParkConfig(r.parkId);
    return ridePark?.slug === cfg.slug;
  });

  const isLive = (live?.liveData?.length ?? 0) > 0;
  const lastUpdated = nowIso();

  const attractions: ApiAttraction[] = parkRides.map((ride) => {
    const fromLive = liveById.get(ride.externalId);
    const coords = { lat: ride.lat, lng: ride.lng };

    if (fromLive) {
      return {
        ...fromLive,
        slug: ride.id,
        coordinates: coords,
      };
    }

    // Fallback: no live row — return UNKNOWN with no wait minutes so the
    // client can decide whether to display a base estimate.
    return {
      id: ride.externalId,
      slug: ride.id,
      parkSlug: cfg.slug,
      name: ride.name,
      status: "UNKNOWN",
      waitMinutes: null,
      coordinates: coords,
      lastUpdated,
    };
  });

  return {
    parkSlug: cfg.slug,
    lastUpdated,
    live: isLive,
    attractions,
  };
}

/**
 * Find a single attraction by its Parkio slug. Returns null when the
 * slug doesn't correspond to a supported attraction.
 */
export function findAttractionBySlug(slug: string): ApiAttraction | null {
  const ride = RIDES.find((r) => r.id === slug);
  if (!ride) return null;
  const cfg = getParkConfig(ride.parkId);
  if (!cfg) return null;
  return {
    id: ride.externalId,
    slug: ride.id,
    parkSlug: cfg.slug,
    name: ride.name,
    status: "UNKNOWN",
    waitMinutes: null,
    coordinates: { lat: ride.lat, lng: ride.lng },
    lastUpdated: nowIso(),
  };
}

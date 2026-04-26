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

/**
 * "YYYY-MM-DD" for the given moment, in the park's local timezone.
 * The park's TZ is what the upstream schedule keys off of, so we
 * never use the user's browser timezone for date math.
 */
function dateKeyInTz(timezone: string, when: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(when);
}

/**
 * themeparks.wiki frequently returns multiple entries for the same date
 * (an INFO entry plus the actual OPERATING entry, etc.). We always want
 * the OPERATING/EXTRA_HOURS entry — falling back to the first non-INFO
 * entry — never the INFO row, which doesn't carry hours.
 */
function pickOperatingEntry(
  entries: ThemeparksScheduleEntry[],
): ThemeparksScheduleEntry | undefined {
  return entries.find(
    (e) => e.type === "OPERATING" || e.type === "EXTRA_HOURS",
  );
}

function pickTodayHours(
  schedule: ThemeparksScheduleEntry[] | undefined,
  timezone: string,
): ApiHoursWindow | null {
  if (!schedule) return null;
  const today = dateKeyInTz(timezone);
  const todayEntries = schedule.filter((s) => s.date === today);
  const op = pickOperatingEntry(todayEntries);
  if (!op?.openingTime || !op.closingTime) return null;
  return { open: op.openingTime, close: op.closingTime };
}

/**
 * Real-time park status. Resolves to:
 *   - "OPEN":    current park-local time is inside today's open/close
 *                window, OR yesterday's window extends past midnight
 *                and we're still in it.
 *   - "CLOSED":  today's schedule says CLOSED, or it's outside the
 *                operating window (before opening / after closing).
 *   - "UNKNOWN": no schedule data for today.
 *
 * All time math goes through Date.parse() on the upstream's ISO
 * timestamps (which include the park's UTC offset), so the comparison
 * is timezone-correct regardless of the visitor's browser timezone.
 */
function deriveParkStatus(
  schedule: ThemeparksScheduleEntry[] | undefined,
  timezone: string,
  now: number = Date.now(),
): ApiParkStatus {
  if (!schedule) return "UNKNOWN";

  const today = dateKeyInTz(timezone, new Date(now));
  const yesterday = dateKeyInTz(
    timezone,
    new Date(now - 24 * 60 * 60 * 1000),
  );

  // (1) Are we currently inside today's operating window?
  const todayEntries = schedule.filter((s) => s.date === today);
  const todayOp = pickOperatingEntry(todayEntries);
  if (todayOp?.openingTime && todayOp.closingTime) {
    const open = Date.parse(todayOp.openingTime);
    const close = Date.parse(todayOp.closingTime);
    if (!Number.isNaN(open) && !Number.isNaN(close)) {
      if (now >= open && now < close) return "OPEN";
    }
  }

  // (2) Edge case: did yesterday's window extend past midnight and is
  //     still active? (Disney parks often close at 12 / 1 AM.)
  const yesterdayOp = pickOperatingEntry(
    schedule.filter((s) => s.date === yesterday),
  );
  if (yesterdayOp?.closingTime) {
    const close = Date.parse(yesterdayOp.closingTime);
    if (!Number.isNaN(close) && now < close) return "OPEN";
  }

  // (3) No active operating window. If we have today's schedule and it
  //     either says CLOSED or has an OPERATING entry that we're outside
  //     of, surface CLOSED. Otherwise we genuinely don't know.
  if (todayEntries.length === 0) return "UNKNOWN";
  if (todayEntries.some((e) => e.type === "CLOSED")) return "CLOSED";
  if (todayOp) return "CLOSED"; // before opening or after closing
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

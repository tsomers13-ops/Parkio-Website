/**
 * Seasonal (festival) Dining domain.
 *
 * Pure and framework-free. Lifecycle is driven entirely by dates against the
 * park-local calendar (America/New_York) — there is no `isActive` flag in the
 * source and none is derived here. Core logic takes an explicit date so it is
 * deterministic and testable; only the convenience wrapper reads the clock.
 */

import festivalSource from "../content/dining/festivals/ep-fw-2026.json";
import type {
  DiningParkId,
  Festival,
  FestivalBooth,
  PermanentDiningVenue,
} from "./diningTypes";

export const FESTIVAL_TIME_ZONE = "America/New_York";

export type FestivalStatus = "upcoming" | "active" | "expired";

interface FestivalDocument {
  schemaVersion: number;
  festival: Festival;
  provenance: {
    verifiedAt: string;
    verificationMethod?: string;
    sourceUrls: string[];
    boothCount: number;
    menuItemCount: number;
  };
  booths: Omit<FestivalBooth, "kind" | "parkId">[];
}

const DOC = festivalSource as unknown as FestivalDocument;

/** The festivals the Website knows about. One edition per file today. */
export function getFestivals(): Festival[] {
  return [DOC.festival];
}

export function getFestival(festivalId: string): Festival | undefined {
  return DOC.festival.id === festivalId ? DOC.festival : undefined;
}

/**
 * Every booth, tagged with `kind` and the festival's park.
 * A booth has no park of its own — it belongs to its festival's park.
 */
export function getAllFestivalBooths(): FestivalBooth[] {
  return DOC.booths.map((booth) => ({
    ...booth,
    kind: "festivalBooth" as const,
    parkId: DOC.festival.parkId as DiningParkId,
  }));
}

/** Park-local calendar date (YYYY-MM-DD), no time-of-day. */
export function parkLocalDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FESTIVAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Today's park-local date. The only clock read in this module. */
export function todayInPark(): string {
  return parkLocalDate(new Date());
}

/** Effective [startsOn, endsOn] — booth override, else the festival window. */
export function boothWindow(booth: FestivalBooth, festival: Festival): [string, string] {
  return [booth.startsOn ?? festival.startsOn, booth.endsOn ?? festival.endsOn];
}

/** Inclusive date-window comparison. Deterministic for an explicit date. */
export function statusForWindow(
  startsOn: string,
  endsOn: string,
  date: string,
): FestivalStatus {
  if (date < startsOn) return "upcoming";
  if (date > endsOn) return "expired";
  return "active";
}

export function getFestivalStatus(festival: Festival, date: string): FestivalStatus {
  return statusForWindow(festival.startsOn, festival.endsOn, date);
}

/**
 * A booth is only active when BOTH its festival window and its own window
 * contain the date — a booth cannot outlive its festival.
 */
export function getBoothStatus(booth: FestivalBooth, date: string): FestivalStatus {
  const festival = getFestival(booth.festivalId);
  if (!festival) return "expired";
  const festivalStatus = getFestivalStatus(festival, date);
  if (festivalStatus !== "active") return festivalStatus;
  const [startsOn, endsOn] = boothWindow(booth, festival);
  return statusForWindow(startsOn, endsOn, date);
}

// ── Host relationship ───────────────────────────────────────────────────────

/**
 * Resolve a booth hosted at an existing permanent venue.
 *
 * Returns null for a standalone marketplace, and null when the link cannot be
 * resolved — the caller decides how to degrade. The permanent venue is looked
 * up, never copied into the booth: the two keep separate identities, and a
 * hosted booth must never be rendered as a second permanent venue.
 */
export function resolveFestivalHost(
  booth: FestivalBooth,
  venues: readonly PermanentDiningVenue[],
): PermanentDiningVenue | null {
  if (!booth.venueCanonicalId) return null;
  return venues.find((v) => v.canonicalId === booth.venueCanonicalId) ?? null;
}

/** True when this booth's offering is served at a permanent venue. */
export function isHostedBooth(booth: FestivalBooth): boolean {
  return booth.venueCanonicalId !== undefined;
}

// ── Collections ─────────────────────────────────────────────────────────────

/**
 * Every booth for a park, regardless of lifecycle state. Authored order is
 * not meaningful in the source (records are id-sorted), so ordering is by id
 * for determinism.
 */
export function getSeasonalDiningForPark(parkId: string): FestivalBooth[] {
  return getAllFestivalBooths()
    .filter((booth) => booth.parkId === parkId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Only booths active on the given park-local date. */
export function getActiveFestivalDiningForPark(
  parkId: string,
  date: string,
): FestivalBooth[] {
  return getSeasonalDiningForPark(parkId).filter(
    (booth) => getBoothStatus(booth, date) === "active",
  );
}

/** Provenance of the authored source, for internal display and staleness checks. */
export function getFestivalProvenance() {
  return DOC.provenance;
}

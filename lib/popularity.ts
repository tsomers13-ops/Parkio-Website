/**
 * Static "headliner" lists per park + a deterministic scoring helper.
 *
 * No real AI, no external models — just hand-curated popularity sets
 * that let the website rank attractions in a way that matches what
 * Disney veterans would actually recommend.
 *
 * The popularity list is derived from publicly known fan-favorite
 * rankings (highest typical waits + most-recommended). Update as
 * lineups change.
 */

import type { ApiAttraction } from "./types";

/* ──────────────────── Top-tier ride sets per park ────────────────── */

const MAGIC_KINGDOM_TOP = new Set([
  "mk-seven-dwarfs",
  "mk-tron",
  "mk-space-mountain",
  "mk-tiana",
  "mk-thunder-mountain",
  "mk-pirates",
  "mk-haunted-mansion",
  "mk-peter-pan",
]);

const EPCOT_TOP = new Set([
  "ep-guardians",
  "ep-test-track",
  "ep-frozen",
  "ep-soarin",
  "ep-remy",
  "ep-mission-space",
]);

const HOLLYWOOD_STUDIOS_TOP = new Set([
  "hs-rise",
  "hs-slinky",
  "hs-runaway-railway",
  "hs-tower",
  "hs-rocknroller",
  "hs-millennium",
]);

const ANIMAL_KINGDOM_TOP = new Set([
  "ak-flight-of-passage",
  "ak-everest",
  "ak-navi",
  "ak-safari",
]);

const DISNEYLAND_TOP = new Set([
  "dl-rise",
  "dl-indy",
  "dl-space-mountain",
  "dl-matterhorn",
  "dl-thunder-mountain",
  "dl-pirates",
  "dl-haunted-mansion",
  "dl-tiana",
  "dl-runaway-railway",
  "dl-millennium-falcon",
]);

const CALIFORNIA_ADVENTURE_TOP = new Set([
  "dca-radiator-springs",
  "dca-incredicoaster",
  "dca-soarin",
  "dca-webslingers",
  "dca-guardians",
  "dca-toy-story",
]);

const TOP_RIDES_BY_PARK: Record<string, Set<string>> = {
  "magic-kingdom": MAGIC_KINGDOM_TOP,
  epcot: EPCOT_TOP,
  "hollywood-studios": HOLLYWOOD_STUDIOS_TOP,
  "animal-kingdom": ANIMAL_KINGDOM_TOP,
  disneyland: DISNEYLAND_TOP,
  "california-adventure": CALIFORNIA_ADVENTURE_TOP,
};

export function isTopRide(parkSlug: string, rideSlug: string): boolean {
  return TOP_RIDES_BY_PARK[parkSlug]?.has(rideSlug) ?? false;
}

/* ─────────────────────────── Scoring ─────────────────────────── */

/**
 * Wait-cutoff for "Best right now" / "Good options". Anything above
 * this is considered "high wait" and lands in "Skip for now".
 */
export const HIGH_WAIT_CUTOFF_MIN = 60;

/**
 * Lower bound for "Good options" — anything below this is short
 * enough that it goes into "Best right now" instead.
 */
export const MODERATE_WAIT_FLOOR_MIN = 30;

/**
 * Score for "Best right now" ranking. Higher = better recommendation.
 *
 * Formula:
 *   shorter wait ⇒ higher score
 *   popular ride ⇒ +30 bonus
 *
 * Returns -Infinity for rides we never want to surface (not operating,
 * no wait reported, or wait above the high-wait cutoff).
 */
export function bestNowScore(
  parkSlug: string,
  attraction: ApiAttraction,
): number {
  if (attraction.status !== "OPERATING") return -Infinity;
  if (typeof attraction.waitMinutes !== "number") return -Infinity;
  if (attraction.waitMinutes > HIGH_WAIT_CUTOFF_MIN) return -Infinity;

  const waitBonus = HIGH_WAIT_CUTOFF_MIN - attraction.waitMinutes; // 0..60
  const popularityBonus = isTopRide(parkSlug, attraction.slug) ? 30 : 0;
  return waitBonus + popularityBonus;
}

export interface PartitionedAttractions {
  /** Top picks: short waits, biased toward popular rides. */
  bestNow: ApiAttraction[];
  /** Moderate waits, NOT top-tier — solid backup options. */
  goodOptions: ApiAttraction[];
  /** Long waits — guests should plan around these. */
  skipForNow: ApiAttraction[];
}

/**
 * Partition a park's live attractions into the three recommendation
 * buckets. Each bucket caps at 5 entries to keep cards scannable.
 */
export function partitionAttractions(
  parkSlug: string,
  attractions: ApiAttraction[],
): PartitionedAttractions {
  // Best right now: operating + wait <= cutoff, sorted by score desc.
  const bestNow = attractions
    .filter(
      (a) =>
        a.status === "OPERATING" &&
        typeof a.waitMinutes === "number" &&
        (a.waitMinutes as number) <= HIGH_WAIT_CUTOFF_MIN,
    )
    .map((a) => ({ a, score: bestNowScore(parkSlug, a) }))
    .filter((x) => Number.isFinite(x.score))
    .sort((x, y) => y.score - x.score)
    .map((x) => x.a)
    .slice(0, 5);

  const bestNowSlugs = new Set(bestNow.map((a) => a.slug));

  // Good options: moderate waits, not in best-now picks, not top-tier.
  const goodOptions = attractions
    .filter(
      (a) =>
        a.status === "OPERATING" &&
        typeof a.waitMinutes === "number" &&
        (a.waitMinutes as number) >= MODERATE_WAIT_FLOOR_MIN &&
        (a.waitMinutes as number) <= HIGH_WAIT_CUTOFF_MIN &&
        !bestNowSlugs.has(a.slug) &&
        !isTopRide(parkSlug, a.slug),
    )
    .sort((a, b) => (a.waitMinutes as number) - (b.waitMinutes as number))
    .slice(0, 5);

  // Skip for now: long waits, sorted by waitMinutes desc.
  const skipForNow = attractions
    .filter(
      (a) =>
        a.status === "OPERATING" &&
        typeof a.waitMinutes === "number" &&
        (a.waitMinutes as number) > HIGH_WAIT_CUTOFF_MIN,
    )
    .sort((a, b) => (b.waitMinutes as number) - (a.waitMinutes as number))
    .slice(0, 5);

  return { bestNow, goodOptions, skipForNow };
}

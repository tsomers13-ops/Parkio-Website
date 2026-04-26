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
 * Lower bound for "Good options" — anything below this either lands
 * in Best Right Now (as a hidden gem) or falls into the gem cutoff
 * for non-headliners. Aligns with GEM_MAX_WAIT_MIN so the buckets
 * connect with no gap.
 */
export const MODERATE_WAIT_FLOOR_MIN = 26;

/**
 * Threshold for the "Low wait" badge in the Best Right Now card.
 * Anything at or below this number gets the badge — it signals
 * a real walk-on opportunity.
 */
export const LOW_WAIT_THRESHOLD_MIN = 15;

/**
 * Maximum wait for a NON-headliner to qualify for "Best right now".
 * Above this, a non-headliner is considered too unremarkable to
 * recommend over a headliner with a moderate wait — it falls back
 * to "Good options" instead. Keeps weak rides with mid waits from
 * polluting the smart picks.
 */
export const GEM_MAX_WAIT_MIN = 25;

/* Internal scoring tiers. Headliner picks always rank above gem
 * picks, so we use disjoint numeric ranges:
 *   - Headliner: HEADLINER_TIER_BASE - waitMinutes  → roughly 940..1000
 *   - Gem:       GEM_TIER_BASE       - waitMinutes  → roughly 75..100
 * The gap guarantees ordering without a secondary sort key.
 */
const HEADLINER_TIER_BASE = 1000;
const GEM_TIER_BASE = 100;

/**
 * Score for "Best right now" ranking. Higher = better recommendation.
 *
 * Tiered formula — designed so a low-wait but unremarkable ride never
 * outranks a headliner with a reasonable wait:
 *
 *   Tier 1 (Headliners)   wait <= 60 min   → 940..1000 (shorter wait wins)
 *   Tier 2 (Hidden gems)  wait <= 25 min   →  75..100  (shorter wait wins)
 *   Otherwise → -Infinity (won't appear in Best Right Now)
 *
 * A non-headliner with a 35-minute wait used to rank near the bottom
 * of Best Right Now; now it correctly falls through to Good Options.
 *
 * Returns -Infinity for rides we never want to surface (not operating,
 * no wait reported, above the high-wait cutoff, or non-headliner
 * above the gem threshold).
 */
export function bestNowScore(
  parkSlug: string,
  attraction: ApiAttraction,
): number {
  if (attraction.status !== "OPERATING") return -Infinity;
  if (typeof attraction.waitMinutes !== "number") return -Infinity;
  if (attraction.waitMinutes > HIGH_WAIT_CUTOFF_MIN) return -Infinity;

  const wait = attraction.waitMinutes;
  const popular = isTopRide(parkSlug, attraction.slug);

  // Tier 1 — headliners always sit at the top, ranked by ascending wait.
  if (popular) {
    return HEADLINER_TIER_BASE - wait;
  }

  // Tier 2 — non-headliners only qualify when waits are genuinely low.
  if (wait <= GEM_MAX_WAIT_MIN) {
    return GEM_TIER_BASE - wait;
  }

  // Mid-wait non-headliners: not weak enough to skip, not strong enough
  // to sit in Best Right Now. They get picked up by Good Options.
  return -Infinity;
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

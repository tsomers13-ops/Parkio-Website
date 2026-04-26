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
 * Boundary used inside Good Options ordering to separate "real
 * backup plan" rides (wait ≥ 26 min) from "easy walk-on overflow"
 * rides. No longer a hard filter floor — every operating ride with
 * a valid wait ≤ HIGH_WAIT_CUTOFF_MIN is eligible for Good Options
 * if it didn't make Best Right Now. See partitionAttractions for
 * the priority-tier sort that uses this constant.
 */
export const MODERATE_WAIT_FLOOR_MIN = 26;

/**
 * Threshold for the "Low wait" badge in the Best Right Now card.
 * Anything at or below this number gets the badge — it signals
 * a real walk-on opportunity.
 */
export const LOW_WAIT_THRESHOLD_MIN = 15;

/**
 * Cutoff for "exceptional walk-on" non-headliners. A non-headliner
 * with a wait at or below this threshold is effectively a freebie
 * and gets lifted into the headliner band (Tier 1.5) so it can
 * actually compete with headliners that have meaningful waits.
 *
 * Above this number, gems are still eligible for Best Right Now
 * but only at Tier 2 strength — they fill remaining slots after
 * all eligible headliners.
 */
export const SUPER_GEM_MAX_WAIT_MIN = 10;

/**
 * Maximum wait for a NON-headliner to qualify for "Best right now"
 * at Tier 2 (regular gem) strength. Above this, a non-headliner is
 * considered too unremarkable to recommend over a headliner with a
 * moderate wait — it falls back to "Good options" instead. Keeps
 * weak rides with mid waits from polluting the smart picks.
 */
export const GEM_MAX_WAIT_MIN = 25;

/* Internal scoring tiers. We use three disjoint bands so that
 * ordering is determined by tier first and wait second:
 *
 *   Tier 1   Headliners (wait ≤ 60):
 *            score = HEADLINER_TIER_BASE - wait     → 940..1000
 *
 *   Tier 1½  Exceptional walk-on gems (non-HL, wait ≤ 10):
 *            score = SUPER_GEM_TIER_BASE - wait     → 955..965
 *            Sits between 30-min headliners (970) and 36-min
 *            headliners (964). A 0-min walk-on outranks any
 *            headliner with a wait ≥ 36 min, but loses to any
 *            headliner with a wait ≤ 30 min.
 *
 *   Tier 2   Regular gems (non-HL, wait 11–25):
 *            score = GEM_TIER_BASE - wait           → 75..89
 *            Far below all headliners — only fills Best Right
 *            Now slots after every eligible headliner is placed.
 *
 * Outside these bands → -Infinity (excluded from Best Right Now).
 */
const HEADLINER_TIER_BASE = 1000;
const SUPER_GEM_TIER_BASE = 965;
const GEM_TIER_BASE = 100;

/**
 * Score for "Best right now" ranking. Higher = better recommendation.
 *
 * Three-tier formula — designed so the smart-pick card mirrors how a
 * Disney veteran would actually advise: prioritize headliners when
 * waits are reasonable, lift true walk-on gems into competition with
 * mid-wait headliners, and never let weak mid-wait non-headliners
 * outrank a real headliner.
 *
 *   Tier 1   Headliners (wait ≤ 60)            → 940..1000
 *   Tier 1½  Walk-on gems (non-HL, wait ≤ 10)  → 955..965
 *   Tier 2   Regular gems (non-HL, wait 11-25) →  75..89
 *
 * The bands are arranged so that:
 *   - A 5-min Spaceship Earth (Tier 1½ → 960) outranks a 45-min
 *     Frozen Ever After (Tier 1 → 955).
 *   - A 5-min Spaceship Earth (Tier 1½ → 960) still LOSES to a
 *     20-min Soarin' (Tier 1 → 980). Headliners with reasonable
 *     waits stay on top.
 *   - A 35-min non-headliner returns -Infinity → falls through to
 *     Good Options instead of polluting Best Right Now.
 *
 * Returns -Infinity for rides we never want to surface (not operating,
 * no wait reported, above the high-wait cutoff, or non-headliner with
 * a wait above the regular-gem threshold).
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

  // Tier 1 — headliners always sit at the top of their band, ranked
  // by ascending wait.
  if (popular) {
    return HEADLINER_TIER_BASE - wait;
  }

  // Tier 1½ — exceptional walk-on gems. Non-headliner with a near-
  // walk-on wait gets lifted into the headliner band so it can
  // compete with mid-wait headliners (≥ 36 min). Capped at the
  // SUPER_GEM_MAX_WAIT_MIN ceiling so it can't bleed into "real
  // wait" territory.
  if (wait <= SUPER_GEM_MAX_WAIT_MIN) {
    return SUPER_GEM_TIER_BASE - wait;
  }

  // Tier 2 — regular gems. Non-headliner with a short-but-not-
  // walk-on wait. Sits well below every headliner; only fills
  // remaining Best Right Now slots after headliners and walk-ons.
  if (wait <= GEM_MAX_WAIT_MIN) {
    return GEM_TIER_BASE - wait;
  }

  // Mid-wait non-headliners (26..60): not weak enough to skip, not
  // strong enough to sit in Best Right Now. They get picked up by
  // Good Options instead.
  return -Infinity;
}

export interface PartitionedAttractions {
  /** Top picks: short waits, biased toward popular rides. */
  bestNow: ApiAttraction[];
  /**
   * "Good options" — solid backup picks. Combines three flavors of
   * ride that didn't make Best Right Now:
   *   - overflow headliners (highest priority)
   *   - mid-wait non-headliners (real backup plans)
   *   - overflow walk-on / regular gems (still worth the trip)
   */
  goodOptions: ApiAttraction[];
  /** Long waits — guests should plan around these. */
  skipForNow: ApiAttraction[];
}

/**
 * Partition a park's live attractions into the three recommendation
 * buckets. Each bucket caps at 5 entries to keep cards scannable.
 *
 * Coverage guarantee: every OPERATING attraction with a valid wait
 * is structurally eligible for at least one bucket — no ride can
 * fall through every card. (When more than 5 candidates compete for
 * a single bucket the cap still trims the list, but every ride at
 * least competes fairly within its priority tier.)
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

  // Good options: any operating ride with a valid wait ≤ 60 that
  // didn't make Best Right Now. Sorted by a three-tier priority so
  // the most useful backups surface first when the cap of 5 trims
  // the list:
  //
  //   priority 0  Overflow headliners (notable rides at any wait)
  //   priority 1  Mid-wait non-headliners (real backup plans)
  //   priority 2  Overflow walk-on / regular gems (cheap easy wins)
  //
  // Within the same priority, sort by ascending wait. This guarantees
  // an overflow headliner like Seven Dwarfs (55 min) is visible
  // alongside genuinely useful gems, and that a walk-on gem that lost
  // a Best Right Now tiebreak still surfaces somewhere.
  const goodOptions = attractions
    .filter(
      (a) =>
        a.status === "OPERATING" &&
        typeof a.waitMinutes === "number" &&
        (a.waitMinutes as number) <= HIGH_WAIT_CUTOFF_MIN &&
        !bestNowSlugs.has(a.slug),
    )
    .map((a) => {
      const wait = a.waitMinutes as number;
      const popular = isTopRide(parkSlug, a.slug);
      let priority: number;
      if (popular) {
        priority = 0;
      } else if (wait >= MODERATE_WAIT_FLOOR_MIN) {
        priority = 1;
      } else {
        priority = 2;
      }
      return { a, priority, wait };
    })
    .sort((x, y) => {
      if (x.priority !== y.priority) return x.priority - y.priority;
      return x.wait - y.wait;
    })
    .map((x) => x.a)
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

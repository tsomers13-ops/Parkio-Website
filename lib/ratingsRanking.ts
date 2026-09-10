/**
 * Community Ratings trust model.
 *
 * A raw average is the honest thing to SHOW a guest and the wrong thing to
 * RANK by: one anonymous five-star rating would outrank two hundred and fifty
 * real opinions. This module turns an aggregate into a ranking signal that
 * resists that, and says when there is enough evidence to rank at all.
 *
 * Nothing here is guest-facing. The public average and count are unchanged and
 * still raw; `rankingScore` is a sorting key, never a number to display. A
 * guest who reads "4.7 · 127 ratings" can check that against the reviews —
 * showing them 4.52 instead would be a number nobody can reconcile.
 *
 * Deliberately NOT inputs: the Parkio editorial score, Parkio Pick, price
 * tier, the recommendation score, the private on-device journal, and the
 * optional Taste/Value/Quality dimensions. Community ranking is computed from
 * active Overall community ratings and nothing else — the editorial and
 * community systems were kept apart on purpose, and a shared prior would
 * quietly blend them back together.
 *
 * Pure and deterministic: same inputs, same output, on every client and every
 * request. This is the single source of truth for trust — clients must never
 * reimplement it, or the two platforms will eventually disagree.
 */

import type { DiningRatingAggregate } from "./ratingsTypes";

// ── Policy constants (MVP) ──────────────────────────────────────────────────
//
// These are product policy, not physics. They live here, named, so a future
// change is a one-line diff with a test that fails loudly — never a magic
// number buried in a route.

/**
 * The average a venue is assumed to have before anyone rates it.
 *
 * 4.0 is an explicit MVP policy, not a measured value: Production has no
 * ratings yet, so a data-derived prior cannot bootstrap. 1-5 dining scales
 * skew high, so a "neutral" 3.0 would punish every venue against a mean no
 * real restaurant sits at.
 *
 * REVIEW TRIGGER: once Production holds at least 200 active Overall ratings,
 * analyse the real global distribution before replacing this. Reaching 200
 * triggers a review — it must NOT switch the prior automatically, because a
 * silently moving prior would silently reorder every ranking.
 */
export const COMMUNITY_RATING_PRIOR = 4.0;

/**
 * How many ratings the prior is worth.
 *
 * 10 is an explicit MVP policy. It roughly doubles the cost of brigading
 * versus a weight of 5 (about 8-10 fabricated five-star ratings to beat a
 * well-supported venue rather than 5-6) at the cost of holding newly eligible
 * venues down — acceptable only because Gate 8A exposes no ranking, and any
 * later exposure is opt-in rather than a default sort.
 *
 * Note honestly: shrinkage makes abuse linearly more expensive, it does not
 * prevent it. Edge rate limiting is the actual control, and it is Gate 8B.
 */
export const COMMUNITY_RATING_PRIOR_WEIGHT = 10;

/**
 * Ratings required before a venue may be ranked at all.
 *
 * 5 is an explicit MVP policy. The shrinkage maths alone would already stop a
 * single rating dominating (one five-star scores 4.09 here), so this threshold
 * is doing product work rather than statistical work: nothing should ever
 * appear in a "Top Rated" list captioned "1 rating", however sound the
 * arithmetic behind it.
 *
 * This is NOT a display threshold. A venue with one rating still shows its
 * raw average and count exactly as before.
 */
export const COMMUNITY_RATING_MIN_RANKING_COUNT = 5;

/** Whole stars, matching the D1 CHECK constraint. */
const RATING_MIN = 1;
const RATING_MAX = 5;

// ── Result ──────────────────────────────────────────────────────────────────

export interface CommunityRankingResult {
  /**
   * Sorting key. `null` whenever the venue cannot be ranked — never 0, which
   * would sort a venue nobody has rated below one everybody hated.
   */
  rankingScore: number | null;
  /** Whether there is enough evidence to place this venue against others. */
  rankingEligible: boolean;
}

const NOT_RANKABLE: CommunityRankingResult = {
  rankingScore: null,
  rankingEligible: false,
};

// ── Calculation ─────────────────────────────────────────────────────────────

/**
 * Bayesian shrinkage toward the prior:
 *
 *     score = (weight x prior + count x average) / (weight + count)
 *
 * A venue with few ratings sits near the prior; as ratings accumulate the
 * score converges on the raw average. That is the whole idea — evidence, not
 * enthusiasm, moves a venue up.
 *
 * Fails closed. A negative count, a non-integer count, an average outside
 * 1-5, NaN or Infinity all yield "not rankable" rather than a plausible
 * number, because a malformed ranking is worse than an absent one: it would
 * silently order real restaurants for real guests.
 *
 * The result is NOT rounded. Rounding here would create ties that do not
 * exist and make ordering depend on presentation; rounding is the UI's job.
 */
export function calculateCommunityRanking(
  overallAverage: number | null,
  ratingCount: number,
): CommunityRankingResult {
  if (!Number.isInteger(ratingCount) || ratingCount < 0) return NOT_RANKABLE;
  if (ratingCount < COMMUNITY_RATING_MIN_RANKING_COUNT) return NOT_RANKABLE;

  // Eligible by count but missing an average means the row set is
  // inconsistent; refuse rather than invent one.
  if (overallAverage === null || !Number.isFinite(overallAverage)) return NOT_RANKABLE;
  if (overallAverage < RATING_MIN || overallAverage > RATING_MAX) return NOT_RANKABLE;

  const score =
    (COMMUNITY_RATING_PRIOR_WEIGHT * COMMUNITY_RATING_PRIOR + ratingCount * overallAverage) /
    (COMMUNITY_RATING_PRIOR_WEIGHT + ratingCount);

  // Defensive: the arithmetic above cannot produce a non-finite value from
  // validated inputs, but a ranking key must never escape as NaN.
  if (!Number.isFinite(score)) return NOT_RANKABLE;

  return { rankingScore: score, rankingEligible: true };
}

/** Convenience for callers holding a full aggregate. */
export function rankingForAggregate(
  aggregate: Pick<DiningRatingAggregate, "overallAverage" | "ratingCount">,
): CommunityRankingResult {
  return calculateCommunityRanking(aggregate.overallAverage, aggregate.ratingCount);
}

// ── Ordering ────────────────────────────────────────────────────────────────

export interface RankableVenue {
  venueKey: string;
  ratingCount: number;
  overallAverage: number | null;
  rankingScore: number | null;
  rankingEligible: boolean;
}

/**
 * Total order for ranked venues, defined now so that whenever ranking is
 * exposed it cannot accidentally inherit database row order or JavaScript
 * object key order.
 *
 *   1. rankingScore descending  — the trust signal
 *   2. ratingCount descending   — more evidence wins a genuine tie
 *   3. overallAverage descending
 *   4. venueKey ascending       — stable, arbitrary, deterministic
 *
 * Ineligible venues sort after every eligible one rather than being dropped,
 * so a caller cannot silently lose venues by sorting.
 *
 * NOT used by any guest-facing surface in Gate 8A. It exists so Gate 8C has
 * one comparator to adopt instead of inventing its own.
 */
export function compareByCommunityRanking(a: RankableVenue, b: RankableVenue): number {
  if (a.rankingEligible !== b.rankingEligible) return a.rankingEligible ? -1 : 1;

  if (a.rankingEligible && b.rankingEligible) {
    const scoreA = a.rankingScore ?? 0;
    const scoreB = b.rankingScore ?? 0;
    if (scoreA !== scoreB) return scoreB - scoreA;
  }

  if (a.ratingCount !== b.ratingCount) return b.ratingCount - a.ratingCount;

  const avgA = a.overallAverage ?? 0;
  const avgB = b.overallAverage ?? 0;
  if (avgA !== avgB) return avgB - avgA;

  return a.venueKey < b.venueKey ? -1 : a.venueKey > b.venueKey ? 1 : 0;
}

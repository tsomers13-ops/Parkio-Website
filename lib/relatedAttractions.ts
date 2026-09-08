/**
 * "More in this area" derivation for an attraction page.
 *
 * Deliberately not a recommendation engine: no scoring, no personalization,
 * no live wait input. Just two source-backed facts — same land, then
 * walking distance — so the ordering is stable and explainable.
 */

import { RIDES } from "./data";
import type { Ride } from "./types";
import { walkBucketBetween, walkMinutes, type WalkBucket } from "./walk";

export interface RelatedAttraction {
  ride: Ride;
  /** True when it shares the current attraction's land. */
  sameLand: boolean;
  /** Coarse walking range, or null when the two points coincide. */
  walk: WalkBucket | null;
}

export const RELATED_ATTRACTION_LIMIT = 4;

/**
 * Attractions worth looking at next, in this order:
 *
 *   1. same park + same land, nearest first
 *   2. same park, nearest first
 *
 * Never crosses parks, always excludes the current attraction, and ties
 * break on `id` so the output is identical on every render.
 */
export function relatedAttractions(
  ride: Ride,
  limit: number = RELATED_ATTRACTION_LIMIT,
): RelatedAttraction[] {
  const candidates = RIDES.filter(
    (candidate) => candidate.parkId === ride.parkId && candidate.id !== ride.id,
  );

  const ranked = candidates
    .map((candidate) => ({
      candidate,
      sameLand: candidate.land === ride.land,
      distance: walkMinutes(ride, candidate),
    }))
    .sort((a, b) => {
      // Same land first.
      if (a.sameLand !== b.sameLand) return a.sameLand ? -1 : 1;
      // Then nearest.
      if (a.distance !== b.distance) return a.distance - b.distance;
      // Then a stable tiebreak so the order never depends on input order.
      return a.candidate.id.localeCompare(b.candidate.id);
    });

  return ranked.slice(0, Math.max(0, limit)).map((entry) => ({
    ride: entry.candidate,
    sameLand: entry.sameLand,
    walk: walkBucketBetween(ride, entry.candidate),
  }));
}

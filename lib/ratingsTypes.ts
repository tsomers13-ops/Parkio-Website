/**
 * Community Dining rating contracts.
 *
 * Framework-independent and deliberately small. These describe the data only —
 * nothing here knows about HTTP, cookies, D1 or React.
 *
 * Parkio Score (editorial, 1–10) and Guest Rating (community, 1–5) are
 * different measurements of different things and are never combined.
 */

/** Whole stars. Half stars are not submittable; aggregates display one decimal. */
export const RATING_MIN = 1;
export const RATING_MAX = 5;

/** Optional dimensions. Overall is required and is not in this list. */
export const RATING_DIMENSIONS = ["taste", "value", "quality"] as const;
export type RatingDimension = (typeof RATING_DIMENSIONS)[number];

/** Row lifecycle. `hidden` rows never contribute to an aggregate. */
export const RATING_STATUSES = ["active", "hidden"] as const;
export type RatingStatus = (typeof RATING_STATUSES)[number];

/**
 * Who submitted a rating, independent of how they were identified.
 *
 * The database stores only `raterId`. A future Web cookie and a future iOS
 * installation identity both resolve to one, and persistence never learns
 * which produced it.
 */
export interface RatingIdentity {
  raterId: string;
}

/** What a guest submits. Overall required; the rest optional. */
export interface DiningRatingInput {
  overall: number;
  taste?: number;
  value?: number;
  quality?: number;
}

/** One stored rating. */
export interface DiningRatingRecord {
  id: number;
  venueKey: string;
  raterId: string;
  overall: number;
  taste: number | null;
  value: number | null;
  quality: number | null;
  status: RatingStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Public aggregate.
 *
 * Every optional dimension carries its own count, because a venue can have 40
 * Overall ratings and 6 Value ratings — presenting "4.1 value" without saying
 * it came from 6 people would misrepresent it.
 *
 * An unrated venue is counts of 0 and averages of `null`. Never 0.0, which
 * reads as "rated, and bad".
 */
export interface DiningRatingAggregate {
  venueKey: string;
  ratingCount: number;
  overallAverage: number | null;
  tasteAverage: number | null;
  tasteCount: number;
  valueAverage: number | null;
  valueCount: number;
  qualityAverage: number | null;
  qualityCount: number;
}

/** The aggregate for a venue nobody has rated yet. */
export function emptyDiningRatingAggregate(venueKey: string): DiningRatingAggregate {
  return {
    venueKey,
    ratingCount: 0,
    overallAverage: null,
    tasteAverage: null,
    tasteCount: 0,
    valueAverage: null,
    valueCount: 0,
    qualityAverage: null,
    qualityCount: 0,
  };
}

/** Averages are displayed to one decimal; nulls stay null. */
export function toDisplayAverage(average: number | null): number | null {
  return average === null ? null : Math.round(average * 10) / 10;
}

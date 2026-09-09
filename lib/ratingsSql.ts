/**
 * The exact SQL the ratings API will run in Gate 2.
 *
 * Kept here as constants so the statements are reviewable, testable against a
 * real SQLite database, and identical in tests and production — rather than
 * being inlined in a route handler where nothing can execute them.
 */

/**
 * Public aggregate for one venue.
 *
 * `status = 'active'` is the moderation boundary: a hidden row stays in the
 * table for audit but contributes to nothing.
 *
 * COUNT(col) ignores NULLs, which is what gives each optional dimension its
 * own honest denominator. AVG() likewise ignores NULLs, and returns NULL —
 * never 0 — when a venue has no ratings at all.
 */
export const AGGREGATE_RATINGS_SQL = `
SELECT
  COUNT(overall)  AS rating_count,
  AVG(overall)    AS overall_average,
  COUNT(taste)    AS taste_count,
  AVG(taste)      AS taste_average,
  COUNT(value)    AS value_count,
  AVG(value)      AS value_average,
  COUNT(quality)  AS quality_count,
  AVG(quality)    AS quality_average
FROM dining_ratings
WHERE venue_key = ? AND status = 'active'
`.trim();

/**
 * Submit or revise a rating.
 *
 * One guest holds one current rating per venue, so a resubmission updates the
 * existing row rather than stacking. `created_at` is deliberately absent from
 * the UPDATE clause: it records when the guest first rated the venue and must
 * survive every revision.
 */
export const UPSERT_RATING_SQL = `
INSERT INTO dining_ratings
  (venue_key, rater_id, overall, taste, value, quality, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (venue_key, rater_id) DO UPDATE SET
  overall    = excluded.overall,
  taste      = excluded.taste,
  value      = excluded.value,
  quality    = excluded.quality,
  updated_at = excluded.updated_at
`.trim();

/** One guest's own current rating, for a future `/me` read. */
export const SELECT_MY_RATING_SQL = `
SELECT id, venue_key, rater_id, overall, taste, value, quality, status,
       created_at, updated_at
FROM dining_ratings
WHERE venue_key = ? AND rater_id = ?
`.trim();

/** UTC, sortable, second precision — the format 0001 already uses. */
export function ratingTimestamp(now: Date): string {
  return `${now.toISOString().slice(0, 19)}Z`;
}

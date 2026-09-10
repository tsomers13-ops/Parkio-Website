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

/**
 * Ceiling on one bulk aggregate read.
 *
 * 62 is the entire permanent Dining universe today, so this is roughly 1.6x
 * headroom — enough that adding venues never needs a code change, small
 * enough that the SQL stays a bounded statement rather than an open door.
 */
export const MAX_BULK_VENUE_KEYS = 100;

/**
 * Public overall aggregate for many venues in ONE statement.
 *
 * Discovery cards need only the overall average and its count; Taste, Value
 * and Quality stay on the detail page, so they are deliberately not selected
 * here rather than fetched and thrown away.
 *
 * The only thing interpolated is a run of `?` placeholders derived from the
 * COUNT of keys — never a key itself. Values are bound by the caller. The
 * cap is enforced here too, so an unbounded IN list cannot be built even by a
 * caller that forgot to check.
 *
 * GROUP BY returns a row only for venues that have ratings; callers fill the
 * silent ones in as a real zero. That keeps "nobody rated this" (a fact) and
 * "we could not read the table" (an outage) separable all the way up.
 */
export function bulkAggregateRatingsSql(keyCount: number): string {
  if (!Number.isInteger(keyCount) || keyCount < 1 || keyCount > MAX_BULK_VENUE_KEYS) {
    throw new RangeError(`keyCount must be an integer 1-${MAX_BULK_VENUE_KEYS}`);
  }
  const placeholders = Array.from({ length: keyCount }, () => "?").join(", ");
  return `
SELECT
  venue_key       AS venue_key,
  COUNT(overall)  AS rating_count,
  AVG(overall)    AS overall_average
FROM dining_ratings
WHERE status = 'active' AND venue_key IN (${placeholders})
GROUP BY venue_key
`.trim();
}

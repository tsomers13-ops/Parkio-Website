-- 0002_dining_ratings.sql
-- Community Dining ratings (Priority 9).
--
-- One current rating per (venue_key, rater_id). Resubmission UPSERTs the
-- existing row so a guest cannot stack votes.
--
-- venue_key is the Website-owned immutable identity from lib/diningVenueKeys.ts,
-- NOT the iOS canonicalId (which moves on rename) and NOT the public slug
-- (which is a URL). Ratings must outlive both.
--
-- Whole stars only, 1-5. The typeof() guard is load-bearing and not
-- decorative: SQLite INTEGER affinity does NOT reject a REAL, so the obvious
-- `INTEGER CHECK (overall BETWEEN 1 AND 5)` silently ACCEPTS 1.5, 4.5 and
-- '4.5' and stores them as REAL. That was proven against sqlite3 before this
-- migration was written. Requiring typeof() = 'integer' closes it.
--
-- Deliberately absent: IP address, email, guest name, location, device
-- fingerprint, slug, venue name, written review, festival identity.

CREATE TABLE IF NOT EXISTS dining_ratings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_key   TEXT    NOT NULL,
  rater_id    TEXT    NOT NULL,

  overall     INTEGER NOT NULL
              CHECK (typeof(overall) = 'integer' AND overall BETWEEN 1 AND 5),
  taste       INTEGER
              CHECK (taste   IS NULL OR (typeof(taste)   = 'integer' AND taste   BETWEEN 1 AND 5)),
  value       INTEGER
              CHECK (value   IS NULL OR (typeof(value)   = 'integer' AND value   BETWEEN 1 AND 5)),
  quality     INTEGER
              CHECK (quality IS NULL OR (typeof(quality) = 'integer' AND quality BETWEEN 1 AND 5)),

  -- hidden rows are retained for audit but excluded from every aggregate.
  status      TEXT    NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'hidden')),

  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL,

  UNIQUE (venue_key, rater_id)
);

-- Aggregates always filter by venue and status.
CREATE INDEX IF NOT EXISTS idx_dining_ratings_venue_status
  ON dining_ratings (venue_key, status);

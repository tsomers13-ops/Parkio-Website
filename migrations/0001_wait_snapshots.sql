-- Migration 0001 — wait_snapshots
--
-- One row per attraction-status sample. Written ONLY on cache misses in
-- /api/parks/[parkSlug]/live (i.e., when Parkio actually pulled fresh
-- data from themeparks.wiki). Cached responses never write.
--
-- This is collection-only. No reads from this table are exposed to
-- visitors yet — that's a future iteration. Keep the shape simple so
-- backfill or rewrite is cheap.

CREATE TABLE IF NOT EXISTS wait_snapshots (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,

  -- When PARKIO collected the snapshot. ISO 8601 with Z. Use this for
  -- bucketing/aggregation. Always present.
  taken_at            TEXT NOT NULL,

  -- Park identity. park_slug is Parkio's canonical slug
  -- (magic-kingdom, epcot, hollywood-studios, animal-kingdom,
  -- disneyland, california-adventure). attraction_slug is also Parkio's
  -- canonical slug, derived from disneyParkConfig.ts at write time so
  -- it is stable across upstream renames.
  park_slug           TEXT NOT NULL,
  attraction_slug     TEXT NOT NULL,

  -- Upstream id from themeparks.wiki (the entityId on the live entry).
  -- Useful for joining/auditing if we ever need to reconcile.
  attraction_id       TEXT,

  -- Wait minutes for STANDBY queue. NULL when not measurable
  -- (CLOSED/REFURBISHMENT/DOWN, or a SHOW with no queue).
  wait_minutes        INTEGER,

  -- OPERATING | DOWN | CLOSED | REFURBISHMENT | UNKNOWN
  status              TEXT NOT NULL,

  -- ISO 8601 timestamp the upstream reports as `lastUpdated`.
  -- May be NULL if upstream omitted it. Distinct from taken_at —
  -- two consecutive cache misses can yield the same source_updated_at
  -- if upstream itself hasn't changed.
  source_updated_at   TEXT
);

-- Most common future query: "give me the last N hours of snapshots
-- for a specific park". Composite index on (park_slug, taken_at DESC).
CREATE INDEX IF NOT EXISTS idx_snap_park_taken
  ON wait_snapshots (park_slug, taken_at DESC);

-- Per-attraction history.
CREATE INDEX IF NOT EXISTS idx_snap_attr_taken
  ON wait_snapshots (attraction_slug, taken_at DESC);

-- Global time-series scans (e.g., "anything > 90 min in the last week").
CREATE INDEX IF NOT EXISTS idx_snap_taken
  ON wait_snapshots (taken_at);

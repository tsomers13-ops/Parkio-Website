/**
 * Historical wait-snapshot writer.
 *
 * Persists one row per attraction to Cloudflare D1 each time
 * /api/parks/[parkSlug]/live actually pulled fresh data from
 * themeparks.wiki (i.e., on a cache miss, not on every request).
 *
 * Design rules:
 *   - Write-only. This module never reads from the table.
 *   - Fail-soft. If D1 isn't bound, errors out, or the schema doesn't
 *     exist yet, the API response still succeeds. The writer swallows
 *     errors quietly and logs to console for observability.
 *   - Non-blocking. The route handler is expected to wrap the call in
 *     `ctx.waitUntil(...)` so the user's response returns immediately.
 *   - No shape changes. We map from the already-normalized payload to
 *     a flat row shape — the public API response is untouched.
 *
 * To enable, bind a D1 database called `DB` to the Cloudflare Pages
 * project and run the migration in `migrations/0001_wait_snapshots.sql`.
 * Until that's done, this module is a no-op (returns immediately).
 */

import type { ApiParkLive } from "./types";

/** Minimal D1 surface we use. Avoids pulling in the full @cloudflare/workers-types. */
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<unknown>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(stmts: D1PreparedStatement[]): Promise<unknown>;
}
/**
 * Loosely-typed env. We only check `DB` is duck-typed enough to call
 * `prepare`; we don't enforce the full D1Database shape because the
 * binding's actual runtime class lives in @cloudflare/workers-types,
 * which we deliberately don't depend on.
 */
export interface SnapshotEnv {
  DB?: unknown;
}

const INSERT_SQL = `
INSERT INTO wait_snapshots
  (taken_at, park_slug, attraction_slug, attraction_id, wait_minutes, status, source_updated_at)
VALUES
  (?, ?, ?, ?, ?, ?, ?)
`.trim();

/**
 * Write one snapshot row per attraction in the normalized payload.
 *
 * Idempotency caveat: this does NOT dedupe. The route handler calls it
 * only on cache misses, so duplicate writes for the same source data
 * happen only when the cache is purged unusually fast. If volume becomes
 * a concern (see docs/D1-SETUP.md → Risks), add a debounce here.
 */
export async function persistLiveSnapshots(
  env: SnapshotEnv | undefined,
  payload: ApiParkLive | null | undefined,
): Promise<void> {
  const db = env?.DB as D1Database | undefined;
  if (!db) return; // Binding not configured — silent no-op.
  if (!payload?.attractions?.length) return;

  const takenAt = new Date().toISOString();
  const stmt = db.prepare(INSERT_SQL);

  // Build one prepared+bound statement per attraction. D1's batch() runs
  // them all in a single round trip and a single implicit transaction.
  const statements: D1PreparedStatement[] = payload.attractions.map((a) =>
    stmt.bind(
      takenAt,
      payload.parkSlug,
      a.slug,
      a.id ?? null,
      // wait_minutes: only meaningful when OPERATING. Store null otherwise
      // so downstream queries can filter trivially.
      a.status === "OPERATING" && typeof a.waitMinutes === "number"
        ? a.waitMinutes
        : null,
      a.status ?? "UNKNOWN",
      a.lastUpdated ?? null,
    ),
  );

  try {
    await db.batch(statements);
  } catch (err) {
    // Never throw out of this function. The user's response has already
    // been returned by the time this runs (we're inside waitUntil).
    // eslint-disable-next-line no-console
    console.warn(
      `[history] snapshot write failed for park=${payload.parkSlug}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * D1 persistence for Community Dining ratings.
 *
 * All SQL comes from lib/ratingsSql.ts and every value is bound, never
 * interpolated. Route handlers call these functions; they never build SQL.
 *
 * Reads distinguish three outcomes rather than two, because "nobody has rated
 * this yet" and "we could not reach the database" mean different things to a
 * guest and must not collapse into a fabricated zero.
 */

import {
  AGGREGATE_RATINGS_SQL,
  SELECT_MY_RATING_SQL,
  UPSERT_RATING_SQL,
  ratingTimestamp,
} from "./ratingsSql";
import {
  emptyDiningRatingAggregate,
  type DiningRatingAggregate,
  type DiningRatingInput,
} from "./ratingsTypes";

/** Minimal D1 surface, mirroring lib/historySnapshots.ts. */
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface RatingsDatabase {
  prepare(query: string): D1PreparedStatement;
}

export interface RatingsEnv {
  DB?: unknown;
}

/**
 * The D1 binding. `@cloudflare/next-on-pages` exposes Pages bindings on
 * `process.env`, so `DB` is present in Preview/Production and absent locally.
 */
export function getRatingsDb(): RatingsDatabase | null {
  const env = (globalThis as { process?: { env?: Record<string, unknown> } }).process?.env;
  const db = env?.DB;
  return db && typeof (db as RatingsDatabase).prepare === "function"
    ? (db as RatingsDatabase)
    : null;
}

/** `unavailable` is deliberately distinct from an aggregate of zero. */
export type AggregateResult =
  | { status: "ok"; aggregate: DiningRatingAggregate }
  | { status: "unavailable" };

interface AggregateRow {
  rating_count: number | null;
  overall_average: number | null;
  taste_count: number | null;
  taste_average: number | null;
  value_count: number | null;
  value_average: number | null;
  quality_count: number | null;
  quality_average: number | null;
}

export async function readAggregate(
  db: RatingsDatabase | null,
  venueKey: string,
): Promise<AggregateResult> {
  if (!db) return { status: "unavailable" };
  try {
    const row = await db.prepare(AGGREGATE_RATINGS_SQL).bind(venueKey).first<AggregateRow>();
    if (!row) return { status: "ok", aggregate: emptyDiningRatingAggregate(venueKey) };
    return {
      status: "ok",
      aggregate: {
        venueKey,
        ratingCount: row.rating_count ?? 0,
        overallAverage: row.overall_average ?? null,
        tasteAverage: row.taste_average ?? null,
        tasteCount: row.taste_count ?? 0,
        valueAverage: row.value_average ?? null,
        valueCount: row.value_count ?? 0,
        qualityAverage: row.quality_average ?? null,
        qualityCount: row.quality_count ?? 0,
      },
    };
  } catch {
    // Swallow the detail deliberately: callers get "unavailable", never a
    // database message that could describe our schema to the internet.
    return { status: "unavailable" };
  }
}

/** One guest's own current rating, or null when they have none. */
export interface MyRating {
  overall: number;
  taste: number | null;
  value: number | null;
  quality: number | null;
  updatedAt: string;
}

export type MyRatingResult =
  | { status: "ok"; rating: MyRating | null }
  | { status: "unavailable" };

interface MyRatingRow {
  overall: number;
  taste: number | null;
  value: number | null;
  quality: number | null;
  status: string;
  updated_at: string;
}

export async function readMyRating(
  db: RatingsDatabase | null,
  venueKey: string,
  raterId: string,
): Promise<MyRatingResult> {
  if (!db) return { status: "unavailable" };
  try {
    const row = await db
      .prepare(SELECT_MY_RATING_SQL)
      .bind(venueKey, raterId)
      .first<MyRatingRow>();
    // A hidden row is not the guest's "current rating" for display purposes.
    if (!row || row.status !== "active") return { status: "ok", rating: null };
    return {
      status: "ok",
      rating: {
        overall: row.overall,
        taste: row.taste,
        value: row.value,
        quality: row.quality,
        updatedAt: row.updated_at,
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}

/**
 * Insert or revise this guest's rating.
 *
 * Timestamps are generated here, never accepted from the client, and
 * `created_at` is only used on insert — the UPSERT preserves the original.
 * `status` is never client-controllable; the column default governs it.
 */
export async function upsertRating(
  db: RatingsDatabase,
  venueKey: string,
  raterId: string,
  input: DiningRatingInput,
  now: Date,
): Promise<void> {
  const timestamp = ratingTimestamp(now);
  await db
    .prepare(UPSERT_RATING_SQL)
    .bind(
      venueKey,
      raterId,
      input.overall,
      input.taste ?? null,
      input.value ?? null,
      input.quality ?? null,
      timestamp,
      timestamp,
    )
    .run();
}

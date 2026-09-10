import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MAX_BULK_VENUE_KEYS, parseBulkVenueKeys } from "@/lib/ratingsBulk";
import { readBulkAggregates } from "@/lib/ratingsDb";
import { bulkAggregateRatingsSql } from "@/lib/ratingsSql";

/**
 * The bulk aggregate that lets Dining discovery show a rating on every card
 * without one request per card.
 *
 * Exercised against REAL sqlite3 running the REAL migration, so AVG/COUNT
 * semantics, the status filter and the IN-list binding are proven rather than
 * mocked.
 */

const EP_A = "ep-le-cellier";
const EP_B = "ep-regal-eagle";
const EP_C = "ep-akershus";
const HS_A = "hs-backlot-express";

let dir: string;
let db: string;

function sql(query: string): string {
  return execFileSync("sqlite3", [db, query], { encoding: "utf8" }).trim();
}

function literal(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** D1 double with the multi-row read the bulk path needs. */
function makeDb(failing = false) {
  return {
    prepare(query: string) {
      let bound: unknown[] = [];
      const stmt = {
        bind(...values: unknown[]) {
          bound = values;
          return stmt;
        },
        async first<T>(): Promise<T | null> {
          if (failing) throw new Error("d1 down");
          return (await stmt.all<T>()).results?.[0] ?? null;
        },
        async all<T>(): Promise<{ results?: T[] }> {
          if (failing) throw new Error("d1 down");
          let i = 0;
          const q = query.replace(/\?/g, () => literal(bound[i++]));
          const out = execFileSync("sqlite3", ["-json", db, `${q};`], { encoding: "utf8" }).trim();
          return { results: out ? (JSON.parse(out) as T[]) : [] };
        },
        async run() {
          if (failing) throw new Error("d1 down");
          let i = 0;
          const q = query.replace(/\?/g, () => literal(bound[i++]));
          execFileSync("sqlite3", [db, `${q};`], { encoding: "utf8", stdio: "pipe" });
        },
      };
      return stmt;
    },
  };
}

function insert(venueKey: string, raterId: string, overall: number, status = "active") {
  sql(
    `INSERT INTO dining_ratings (venue_key, rater_id, overall, status, created_at, updated_at)
     VALUES ('${venueKey}', '${raterId}', ${overall}, '${status}', '2026-09-10T00:00:00Z', '2026-09-10T00:00:00Z');`,
  );
}

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "parkio-bulk-"));
  db = path.join(dir, "bulk.db");
  execFileSync(
    "bash",
    ["-c", `sqlite3 "${db}" < "${path.resolve("migrations/0002_dining_ratings.sql")}"`],
    { stdio: "pipe" },
  );
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => sql("DELETE FROM dining_ratings;"));

// ── Query parsing ───────────────────────────────────────────────────────────

describe("parseBulkVenueKeys", () => {
  it("accepts a comma-separated list of known keys", () => {
    const result = parseBulkVenueKeys(`${EP_A},${EP_B}`);
    expect(result).toEqual({ ok: true, venueKeys: [EP_A, EP_B] });
  });

  it("requires the parameter to be present", () => {
    expect(parseBulkVenueKeys(null).ok).toBe(false);
  });

  it("rejects an empty list", () => {
    expect(parseBulkVenueKeys("").ok).toBe(false);
    expect(parseBulkVenueKeys(" , , ").ok).toBe(false);
  });

  it("trims whitespace around keys", () => {
    const result = parseBulkVenueKeys(` ${EP_A} , ${EP_B} `);
    expect(result).toEqual({ ok: true, venueKeys: [EP_A, EP_B] });
  });

  it("collapses a duplicated key to one placeholder", () => {
    const result = parseBulkVenueKeys(`${EP_A},${EP_A},${EP_A}`);
    expect(result).toEqual({ ok: true, venueKeys: [EP_A] });
  });

  it("omits unknown keys instead of failing the whole request", () => {
    const result = parseBulkVenueKeys(`${EP_A},not-a-venue,${EP_B}`);
    expect(result).toEqual({ ok: true, venueKeys: [EP_A, EP_B] });
  });

  it("omits festival booth ids", () => {
    const result = parseBulkVenueKeys(`${EP_A},ep-fw-2026-brazil`);
    expect(result).toEqual({ ok: true, venueKeys: [EP_A] });
  });

  it("omits attraction slugs", () => {
    const result = parseBulkVenueKeys(`${EP_A},test-track,space-mountain`);
    expect(result).toEqual({ ok: true, venueKeys: [EP_A] });
  });

  it("returns an empty key list when nothing requested is a real venue", () => {
    expect(parseBulkVenueKeys("nope,also-nope")).toEqual({ ok: true, venueKeys: [] });
  });

  it("rejects a list longer than the cap", () => {
    const tooMany = Array.from({ length: MAX_BULK_VENUE_KEYS + 1 }, (_, i) => `k${i}`).join(",");
    const result = parseBulkVenueKeys(tooMany);
    expect(result.ok).toBe(false);
  });

  it("applies the cap to the raw list, before unknown keys are filtered out", () => {
    // 200 junk keys would filter down to zero — the cap must still fire.
    const junk = Array.from({ length: 200 }, (_, i) => `junk-${i}`).join(",");
    expect(parseBulkVenueKeys(junk).ok).toBe(false);
  });

  it("accepts the entire permanent universe of 62 venues", () => {
    const all = Array.from({ length: 62 }, () => EP_A).join(",");
    expect(parseBulkVenueKeys(all).ok).toBe(true);
  });
});

// ── SQL construction ────────────────────────────────────────────────────────

describe("bulkAggregateRatingsSql", () => {
  it("emits one placeholder per key and binds nothing inline", () => {
    const query = bulkAggregateRatingsSql(3);
    expect(query).toContain("IN (?, ?, ?)");
    expect(query).toContain("status = 'active'");
  });

  it("selects only overall — no taste, value or quality", () => {
    const query = bulkAggregateRatingsSql(2);
    expect(query).toContain("COUNT(overall)");
    expect(query).toContain("AVG(overall)");
    expect(query).not.toContain("taste");
    expect(query).not.toContain("value");
    expect(query).not.toContain("quality");
  });

  it("refuses to build an unbounded IN list", () => {
    expect(() => bulkAggregateRatingsSql(0)).toThrow(RangeError);
    expect(() => bulkAggregateRatingsSql(MAX_BULK_VENUE_KEYS + 1)).toThrow(RangeError);
    expect(() => bulkAggregateRatingsSql(1.5)).toThrow(RangeError);
  });
});

// ── Reads against real sqlite3 ──────────────────────────────────────────────

describe("readBulkAggregates", () => {
  it("returns one entry per requested key in a single statement", async () => {
    insert(EP_A, "r1", 5);
    insert(EP_A, "r2", 4);
    insert(EP_B, "r1", 3);

    const result = await readBulkAggregates(makeDb(), [EP_A, EP_B, EP_C]);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.ratings[EP_A]).toEqual({ ratingCount: 2, overallAverage: 4.5 });
    expect(result.ratings[EP_B]).toEqual({ ratingCount: 1, overallAverage: 3 });
    // Requested but unrated: a real zero, not a missing key.
    expect(result.ratings[EP_C]).toEqual({ ratingCount: 0, overallAverage: null });
  });

  it("reports a venue with a single rating as count 1", async () => {
    insert(EP_A, "r1", 5);
    const result = await readBulkAggregates(makeDb(), [EP_A]);
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.ratings[EP_A]).toEqual({ ratingCount: 1, overallAverage: 5 });
  });

  it("gives an unrated venue zero and a null average, never 0.0", async () => {
    const result = await readBulkAggregates(makeDb(), [EP_A]);
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.ratings[EP_A].ratingCount).toBe(0);
    expect(result.ratings[EP_A].overallAverage).toBeNull();
  });

  it("excludes hidden rows from both the average and the count", async () => {
    insert(EP_A, "r1", 5);
    insert(EP_A, "r2", 1, "hidden");
    const result = await readBulkAggregates(makeDb(), [EP_A]);
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.ratings[EP_A]).toEqual({ ratingCount: 1, overallAverage: 5 });
  });

  it("never returns a key that was not requested", async () => {
    insert(EP_A, "r1", 5);
    insert(HS_A, "r1", 2);
    const result = await readBulkAggregates(makeDb(), [EP_A]);
    if (result.status !== "ok") throw new Error("expected ok");
    expect(Object.keys(result.ratings)).toEqual([EP_A]);
  });

  it("spans parks in one call", async () => {
    insert(EP_A, "r1", 5);
    insert(HS_A, "r1", 2);
    const result = await readBulkAggregates(makeDb(), [EP_A, HS_A]);
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.ratings[EP_A].overallAverage).toBe(5);
    expect(result.ratings[HS_A].overallAverage).toBe(2);
  });

  it("returns an empty map for an empty request without touching the database", async () => {
    const result = await readBulkAggregates(makeDb(true), []);
    expect(result).toEqual({ status: "ok", ratings: {} });
  });

  it("reports unavailable when the database throws", async () => {
    const result = await readBulkAggregates(makeDb(true), [EP_A]);
    expect(result).toEqual({ status: "unavailable" });
  });

  it("reports unavailable when there is no binding at all", async () => {
    const result = await readBulkAggregates(null, [EP_A]);
    expect(result).toEqual({ status: "unavailable" });
  });

  it("distinguishes a real zero from unavailable", async () => {
    const zero = await readBulkAggregates(makeDb(), [EP_A]);
    const down = await readBulkAggregates(makeDb(true), [EP_A]);
    expect(zero.status).toBe("ok");
    expect(down.status).toBe("unavailable");
  });

  it("uses exactly one prepared statement for many venues", async () => {
    insert(EP_A, "r1", 5);
    let prepares = 0;
    const real = makeDb();
    const counting = {
      prepare(query: string) {
        prepares += 1;
        return real.prepare(query);
      },
    };
    await readBulkAggregates(counting, [EP_A, EP_B, EP_C, HS_A]);
    expect(prepares).toBe(1);
  });
});

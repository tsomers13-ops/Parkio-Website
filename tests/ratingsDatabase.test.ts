import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AGGREGATE_RATINGS_SQL,
  UPSERT_RATING_SQL,
  ratingTimestamp,
} from "@/lib/ratingsSql";

/**
 * Executes the REAL migration file and the REAL SQL constants against sqlite3 —
 * the engine D1 runs. Mocked SQL would not have caught the type-affinity hole
 * these tests exist to guard.
 */

let dir: string;
let db: string;

const run = (sql: string): string =>
  execFileSync("sqlite3", [db, sql], { encoding: "utf8" }).trim();

/** Returns null on success, or the error text when SQLite rejects the write. */
function tryRun(sql: string): string | null {
  try {
    execFileSync("sqlite3", [db, sql], { encoding: "utf8", stdio: "pipe" });
    return null;
  } catch (error) {
    return String((error as { stderr?: Buffer }).stderr ?? error);
  }
}

/** Fill positional placeholders, asserting the statement is otherwise verbatim. */
function bind(sql: string, params: (string | number | null)[]): string {
  const placeholders = sql.split("?").length - 1;
  expect(placeholders).toBe(params.length);
  let i = 0;
  return sql.replace(/\?/g, () => {
    const p = params[i++];
    if (p === null) return "NULL";
    return typeof p === "number" ? String(p) : `'${p.replace(/'/g, "''")}'`;
  });
}

const insert = (
  venue: string,
  rater: string,
  overall: number | string,
  extra: { taste?: number | string; value?: number | string; quality?: number | string; status?: string } = {},
) =>
  tryRun(
    `INSERT INTO dining_ratings (venue_key, rater_id, overall, taste, value, quality, status, created_at, updated_at)
     VALUES ('${venue}', '${rater}', ${overall}, ${extra.taste ?? "NULL"}, ${extra.value ?? "NULL"}, ${extra.quality ?? "NULL"}, '${extra.status ?? "active"}', '2026-09-09T12:00:00Z', '2026-09-09T12:00:00Z');`,
  );

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "parkio-ratings-"));
  db = path.join(dir, "test.db");
  const migration = path.resolve("migrations/0002_dining_ratings.sql");
  execFileSync("bash", ["-c", `sqlite3 "${db}" < "${migration}"`], { stdio: "pipe" });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("0002_dining_ratings migration", () => {
  it("creates the table and its index", () => {
    expect(run(`SELECT name FROM sqlite_master WHERE type='table' AND name='dining_ratings';`))
      .toBe("dining_ratings");
    expect(run(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_dining_ratings_venue_status';`))
      .toBe("idx_dining_ratings_venue_status");
  });

  it("accepts a valid overall-only rating", () => {
    expect(insert("ep-le-cellier", "r1", 4)).toBeNull();
  });

  it("accepts all four dimensions", () => {
    expect(insert("ep-le-cellier", "r2", 5, { taste: 5, value: 4, quality: 5 })).toBeNull();
  });

  it("leaves omitted dimensions NULL rather than zero", () => {
    expect(run(`SELECT COALESCE(taste,'NULL')||'/'||COALESCE(value,'NULL') FROM dining_ratings WHERE rater_id='r1';`))
      .toBe("NULL/NULL");
  });

  it("rejects out-of-range overall", () => {
    for (const bad of [0, 6, -1]) {
      expect(insert("ep-le-cellier", `bad-${bad}`, bad), `overall ${bad}`).not.toBeNull();
    }
  });

  it("rejects half stars — the failure a naive INTEGER CHECK would allow", () => {
    // A plain `INTEGER CHECK (overall BETWEEN 1 AND 5)` accepts these and
    // stores them as REAL. The typeof() guard is what stops them.
    for (const bad of [1.5, 4.5]) {
      expect(insert("ep-le-cellier", `half-${bad}`, bad), `overall ${bad}`).not.toBeNull();
    }
    expect(insert("ep-le-cellier", "half-str", "'4.5'")).not.toBeNull();
  });

  it("rejects non-numeric and absurd values", () => {
    expect(insert("ep-le-cellier", "txt", "'abc'")).not.toBeNull();
    expect(insert("ep-le-cellier", "huge", "9e99")).not.toBeNull();
  });

  it("requires overall", () => {
    expect(insert("ep-le-cellier", "null-overall", "NULL")).not.toBeNull();
  });

  it("applies the same guard to optional dimensions", () => {
    expect(insert("ep-le-cellier", "t1", 4, { taste: 1.5 })).not.toBeNull();
    expect(insert("ep-le-cellier", "t2", 4, { value: 0 })).not.toBeNull();
    expect(insert("ep-le-cellier", "t3", 4, { quality: 6 })).not.toBeNull();
  });

  it("restricts status to active or hidden", () => {
    expect(insert("ep-le-cellier", "bogus-status", 4, { status: "bogus" })).not.toBeNull();
    expect(insert("ep-le-cellier", "r3", 1, { status: "hidden" })).toBeNull();
  });

  it("enforces one rating per (venue_key, rater_id)", () => {
    expect(insert("ep-le-cellier", "r1", 3)).not.toBeNull();
  });

  it("allows the same rater to rate a different venue", () => {
    expect(insert("hs-brown-derby", "r1", 5)).toBeNull();
  });
});

describe("aggregate SQL", () => {
  beforeAll(() => {
    insert("ep-le-cellier", "r4", 3, { taste: 4 });
    insert("ep-le-cellier", "r5", 5, { value: 2 });
  });

  it("gives every optional dimension its own denominator, and excludes hidden", () => {
    const row = run(`${bind(AGGREGATE_RATINGS_SQL, ["ep-le-cellier"])};`);
    const [count, overall, tasteC, tasteA, valueC, valueA, qualityC, qualityA] = row.split("|");
    // active: r1(4) r2(5) r4(3) r5(5) — r3 is hidden and must not count.
    expect(count).toBe("4");
    expect(Number(overall)).toBeCloseTo(4.25, 5);
    expect(tasteC).toBe("2");
    expect(Number(tasteA)).toBeCloseTo(4.5, 5);
    expect(valueC).toBe("2");
    expect(Number(valueA)).toBeCloseTo(3.0, 5);
    expect(qualityC).toBe("1");
    expect(Number(qualityA)).toBeCloseTo(5.0, 5);
  });

  it("returns zero and NULL for an unrated venue, never 0.0", () => {
    const row = run(`${bind(AGGREGATE_RATINGS_SQL, ["ep-garden-grill"])};`);
    const parts = row.split("|");
    expect(parts[0]).toBe("0");
    expect(parts[1]).toBe("");
    expect(parts[2]).toBe("0");
    expect(parts[3]).toBe("");
  });
});

describe("upsert SQL", () => {
  it("revises the existing row and preserves id and created_at", () => {
    const before = run(`SELECT id||'|'||created_at FROM dining_ratings WHERE venue_key='ep-le-cellier' AND rater_id='r1';`);
    const [id, createdAt] = before.split("|");
    const rowsBefore = run(`SELECT COUNT(*) FROM dining_ratings WHERE venue_key='ep-le-cellier';`);

    const updatedAt = ratingTimestamp(new Date("2026-09-10T09:30:00Z"));
    expect(
      tryRun(
        `${bind(UPSERT_RATING_SQL, ["ep-le-cellier", "r1", 2, 3, 2, 3, createdAt, updatedAt])};`,
      ),
    ).toBeNull();

    const after = run(
      `SELECT id||'|'||overall||'|'||taste||'|'||created_at||'|'||updated_at FROM dining_ratings WHERE venue_key='ep-le-cellier' AND rater_id='r1';`,
    ).split("|");
    expect(after[0]).toBe(id);
    expect(after[1]).toBe("2");
    expect(after[2]).toBe("3");
    expect(after[3]).toBe(createdAt);
    expect(after[4]).toBe(updatedAt);
    expect(run(`SELECT COUNT(*) FROM dining_ratings WHERE venue_key='ep-le-cellier';`)).toBe(rowsBefore);
  });

  it("inserts when the identity is new", () => {
    const ts = ratingTimestamp(new Date("2026-09-11T10:00:00Z"));
    expect(tryRun(`${bind(UPSERT_RATING_SQL, ["ep-garden-grill", "new-rater", 5, null, null, null, ts, ts])};`)).toBeNull();
    expect(run(`SELECT COUNT(*) FROM dining_ratings WHERE venue_key='ep-garden-grill';`)).toBe("1");
  });
});

describe("timestamp format", () => {
  it("is UTC, sortable, second precision", () => {
    expect(ratingTimestamp(new Date("2026-09-09T12:34:56.789Z"))).toBe("2026-09-09T12:34:56Z");
  });
});

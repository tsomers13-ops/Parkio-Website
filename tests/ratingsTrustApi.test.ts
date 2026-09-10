import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * The additive trust fields, exercised through the real handlers against real
 * sqlite3 running the real migration.
 *
 * Two things matter here as much as the arithmetic: that the existing fields
 * are untouched (Gate 4 and Gate 7 clients still work), and that a service
 * outage never masquerades as "not ranking eligible".
 */

const VENUE = "ep-le-cellier";
const OTHER = "ep-regal-eagle";

let dir: string;
let db: string;
let GET_ONE: (req: Request, ctx: { params: { venueKey: string } }) => Promise<Response>;
let GET_BULK: (req: Request) => Promise<Response>;

function sql(query: string): string {
  return execFileSync("sqlite3", [db, query], { encoding: "utf8" }).trim();
}
function literal(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

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

const realEnv = process.env;
function setEnv(overrides: Record<string, unknown>) {
  const env = (globalThis as unknown as { process: { env: Record<string, unknown> } }).process.env;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
}

function insert(
  venueKey: string,
  raterId: string,
  overall: number,
  extra: { taste?: number; value?: number; quality?: number; status?: string } = {},
) {
  sql(
    `INSERT INTO dining_ratings (venue_key, rater_id, overall, taste, value, quality, status, created_at, updated_at)
     VALUES ('${venueKey}', '${raterId}', ${overall},
             ${extra.taste ?? "NULL"}, ${extra.value ?? "NULL"}, ${extra.quality ?? "NULL"},
             '${extra.status ?? "active"}', '2026-09-10T00:00:00Z', '2026-09-10T00:00:00Z');`,
  );
}

/** n ratings all of the same value, from n distinct identities. */
function insertMany(venueKey: string, overall: number, n: number, prefix = "r") {
  for (let i = 0; i < n; i += 1) insert(venueKey, `${prefix}${venueKey}${i}`, overall);
}

const oneUrl = (venue = VENUE) =>
  new Request(`https://parkio.info/api/dining/${venue}/ratings`);
const bulkUrl = (query: string) =>
  new Request(`https://parkio.info/api/dining/ratings/${query}`);

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "parkio-trust-"));
  db = path.join(dir, "trust.db");
  execFileSync(
    "bash",
    ["-c", `sqlite3 "${db}" < "${path.resolve("migrations/0002_dining_ratings.sql")}"`],
    { stdio: "pipe" },
  );
  Object.defineProperty(globalThis.process, "env", {
    value: {} as Record<string, unknown>,
    writable: true,
    configurable: true,
  });
  setEnv({ DB: makeDb(), RATINGS_IDENTITY_SECRET: "test-secret-not-real" });

  GET_ONE = (await import("@/app/api/dining/[venueKey]/ratings/route")).GET as typeof GET_ONE;
  GET_BULK = (await import("@/app/api/dining/ratings/route")).GET as typeof GET_BULK;
});

afterAll(() => {
  Object.defineProperty(globalThis.process, "env", {
    value: realEnv,
    writable: true,
    configurable: true,
  });
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  sql("DELETE FROM dining_ratings;");
  setEnv({ DB: makeDb() });
});

// ── Bulk endpoint ───────────────────────────────────────────────────────────

describe("bulk aggregate trust fields", () => {
  it("marks a venue with 5+ ratings eligible and scores it", async () => {
    insertMany(VENUE, 5, 5);
    const body = (await (await GET_BULK(bulkUrl(`?venueKeys=${VENUE}`))).json()) as {
      ratings: Record<string, Record<string, unknown>>;
    };
    const entry = body.ratings[VENUE];

    expect(entry.ratingCount).toBe(5);
    expect(entry.overallAverage).toBe(5);
    expect(entry.rankingEligible).toBe(true);
    // (10*4 + 5*5) / 15
    expect(entry.rankingScore).toBeCloseTo(4.3333333, 6);
  });

  it("marks a low-sample venue ineligible but keeps its public numbers", async () => {
    insertMany(VENUE, 5, 4);
    const body = (await (await GET_BULK(bulkUrl(`?venueKeys=${VENUE}`))).json()) as {
      ratings: Record<string, Record<string, unknown>>;
    };
    const entry = body.ratings[VENUE];

    // Display threshold and trust threshold are different things.
    expect(entry.ratingCount).toBe(4);
    expect(entry.overallAverage).toBe(5);
    expect(entry.rankingEligible).toBe(false);
    expect(entry.rankingScore).toBeNull();
  });

  it("marks an unrated venue ineligible without inventing an average", async () => {
    const body = (await (await GET_BULK(bulkUrl(`?venueKeys=${VENUE}`))).json()) as {
      ratings: Record<string, Record<string, unknown>>;
    };
    const entry = body.ratings[VENUE];

    expect(entry.ratingCount).toBe(0);
    expect(entry.overallAverage).toBeNull();
    expect(entry.rankingEligible).toBe(false);
    expect(entry.rankingScore).toBeNull();
  });

  it("still omits unknown keys", async () => {
    const body = (await (await GET_BULK(bulkUrl(`?venueKeys=${VENUE},not-a-venue`))).json()) as {
      ratings: Record<string, unknown>;
    };
    expect(Object.keys(body.ratings)).toEqual([VENUE]);
  });

  it("still 400s on a missing parameter", async () => {
    expect((await GET_BULK(bulkUrl(""))).status).toBe(400);
  });

  it("returns 503 on a database failure — NOT an ineligible aggregate", async () => {
    setEnv({ DB: makeDb(true) });
    const res = await GET_BULK(bulkUrl(`?venueKeys=${VENUE}`));

    // An outage is not the same as an unranked venue.
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("ratings_unavailable");
    expect(body).not.toHaveProperty("ratings");
    expect(body).not.toHaveProperty("rankingEligible");
  });

  it("keeps caching and cookie behaviour unchanged", async () => {
    const res = await GET_BULK(bulkUrl(`?venueKeys=${VENUE}`));
    expect(res.headers.get("cache-control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=120",
    );
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("scores venues independently in one response", async () => {
    insertMany(VENUE, 5, 10, "a");
    insertMany(OTHER, 4, 10, "b");
    const body = (await (await GET_BULK(bulkUrl(`?venueKeys=${VENUE},${OTHER}`))).json()) as {
      ratings: Record<string, { rankingScore: number }>;
    };
    expect(body.ratings[VENUE].rankingScore).toBeGreaterThan(body.ratings[OTHER].rankingScore);
  });
});

// ── Single-venue endpoint ───────────────────────────────────────────────────

describe("single aggregate trust fields", () => {
  it("carries the same fields as bulk", async () => {
    insertMany(VENUE, 5, 5);
    const one = (await (await GET_ONE(oneUrl(), { params: { venueKey: VENUE } })).json()) as
      Record<string, unknown>;
    const bulk = (await (await GET_BULK(bulkUrl(`?venueKeys=${VENUE}`))).json()) as {
      ratings: Record<string, Record<string, unknown>>;
    };

    // One shared function — the two endpoints cannot disagree.
    expect(one.rankingEligible).toBe(bulk.ratings[VENUE].rankingEligible);
    expect(one.rankingScore).toBe(bulk.ratings[VENUE].rankingScore);
  });

  it("preserves every pre-existing field", async () => {
    insertMany(VENUE, 4, 5);
    const body = (await (await GET_ONE(oneUrl(), { params: { venueKey: VENUE } })).json()) as
      Record<string, unknown>;

    for (const key of [
      "venueKey", "ratingCount", "overallAverage",
      "tasteAverage", "tasteCount",
      "valueAverage", "valueCount",
      "qualityAverage", "qualityCount",
    ]) {
      expect(body).toHaveProperty(key);
    }
    expect(body.venueKey).toBe(VENUE);
  });

  it("still 404s an unknown venue", async () => {
    const res = await GET_ONE(oneUrl("nope"), { params: { venueKey: "nope" } });
    expect(res.status).toBe(404);
  });
});

// ── Trust inputs ────────────────────────────────────────────────────────────

describe("what feeds the trust calculation", () => {
  it("excludes hidden ratings from count, average AND eligibility", async () => {
    insertMany(VENUE, 5, 4);                        // 4 active
    insert(VENUE, "hidden-1", 1, { status: "hidden" });
    insert(VENUE, "hidden-2", 1, { status: "hidden" });

    const body = (await (await GET_BULK(bulkUrl(`?venueKeys=${VENUE}`))).json()) as {
      ratings: Record<string, Record<string, unknown>>;
    };
    const entry = body.ratings[VENUE];

    // Six rows exist; only four count, so the venue is still below threshold.
    expect(sql(`SELECT COUNT(*) FROM dining_ratings WHERE venue_key='${VENUE}';`)).toBe("6");
    expect(entry.ratingCount).toBe(4);
    expect(entry.overallAverage).toBe(5);
    expect(entry.rankingEligible).toBe(false);
  });

  it("hiding a rating can remove a venue from eligibility", async () => {
    insertMany(VENUE, 5, 5);
    let body = (await (await GET_BULK(bulkUrl(`?venueKeys=${VENUE}`))).json()) as {
      ratings: Record<string, Record<string, unknown>>;
    };
    expect(body.ratings[VENUE].rankingEligible).toBe(true);

    sql(`UPDATE dining_ratings SET status='hidden' WHERE venue_key='${VENUE}' AND rater_id='r${VENUE}0';`);

    body = (await (await GET_BULK(bulkUrl(`?venueKeys=${VENUE}`))).json()) as {
      ratings: Record<string, Record<string, unknown>>;
    };
    expect(body.ratings[VENUE].ratingCount).toBe(4);
    expect(body.ratings[VENUE].rankingEligible).toBe(false);
  });

  it("optional dimensions cannot alter the ranking result", async () => {
    // Same five Overall values; wildly different Taste/Value/Quality.
    insertMany(VENUE, 4, 5, "plain");
    const plain = (await (await GET_BULK(bulkUrl(`?venueKeys=${VENUE}`))).json()) as {
      ratings: Record<string, { rankingScore: number; rankingEligible: boolean }>;
    };

    sql("DELETE FROM dining_ratings;");
    for (let i = 0; i < 5; i += 1) {
      insert(VENUE, `dim${i}`, 4, { taste: 1, value: 1, quality: 1 });
    }
    const dimmed = (await (await GET_BULK(bulkUrl(`?venueKeys=${VENUE}`))).json()) as {
      ratings: Record<string, { rankingScore: number; rankingEligible: boolean }>;
    };

    expect(dimmed.ratings[VENUE].rankingScore).toBe(plain.ratings[VENUE].rankingScore);
    expect(dimmed.ratings[VENUE].rankingEligible).toBe(plain.ratings[VENUE].rankingEligible);
  });

  it("an UPSERT revises a rating without adding evidence", async () => {
    insertMany(VENUE, 5, 5);
    // Same identity changes their mind 5 -> 2.
    sql(`UPDATE dining_ratings SET overall=2, updated_at='2026-09-11T00:00:00Z'
         WHERE venue_key='${VENUE}' AND rater_id='r${VENUE}0';`);

    const body = (await (await GET_BULK(bulkUrl(`?venueKeys=${VENUE}`))).json()) as {
      ratings: Record<string, { ratingCount: number; overallAverage: number }>;
    };

    // Count unchanged, average reflects the CURRENT rating only.
    expect(body.ratings[VENUE].ratingCount).toBe(5);
    expect(body.ratings[VENUE].overallAverage).toBeCloseTo((5 * 4 + 2) / 5, 6);
    expect(sql(`SELECT COUNT(*) FROM dining_ratings WHERE venue_key='${VENUE}';`)).toBe("5");
  });
});

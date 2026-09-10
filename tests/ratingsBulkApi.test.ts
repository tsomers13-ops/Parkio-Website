import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MAX_BULK_VENUE_KEYS } from "@/lib/ratingsBulk";

/**
 * The public bulk aggregate endpoint, exercised through the real handler
 * against real sqlite3.
 *
 * This route is the one new piece of public API surface in Gate 4, so the
 * things it must NOT do are tested as carefully as the things it must.
 */

const EP_A = "ep-le-cellier";
const EP_B = "ep-regal-eagle";
const EP_C = "ep-akershus";

let dir: string;
let db: string;
let GET: (req: Request) => Promise<Response>;

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

const get = (query: string) =>
  new Request(`https://parkio.info/api/dining/ratings/${query}`);

function insert(venueKey: string, raterId: string, overall: number, status = "active") {
  sql(
    `INSERT INTO dining_ratings (venue_key, rater_id, overall, status, created_at, updated_at)
     VALUES ('${venueKey}', '${raterId}', ${overall}, '${status}', '2026-09-10T00:00:00Z', '2026-09-10T00:00:00Z');`,
  );
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "parkio-bulkapi-"));
  db = path.join(dir, "bulk.db");
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
  setEnv({ DB: makeDb() });
  const route = await import("@/app/api/dining/ratings/route");
  GET = route.GET as typeof GET;
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

describe("GET /api/dining/ratings/", () => {
  it("returns an aggregate for each requested venue", async () => {
    insert(EP_A, "r1", 5);
    insert(EP_A, "r2", 4);
    insert(EP_B, "r1", 3);

    const res = await GET(get(`?venueKeys=${EP_A},${EP_B},${EP_C}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ratings: Record<string, unknown> };

    // toMatchObject: entries also carry the additive trust fields. Below the
    // five-rating threshold none of these is rankable.
    expect(body.ratings[EP_A]).toMatchObject({ ratingCount: 2, overallAverage: 4.5 });
    expect(body.ratings[EP_B]).toMatchObject({ ratingCount: 1, overallAverage: 3 });
    expect(body.ratings[EP_C]).toMatchObject({ ratingCount: 0, overallAverage: null });
  });

  it("is publicly cacheable, matching the single-venue aggregate", async () => {
    const res = await GET(get(`?venueKeys=${EP_A}`));
    expect(res.headers.get("cache-control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=120",
    );
  });

  it("mints no identity cookie", async () => {
    insert(EP_A, "r1", 5);
    const res = await GET(get(`?venueKeys=${EP_A}`));
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("exposes only a count and an average — no rater, status or timestamps", async () => {
    insert(EP_A, "r1", 5);
    const res = await GET(get(`?venueKeys=${EP_A}`));
    const raw = await res.text();

    expect(raw).not.toMatch(/rater|rater_id|raterId/i);
    expect(raw).not.toMatch(/status|active|hidden/i);
    expect(raw).not.toMatch(/created_at|updated_at|createdAt|updatedAt/i);
    expect(raw).not.toMatch(/taste|value|quality/i);
    expect(JSON.parse(raw).ratings[EP_A]).toMatchObject({ ratingCount: 1, overallAverage: 5 });
    // Still nothing beyond the public numbers and the trust signal.
    expect(Object.keys(JSON.parse(raw).ratings[EP_A]).sort()).toEqual([
      "overallAverage", "rankingEligible", "rankingScore", "ratingCount",
    ]);
  });

  it("rejects a missing venueKeys parameter", async () => {
    const res = await GET(get(""));
    expect(res.status).toBe(400);
  });

  it("rejects an empty venueKeys parameter", async () => {
    expect((await GET(get("?venueKeys="))).status).toBe(400);
  });

  it("rejects an absurd number of keys", async () => {
    const tooMany = Array.from({ length: MAX_BULK_VENUE_KEYS + 1 }, (_, i) => `k${i}`).join(",");
    const res = await GET(get(`?venueKeys=${tooMany}`));
    expect(res.status).toBe(400);
  });

  it("omits unknown keys rather than failing the request", async () => {
    insert(EP_A, "r1", 4);
    const res = await GET(get(`?venueKeys=${EP_A},totally-made-up`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ratings: Record<string, unknown> };
    expect(Object.keys(body.ratings)).toEqual([EP_A]);
  });

  it("omits festival booth ids", async () => {
    const res = await GET(get(`?venueKeys=${EP_A},ep-fw-2026-brazil`));
    const body = (await res.json()) as { ratings: Record<string, unknown> };
    expect(Object.keys(body.ratings)).toEqual([EP_A]);
  });

  it("omits attraction slugs", async () => {
    const res = await GET(get(`?venueKeys=${EP_A},test-track`));
    const body = (await res.json()) as { ratings: Record<string, unknown> };
    expect(Object.keys(body.ratings)).toEqual([EP_A]);
  });

  it("returns an empty map when no requested key is a real venue", async () => {
    const res = await GET(get("?venueKeys=nope,also-nope"));
    expect(res.status).toBe(200);
    expect((await res.json()).ratings).toEqual({});
  });

  it("excludes hidden rows", async () => {
    insert(EP_A, "r1", 5);
    insert(EP_A, "r2", 1, "hidden");
    const res = await GET(get(`?venueKeys=${EP_A}`));
    const body = (await res.json()) as { ratings: Record<string, { ratingCount: number }> };
    expect(body.ratings[EP_A].ratingCount).toBe(1);
  });

  it("reports 503 — not an empty map — when the database is down", async () => {
    setEnv({ DB: makeDb(true) });
    const res = await GET(get(`?venueKeys=${EP_A}`));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("ratings_unavailable");
  });

  it("reports 503 when there is no D1 binding", async () => {
    setEnv({ DB: undefined });
    const res = await GET(get(`?venueKeys=${EP_A}`));
    expect(res.status).toBe(503);
  });

  it("leaks no database detail on failure", async () => {
    setEnv({ DB: makeDb(true) });
    const raw = await (await GET(get(`?venueKeys=${EP_A}`))).text();
    expect(raw).not.toMatch(/sqlite|d1 down|dining_ratings|SELECT/i);
  });

  it("exposes no write verb", async () => {
    const route = await import("@/app/api/dining/ratings/route");
    expect((route as Record<string, unknown>).POST).toBeUndefined();
    expect((route as Record<string, unknown>).PUT).toBeUndefined();
    expect((route as Record<string, unknown>).DELETE).toBeUndefined();
  });

  it("runs on the edge runtime, like the rest of the dining routes", async () => {
    const route = await import("@/app/api/dining/ratings/route");
    expect((route as { runtime?: string }).runtime).toBe("edge");
  });
});

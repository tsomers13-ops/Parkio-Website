import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { RATER_COOKIE_NAME } from "@/lib/ratingsIdentity";

/**
 * Route tests run against a D1 double backed by REAL sqlite3 executing the
 * REAL migration — so the CHECK constraints, UNIQUE index and UPSERT that
 * protect the data are exercised through the actual handlers, not stubbed.
 */

const SECRET = "test-identity-secret-not-real";
const VENUE = "ep-le-cellier";
const ORIGIN = "https://parkio.info";

let dir: string;
let db: string;
let GET: (req: Request, ctx: { params: { venueKey: string } }) => Promise<Response>;
let POST: (req: Request, ctx: { params: { venueKey: string } }) => Promise<Response>;
let ME: (req: Request, ctx: { params: { venueKey: string } }) => Promise<Response>;

function sql(query: string): string {
  return execFileSync("sqlite3", [db, query], { encoding: "utf8" }).trim();
}

function literal(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** Minimal D1 double: binds params then executes through sqlite3. */
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
          let i = 0;
          const q = query.replace(/\?/g, () => literal(bound[i++]));
          const out = execFileSync("sqlite3", ["-json", db, `${q};`], { encoding: "utf8" }).trim();
          if (!out) return null;
          return (JSON.parse(out) as T[])[0] ?? null;
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

/**
 * Node's real `process.env` coerces every value to a string, which would turn
 * the D1 double into "[object Object]". Swap in a plain object so bindings
 * survive, exactly as they do on the Cloudflare runtime.
 */
const realEnv = process.env;
function installTestEnv() {
  Object.defineProperty(globalThis.process, "env", {
    value: {} as Record<string, unknown>,
    writable: true,
    configurable: true,
  });
}
function restoreEnv() {
  Object.defineProperty(globalThis.process, "env", {
    value: realEnv,
    writable: true,
    configurable: true,
  });
}
function setEnv(overrides: Record<string, unknown>) {
  const env = (globalThis as unknown as { process: { env: Record<string, unknown> } }).process.env;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
}

const post = (body: unknown, init: RequestInit = {}) => {
  const { headers, ...rest } = init;
  return new Request(`https://parkio.info/api/dining/${VENUE}/ratings`, {
    method: "POST",
    ...rest,
    headers: {
      origin: ORIGIN,
      "content-type": "application/json",
      ...((headers ?? {}) as Record<string, string>),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
};

const get = (venue = VENUE, headers: Record<string, string> = {}) =>
  new Request(`https://parkio.info/api/dining/${venue}/ratings`, { headers });

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "parkio-api-"));
  db = path.join(dir, "api.db");
  execFileSync("bash", ["-c", `sqlite3 "${db}" < "${path.resolve("migrations/0002_dining_ratings.sql")}"`], { stdio: "pipe" });
  installTestEnv();
  setEnv({ DB: makeDb(), RATINGS_IDENTITY_SECRET: SECRET });
  const main = await import("@/app/api/dining/[venueKey]/ratings/route");
  const me = await import("@/app/api/dining/[venueKey]/ratings/me/route");
  GET = main.GET as typeof GET;
  POST = main.POST as typeof POST;
  ME = me.GET as typeof ME;
});

afterAll(() => {
  restoreEnv();
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  sql("DELETE FROM dining_ratings;");
  setEnv({ DB: makeDb(), RATINGS_IDENTITY_SECRET: SECRET });
});

describe("aggregate GET", () => {
  it("returns an explicit zero state, not a fabricated one", async () => {
    const res = await GET(get(), { params: { venueKey: VENUE } });
    expect(res.status).toBe(200);
    const body = await res.json();
    // toMatchObject, not toEqual: the response also carries the additive
    // trust fields. What this test is about is that a zero state is an
    // explicit set of nulls and zeroes, never a fabricated 0.0.
    expect(body).toMatchObject({
      venueKey: VENUE,
      ratingCount: 0,
      overallAverage: null,
      tasteAverage: null,
      tasteCount: 0,
      valueAverage: null,
      valueCount: 0,
      qualityAverage: null,
      qualityCount: 0,
    });
    // An unrated venue is not rankable, and its score is absent rather than 0.
    expect(body).toMatchObject({ rankingEligible: false, rankingScore: null });
  });

  it("never sets an identity cookie", async () => {
    const res = await GET(get(), { params: { venueKey: VENUE } });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("carries a short edge cache", async () => {
    const res = await GET(get(), { params: { venueKey: VENUE } });
    expect(res.headers.get("cache-control")).toContain("s-maxage=60");
  });

  it("404s unknown venues, canonicalIds and festival ids", async () => {
    for (const bad of ["ep-nope", "EPCOT|World Showcase|Le Cellier Steakhouse", "ep-fw-2026-italy", "hs-rise"]) {
      const res = await GET(get(bad), { params: { venueKey: bad } });
      expect(res.status, bad).toBe(404);
    }
  });

  it("reports unavailable rather than zero when the database fails", async () => {
    setEnv({ DB: makeDb(true) });
    const res = await GET(get(), { params: { venueKey: VENUE } });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("ratings_unavailable");
    expect(JSON.stringify(body)).not.toContain("ratingCount");
  });
});

describe("POST", () => {
  it("stores a rating and mints a signed identity", async () => {
    const res = await POST(post({ overall: 4, taste: 5 }), { params: { venueKey: VENUE } });
    expect(res.status).toBe(201);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain(`${RATER_COOKIE_NAME}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    const value = cookie.split(";")[0].split("=")[1];
    expect(value.split(".")).toHaveLength(2);

    const body = await res.json();
    expect(body.rating).toEqual({ overall: 4, taste: 5, value: null, quality: null });
    expect(body.aggregate.ratingCount).toBe(1);
    expect(sql("SELECT COUNT(*) FROM dining_ratings;")).toBe("1");
  });

  it("upserts on resubmission instead of stacking, preserving created_at", async () => {
    const first = await POST(post({ overall: 4 }), { params: { venueKey: VENUE } });
    const cookie = first.headers.get("set-cookie")!.split(";")[0];
    const created = sql("SELECT created_at FROM dining_ratings;");

    const second = await POST(post({ overall: 2, value: 3 }, { headers: { cookie } }), {
      params: { venueKey: VENUE },
    });
    expect(second.status).toBe(200);
    expect(second.headers.get("set-cookie")).toBeNull();

    expect(sql("SELECT COUNT(*) FROM dining_ratings;")).toBe("1");
    expect(sql("SELECT overall FROM dining_ratings;")).toBe("2");
    expect(sql("SELECT created_at FROM dining_ratings;")).toBe(created);
    const body = await second.json();
    expect(body.aggregate.ratingCount).toBe(1);
  });

  it("never leaks identity internals in the response", async () => {
    const res = await POST(post({ overall: 5 }), { params: { venueKey: VENUE } });
    const text = await res.text();
    const raterId = sql("SELECT rater_id FROM dining_ratings;");
    expect(text).not.toContain(raterId);
    expect(text).not.toContain(SECRET);
    for (const leak of ["raterId", "rater_id", "signature", "status", "created_at", "updated_at"]) {
      expect(text, leak).not.toContain(leak);
    }
  });

  it("ignores client attempts to control identity, status or timestamps", async () => {
    const res = await POST(
      post({ overall: 3, raterId: "attacker", status: "hidden", created_at: "1999-01-01T00:00:00Z" }),
      { params: { venueKey: VENUE } },
    );
    expect(res.status).toBe(400);
    expect(sql("SELECT COUNT(*) FROM dining_ratings;")).toBe("0");
  });

  it("rejects a tampered cookie by minting a fresh identity rather than trusting it", async () => {
    const forged = `${"a".repeat(32)}.deadbeef`;
    const res = await POST(post({ overall: 5 }, { headers: { cookie: `${RATER_COOKIE_NAME}=${forged}` } }), {
      params: { venueKey: VENUE },
    });
    expect(res.status).toBe(201);
    expect(res.headers.get("set-cookie")).toContain(RATER_COOKIE_NAME);
    expect(sql("SELECT rater_id FROM dining_ratings;")).not.toBe("a".repeat(32));
  });

  it("rejects cross-site origins", async () => {
    for (const origin of ["https://evil.com", "https://parkio.info.evil.com"]) {
      const res = await POST(post({ overall: 4 }, { headers: { origin } }), { params: { venueKey: VENUE } });
      expect(res.status, origin).toBe(403);
    }
    const noOrigin = new Request(`https://parkio.info/api/dining/${VENUE}/ratings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ overall: 4 }),
    });
    expect((await POST(noOrigin, { params: { venueKey: VENUE } })).status).toBe(403);
    expect(sql("SELECT COUNT(*) FROM dining_ratings;")).toBe("0");
  });

  it("rejects non-JSON content types", async () => {
    for (const ct of ["text/plain", "application/x-www-form-urlencoded"]) {
      const res = await POST(post({ overall: 4 }, { headers: { "content-type": ct } }), {
        params: { venueKey: VENUE },
      });
      expect(res.status, ct).toBe(415);
    }
  });

  it("rejects oversized and malformed bodies", async () => {
    expect((await POST(post("x".repeat(2000)), { params: { venueKey: VENUE } })).status).toBe(413);
    expect((await POST(post("{not json"), { params: { venueKey: VENUE } })).status).toBe(400);
  });

  it("rejects every invalid rating value", async () => {
    for (const bad of [{}, { taste: 4 }, { overall: 0 }, { overall: 6 }, { overall: -1 }, { overall: 4.5 }, { overall: "4" }, { overall: true }, { overall: null }, { overall: 4, taste: 0 }, { overall: 4, nope: 1 }]) {
      const res = await POST(post(bad), { params: { venueKey: VENUE } });
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect(sql("SELECT COUNT(*) FROM dining_ratings;")).toBe("0");
  });

  it("404s unknown, canonicalId and festival targets before touching the database", async () => {
    for (const bad of ["ep-nope", "ep-fw-2026-italy", "EPCOT|World Showcase|Le Cellier Steakhouse"]) {
      const req = new Request(`https://parkio.info/api/dining/${encodeURIComponent(bad)}/ratings`, {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ overall: 4 }),
      });
      expect((await POST(req, { params: { venueKey: bad } })).status, bad).toBe(404);
    }
  });

  it("fails explicitly when the database write fails — never a fake success", async () => {
    setEnv({ DB: makeDb(true) });
    const res = await POST(post({ overall: 4 }), { params: { venueKey: VENUE } });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/ratings_(write_failed|unavailable)/);
  });

  it("refuses to write when the signing secret is missing", async () => {
    setEnv({ RATINGS_IDENTITY_SECRET: undefined });
    const res = await POST(post({ overall: 4 }), { params: { venueKey: VENUE } });
    expect(res.status).toBe(503);
    expect(sql("SELECT COUNT(*) FROM dining_ratings;")).toBe("0");
  });

  it("keeps hidden rows out of the aggregate", async () => {
    await POST(post({ overall: 5 }), { params: { venueKey: VENUE } });
    sql("UPDATE dining_ratings SET status='hidden';");
    const res = await GET(get(), { params: { venueKey: VENUE } });
    expect((await res.json()).ratingCount).toBe(0);
  });
});

describe("GET /me", () => {
  it("reports no rating and sets no cookie for an anonymous visitor", async () => {
    const res = await ME(get(), { params: { venueKey: VENUE } });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ venueKey: VENUE, rating: null });
  });

  it("returns the guest's own rating after they submit one", async () => {
    const submitted = await POST(post({ overall: 4, quality: 5 }), { params: { venueKey: VENUE } });
    const cookie = submitted.headers.get("set-cookie")!.split(";")[0];
    const res = await ME(get(VENUE, { cookie }), { params: { venueKey: VENUE } });
    const body = await res.json();
    expect(body.rating.overall).toBe(4);
    expect(body.rating.quality).toBe(5);
    expect(body.rating.taste).toBeNull();
    expect(JSON.stringify(body)).not.toContain("rater");
  });

  it("treats a tampered cookie as no rating, without saying why", async () => {
    await POST(post({ overall: 4 }), { params: { venueKey: VENUE } });
    const forged = `${RATER_COOKIE_NAME}=${"b".repeat(32)}.forged`;
    const res = await ME(get(VENUE, { cookie: forged }), { params: { venueKey: VENUE } });
    expect(await res.json()).toEqual({ venueKey: VENUE, rating: null });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("404s unknown and festival venues", async () => {
    for (const bad of ["ep-nope", "ep-fw-2026-italy"]) {
      expect((await ME(get(bad), { params: { venueKey: bad } })).status, bad).toBe(404);
    }
  });
});

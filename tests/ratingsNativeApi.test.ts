import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { RATER_COOKIE_NAME } from "@/lib/ratingsIdentity";

/**
 * The native client path, exercised through the real handlers against real
 * sqlite3 running the real migration.
 *
 * Two things are being proven at once: that a native client can participate,
 * and that letting it in did not open a door for anyone else.
 */

const SECRET = "test-identity-secret-not-real";
const VENUE = "ep-le-cellier";
const ORIGIN = "https://parkio.info";

let dir: string;
let db: string;
let GET: (req: Request, ctx: { params: { venueKey: string } }) => Promise<Response>;
let POST: (req: Request, ctx: { params: { venueKey: string } }) => Promise<Response>;
let ME: (req: Request, ctx: { params: { venueKey: string } }) => Promise<Response>;
let mintPost: (req: Request) => Promise<Response>;

/**
 * The mint handler as Next actually calls it: with a Request. It is
 * host-authorized, so the hostname is part of a realistic invocation and not
 * an incidental detail — see tests/ratingsWriteHost.test.ts for the policy.
 */
const ISSUE = () =>
  mintPost(new Request("https://parkio.info/api/identity/anonymous", { method: "POST" }));

function sql(query: string): string {
  return execFileSync("sqlite3", [db, query], { encoding: "utf8" }).trim();
}
function literal(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

function makeDb() {
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
          let i = 0;
          const q = query.replace(/\?/g, () => literal(bound[i++]));
          const out = execFileSync("sqlite3", ["-json", db, `${q};`], { encoding: "utf8" }).trim();
          return { results: out ? (JSON.parse(out) as T[]) : [] };
        },
        async run() {
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

/** A native POST: bearer credential, JSON, and deliberately NO Origin. */
const nativePost = (credential: string | null, body: unknown, venue = VENUE) => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (credential) headers.authorization = `Bearer ${credential}`;
  return new Request(`https://parkio.info/api/dining/${venue}/ratings`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
};

const browserPost = (body: unknown, cookie?: string) =>
  new Request(`https://parkio.info/api/dining/${VENUE}/ratings`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "content-type": "application/json",
      ...(cookie ? { cookie: `${RATER_COOKIE_NAME}=${cookie}` } : {}),
    },
    body: JSON.stringify(body),
  });

const nativeGet = (credential: string | null, venue = VENUE) =>
  new Request(`https://parkio.info/api/dining/${venue}/ratings/me`, {
    headers: credential ? { authorization: `Bearer ${credential}` } : {},
  });

async function issueCredential(): Promise<string> {
  const res = await ISSUE();
  expect(res.status).toBe(201);
  return ((await res.json()) as { credential: string }).credential;
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "parkio-native-"));
  db = path.join(dir, "native.db");
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
  setEnv({ DB: makeDb(), RATINGS_IDENTITY_SECRET: SECRET });

  const main = await import("@/app/api/dining/[venueKey]/ratings/route");
  const me = await import("@/app/api/dining/[venueKey]/ratings/me/route");
  const identity = await import("@/app/api/identity/anonymous/route");
  GET = main.GET as typeof GET;
  POST = main.POST as typeof POST;
  ME = me.GET as typeof ME;
  mintPost = identity.POST as typeof mintPost;
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
  setEnv({ DB: makeDb(), RATINGS_IDENTITY_SECRET: SECRET });
});

// ── Identity issuance ───────────────────────────────────────────────────────

describe("POST /api/identity/anonymous/", () => {
  it("issues a credential", async () => {
    const res = await ISSUE();
    expect(res.status).toBe(201);
    const body = (await res.json()) as { credential: string };
    expect(body.credential).toMatch(/^v1\.[0-9a-f]{32}\..+$/);
  });

  it("is never cached", async () => {
    expect((await ISSUE()).headers.get("cache-control")).toBe("no-store");
  });

  it("sets no cookie", async () => {
    expect((await ISSUE()).headers.get("set-cookie")).toBeNull();
  });

  it("returns nothing but the credential", async () => {
    const body = (await (await ISSUE()).json()) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["credential"]);
  });

  it("writes no database row — identity alone is not a rating", async () => {
    await ISSUE();
    expect(sql("SELECT COUNT(*) FROM dining_ratings;")).toBe("0");
  });

  it("gives every caller a different identity", async () => {
    const a = await issueCredential();
    const b = await issueCredential();
    expect(a).not.toBe(b);
  });

  it("never leaks the signing secret", async () => {
    const raw = await (await ISSUE()).text();
    expect(raw).not.toContain(SECRET);
  });

  it("fails closed when no secret is configured", async () => {
    setEnv({ RATINGS_IDENTITY_SECRET: undefined });
    expect((await ISSUE()).status).toBe(503);
  });
});

// ── Native write path ───────────────────────────────────────────────────────

describe("native rating submission", () => {
  it("creates a rating with 201 and no Origin header at all", async () => {
    const credential = await issueCredential();
    const res = await POST(nativePost(credential, { overall: 4 }), { params: { venueKey: VENUE } });

    expect(res.status).toBe(201);
    expect(sql("SELECT COUNT(*) FROM dining_ratings;")).toBe("1");
  });

  it("never hands a native client a cookie", async () => {
    const credential = await issueCredential();
    const res = await POST(nativePost(credential, { overall: 4 }), { params: { venueKey: VENUE } });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("updates with 200 and does not stack the count", async () => {
    const credential = await issueCredential();
    await POST(nativePost(credential, { overall: 4 }), { params: { venueKey: VENUE } });
    const second = await POST(nativePost(credential, { overall: 2, taste: 5 }), {
      params: { venueKey: VENUE },
    });

    expect(second.status).toBe(200);
    expect(sql("SELECT COUNT(*) FROM dining_ratings;")).toBe("1");
    expect(sql(`SELECT overall FROM dining_ratings WHERE venue_key = '${VENUE}';`)).toBe("2");
    expect(sql(`SELECT taste FROM dining_ratings WHERE venue_key = '${VENUE}';`)).toBe("5");
  });

  it("omits unanswered dimensions rather than zeroing them", async () => {
    const credential = await issueCredential();
    await POST(nativePost(credential, { overall: 3, value: 4 }), { params: { venueKey: VENUE } });
    expect(sql(`SELECT COALESCE(taste, 'NULL') FROM dining_ratings;`)).toBe("NULL");
    expect(sql(`SELECT value FROM dining_ratings;`)).toBe("4");
  });

  it("gives two native identities two rows, one aggregate", async () => {
    const a = await issueCredential();
    const b = await issueCredential();
    await POST(nativePost(a, { overall: 5 }), { params: { venueKey: VENUE } });
    await POST(nativePost(b, { overall: 3 }), { params: { venueKey: VENUE } });

    expect(sql("SELECT COUNT(*) FROM dining_ratings;")).toBe("2");
    const res = await GET(new Request("https://parkio.info/x"), { params: { venueKey: VENUE } });
    const body = (await res.json()) as { ratingCount: number; overallAverage: number };
    expect(body.ratingCount).toBe(2);
    expect(body.overallAverage).toBe(4);
  });

  it("shares one community with the browser", async () => {
    // This is the whole point of the gate: a website rating and an app rating
    // land in the same aggregate, not in separate per-platform counters.
    const credential = await issueCredential();
    await POST(nativePost(credential, { overall: 5 }), { params: { venueKey: VENUE } });
    await POST(browserPost({ overall: 3 }), { params: { venueKey: VENUE } });

    const res = await GET(new Request("https://parkio.info/x"), { params: { venueKey: VENUE } });
    const body = (await res.json()) as { ratingCount: number; overallAverage: number };
    expect(body.ratingCount).toBe(2);
    expect(body.overallAverage).toBe(4);
    expect(sql("SELECT COUNT(DISTINCT rater_id) FROM dining_ratings;")).toBe("2");
  });

  it("rejects an invalid credential with 401 and writes nothing", async () => {
    const res = await POST(nativePost("v1.deadbeef.nope", { overall: 4 }), {
      params: { venueKey: VENUE },
    });
    expect(res.status).toBe(401);
    expect(sql("SELECT COUNT(*) FROM dining_ratings;")).toBe("0");
  });

  it("rejects a credential signed with the wrong secret", async () => {
    const credential = await issueCredential();
    setEnv({ RATINGS_IDENTITY_SECRET: "rotated-secret" });
    const res = await POST(nativePost(credential, { overall: 4 }), { params: { venueKey: VENUE } });
    expect(res.status).toBe(401);
  });

  it("still validates whole stars", async () => {
    const credential = await issueCredential();
    for (const bad of [{ overall: 0 }, { overall: 6 }, { overall: 4.5 }, { overall: "4" }]) {
      const res = await POST(nativePost(credential, bad), { params: { venueKey: VENUE } });
      expect(res.status).toBe(400);
    }
    expect(sql("SELECT COUNT(*) FROM dining_ratings;")).toBe("0");
  });

  it("still rejects extra fields", async () => {
    const credential = await issueCredential();
    const res = await POST(nativePost(credential, { overall: 4, status: "active" }), {
      params: { venueKey: VENUE },
    });
    expect(res.status).toBe(400);
  });

  it("still rejects festival, attraction and unknown venues", async () => {
    const credential = await issueCredential();
    for (const venue of ["ep-fw-2026-brazil", "test-track", "not-a-venue"]) {
      const res = await POST(nativePost(credential, { overall: 4 }, venue), {
        params: { venueKey: venue },
      });
      expect(res.status).toBe(404);
    }
  });

  it("leaks neither the secret nor the rater id", async () => {
    const credential = await issueCredential();
    const res = await POST(nativePost(credential, { overall: 4 }), { params: { venueKey: VENUE } });
    const raw = await res.text();
    const raterId = sql("SELECT rater_id FROM dining_ratings;");

    expect(raw).not.toContain(SECRET);
    expect(raw).not.toContain(raterId);
    expect(raw).not.toMatch(/rater/i);
  });
});

// ── Native read path ────────────────────────────────────────────────────────

describe("native personal read", () => {
  it("returns the guest's own rating", async () => {
    const credential = await issueCredential();
    await POST(nativePost(credential, { overall: 4, taste: 5 }), { params: { venueKey: VENUE } });

    const res = await ME(nativeGet(credential), { params: { venueKey: VENUE } });
    const body = (await res.json()) as {
      rating: Record<string, unknown> | null;
    };

    expect(res.status).toBe(200);
    expect(body.rating).toMatchObject({ overall: 4, taste: 5, value: null, quality: null });
    // The contract also carries updatedAt; the iOS model ignores it rather
    // than modelling a timestamp it has no use for.
    expect(body.rating).toHaveProperty("updatedAt");
  });

  it("returns null before the guest has rated", async () => {
    const credential = await issueCredential();
    const res = await ME(nativeGet(credential), { params: { venueKey: VENUE } });
    expect((await res.json()).rating).toBeNull();
  });

  it("does not see another identity's rating", async () => {
    const a = await issueCredential();
    const b = await issueCredential();
    await POST(nativePost(a, { overall: 5 }), { params: { venueKey: VENUE } });

    const res = await ME(nativeGet(b), { params: { venueKey: VENUE } });
    expect((await res.json()).rating).toBeNull();
  });

  it("rejects an invalid credential rather than saying 'no rating'", async () => {
    const res = await ME(nativeGet("v1.deadbeef.nope"), { params: { venueKey: VENUE } });
    expect(res.status).toBe(401);
  });

  it("mints no identity", async () => {
    const credential = await issueCredential();
    const res = await ME(nativeGet(credential), { params: { venueKey: VENUE } });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("still answers 'no rating' to a caller with no identity at all", async () => {
    const res = await ME(nativeGet(null), { params: { venueKey: VENUE } });
    expect(res.status).toBe(200);
    expect((await res.json()).rating).toBeNull();
  });
});

// ── The browser path must be exactly as it was ──────────────────────────────

describe("browser path is unchanged", () => {
  it("still requires a valid Origin", async () => {
    const res = await POST(
      new Request(`https://parkio.info/api/dining/${VENUE}/ratings`, {
        method: "POST",
        headers: { origin: "https://evil.example", "content-type": "application/json" },
        body: JSON.stringify({ overall: 4 }),
      }),
      { params: { venueKey: VENUE } },
    );
    expect(res.status).toBe(403);
  });

  it("still rejects a POST with no Origin at all", async () => {
    const res = await POST(
      new Request(`https://parkio.info/api/dining/${VENUE}/ratings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ overall: 4 }),
      }),
      { params: { venueKey: VENUE } },
    );
    expect(res.status).toBe(403);
  });

  it("CANNOT skip the Origin guard by sending a junk bearer token", async () => {
    // The security property that makes the native path safe to add: opting
    // into the native path commits you to proving a real credential.
    const res = await POST(
      new Request(`https://parkio.info/api/dining/${VENUE}/ratings`, {
        method: "POST",
        headers: { authorization: "Bearer not-a-real-credential", "content-type": "application/json" },
        body: JSON.stringify({ overall: 4 }),
      }),
      { params: { venueKey: VENUE } },
    );
    expect(res.status).toBe(401);
    expect(sql("SELECT COUNT(*) FROM dining_ratings;")).toBe("0");
  });

  it("still mints a cookie on a browser's first rating", async () => {
    const res = await POST(browserPost({ overall: 4 }), { params: { venueKey: VENUE } });
    expect(res.status).toBe(201);
    expect(res.headers.get("set-cookie")).toContain(RATER_COOKIE_NAME);
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("still updates without a second cookie", async () => {
    const first = await POST(browserPost({ overall: 4 }), { params: { venueKey: VENUE } });
    const cookie = first.headers.get("set-cookie")!.split(";")[0].split("=")[1];

    const second = await POST(browserPost({ overall: 2 }, cookie), { params: { venueKey: VENUE } });
    expect(second.status).toBe(200);
    expect(second.headers.get("set-cookie")).toBeNull();
    expect(sql("SELECT COUNT(*) FROM dining_ratings;")).toBe("1");
  });

  it("still reads a browser's own rating by cookie", async () => {
    const first = await POST(browserPost({ overall: 4 }), { params: { venueKey: VENUE } });
    const cookie = first.headers.get("set-cookie")!.split(";")[0].split("=")[1];

    const res = await ME(
      new Request(`https://parkio.info/api/dining/${VENUE}/ratings/me`, {
        headers: { cookie: `${RATER_COOKIE_NAME}=${cookie}` },
      }),
      { params: { venueKey: VENUE } },
    );
    expect((await res.json()).rating.overall).toBe(4);
  });

  it("still keeps the public aggregate unauthenticated and cookie-free", async () => {
    const res = await GET(new Request("https://parkio.info/x"), { params: { venueKey: VENUE } });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("cache-control")).toContain("s-maxage=60");
  });
});

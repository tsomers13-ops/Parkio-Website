import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { COMMUNITY_WRITE_ENV_VAR } from "@/lib/ratingsWriteHost";

/**
 * Source-IP rate limiting, exercised through the real route handlers against
 * real sqlite3 running the real migration.
 *
 * The limiter binding is Cloudflare infrastructure, so it is stubbed at the
 * one seam that reaches it — lib/cloudflareEnv's getRateLimiter — with a
 * counter that implements the real contract (`limit({key}) -> {success}`).
 * Everything else in the chain is genuine: host gate, Origin check, bearer
 * verification, payload validation and the D1 UPSERT.
 *
 * These tests are deterministic and hermetic. They do not call Cloudflare.
 */

const SECRET = "test-identity-secret-not-real";
const VENUE = "ep-le-cellier";
const HOST = "preview.parkio.pages.dev";
const IP = "203.0.113.7";

let dir: string;
let db: string;
let POST: (req: Request, ctx: { params: Promise<{ venueKey: string }> }) => Promise<Response>;
let GET: (req: Request, ctx: { params: Promise<{ venueKey: string }> }) => Promise<Response>;
let BULK: (req: Request) => Promise<Response>;
let MINT: (req: Request) => Promise<Response>;

/** Per-namespace counters, mirroring Cloudflare's real semantics. */
const counters = new Map<string, number>();
const limits: Record<string, number> = {
  IDENTITY_MINT_LIMITER: 5,
  RATING_WRITE_LIMITER: 10,
};
/** Every key the limiter was asked about, so we can assert on the key used. */
const seenKeys: string[] = [];
let bindingPresent = true;

vi.mock("@/lib/cloudflareEnv", () => ({
  getCloudflareContextEnv: () => null,
  getRateLimiter: (name: string) => {
    if (!bindingPresent) return null;
    return {
      async limit({ key }: { key: string }) {
        seenKeys.push(key);
        const id = `${name}:${key}`;
        const used = (counters.get(id) ?? 0) + 1;
        counters.set(id, used);
        return { success: used <= limits[name] };
      },
    };
  },
}));

function sql(query: string): string {
  return execFileSync("sqlite3", [db, query], { encoding: "utf8" }).trim();
}
function rows(): number {
  return Number(sql("SELECT COUNT(*) FROM dining_ratings;"));
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
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
}

const ctx = { params: Promise.resolve({ venueKey: VENUE }) };

/** A browser-shaped rating POST from an allowed Preview host, with a client IP. */
const ratingPost = (ip: string | null = IP, body: unknown = { overall: 5 }) => {
  const headers: Record<string, string> = {
    origin: `https://${HOST}`,
    "content-type": "application/json",
  };
  if (ip) headers["CF-Connecting-IP"] = ip;
  return new Request(`https://${HOST}/api/dining/${VENUE}/ratings`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
};

const mintPost = (ip: string | null = IP, host = HOST) => {
  const headers: Record<string, string> = {};
  if (ip) headers["CF-Connecting-IP"] = ip;
  return new Request(`https://${host}/api/identity/anonymous`, { method: "POST", headers });
};

const ratingGet = () => new Request(`https://${HOST}/api/dining/${VENUE}/ratings`);
const bulkGet = () =>
  new Request(`https://${HOST}/api/dining/ratings?venueKeys=${VENUE}`);

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "parkio-rl-"));
  db = path.join(dir, "rl.db");
  execFileSync(
    "bash",
    ["-c", `sqlite3 "${db}" < "${path.resolve("migrations/0002_dining_ratings.sql")}"`],
    { stdio: "pipe" },
  );
  installTestEnv();
  setEnv({ DB: makeDb(), RATINGS_IDENTITY_SECRET: SECRET, [COMMUNITY_WRITE_ENV_VAR]: "preview" });
  const main = await import("@/app/api/dining/[venueKey]/ratings/route");
  const bulk = await import("@/app/api/dining/ratings/route");
  const mint = await import("@/app/api/identity/anonymous/route");
  POST = main.POST as typeof POST;
  GET = main.GET as typeof GET;
  BULK = bulk.GET as typeof BULK;
  MINT = mint.POST as typeof MINT;
});

afterAll(() => {
  restoreEnv();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  sql("DELETE FROM dining_ratings;");
  counters.clear();
  seenKeys.length = 0;
  bindingPresent = true;
  setEnv({ DB: makeDb(), RATINGS_IDENTITY_SECRET: SECRET, [COMMUNITY_WRITE_ENV_VAR]: "preview" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("identity mint limiter — 5 per 60s per IP", () => {
  it("allows requests 1–5 and blocks the 6th", async () => {
    for (let n = 1; n <= 5; n += 1) {
      const res = await MINT(mintPost());
      expect(res.status, `request ${n}`).toBe(201);
      expect(typeof (await res.json()).credential).toBe("string");
    }
    const blocked = await MINT(mintPost());
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({
      error: "rate_limited",
      message: "Too many requests. Please slow down.",
      status: 429,
    });
    expect(blocked.headers.get("cache-control")).toBe("no-store");
  });

  it("mints nothing once blocked", async () => {
    for (let n = 0; n < 5; n += 1) await MINT(mintPost());
    const blocked = await MINT(mintPost());
    const body = await blocked.json();
    expect(body.credential).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });

  it("counts per IP, so one guest cannot exhaust another's allowance", async () => {
    for (let n = 0; n < 5; n += 1) await MINT(mintPost("198.51.100.1"));
    expect((await MINT(mintPost("198.51.100.1"))).status).toBe(429);
    // A different address is untouched.
    expect((await MINT(mintPost("198.51.100.2"))).status).toBe(201);
  });
});

describe("rating write limiter — 10 per 60s per IP", () => {
  it("allows requests 1–10 and blocks the 11th", async () => {
    for (let n = 1; n <= 10; n += 1) {
      const res = await POST(ratingPost(), ctx);
      expect([200, 201], `request ${n} status ${res.status}`).toContain(res.status);
    }
    const blocked = await POST(ratingPost(), ctx);
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toBe("rate_limited");
  });

  it("rejects before touching D1", async () => {
    for (let n = 0; n < 10; n += 1) await POST(ratingPost(), ctx);
    const before = rows();
    const blocked = await POST(ratingPost(), ctx);
    expect(blocked.status).toBe(429);
    // The 429 added nothing. UPSERT means the 10 allowed writes are one row.
    expect(rows()).toBe(before);
  });

  it("still enforces Origin after the limiter allows the request", async () => {
    const noOrigin = new Request(`https://${HOST}/api/dining/${VENUE}/ratings`, {
      method: "POST",
      headers: { "content-type": "application/json", "CF-Connecting-IP": IP },
      body: JSON.stringify({ overall: 5 }),
    });
    const res = await POST(noOrigin, ctx);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("forbidden_origin");
    expect(rows()).toBe(0);
  });

  it("still rejects an invalid bearer after the limiter allows the request", async () => {
    const req = new Request(`https://${HOST}/api/dining/${VENUE}/ratings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "CF-Connecting-IP": IP,
        authorization: "Bearer v1.deadbeefdeadbeefdeadbeefdeadbeef.nope",
      },
      body: JSON.stringify({ overall: 5 }),
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(401);
    expect(rows()).toBe(0);
  });

  it("still rejects an invalid payload after the limiter allows the request", async () => {
    const res = await POST(ratingPost(IP, { overall: 9 }), ctx);
    expect(res.status).toBe(400);
    expect(rows()).toBe(0);
  });
});

describe("the two namespaces are independent", () => {
  it("exhausting the mint limiter leaves rating writes working", async () => {
    for (let n = 0; n < 5; n += 1) await MINT(mintPost());
    expect((await MINT(mintPost())).status).toBe(429);

    const write = await POST(ratingPost(), ctx);
    expect([200, 201]).toContain(write.status);
  });

  it("exhausting the rating limiter leaves minting working", async () => {
    for (let n = 0; n < 10; n += 1) await POST(ratingPost(), ctx);
    expect((await POST(ratingPost(), ctx)).status).toBe(429);

    expect((await MINT(mintPost())).status).toBe(201);
  });
});

describe("reads are never rate limited", () => {
  it("leaves the single aggregate GET untouched after the write limiter is exhausted", async () => {
    for (let n = 0; n < 11; n += 1) await POST(ratingPost(), ctx);
    for (let n = 0; n < 25; n += 1) {
      expect((await GET(ratingGet(), ctx)).status).toBe(200);
    }
  });

  it("leaves the bulk aggregate GET untouched, and it consumes no allowance", async () => {
    for (let n = 0; n < 30; n += 1) {
      expect((await BULK(bulkGet())).status).toBe(200);
    }
    // 30 reads later, the full write allowance is still available.
    for (let n = 1; n <= 10; n += 1) {
      expect([200, 201], `write ${n}`).toContain((await POST(ratingPost(), ctx)).status);
    }
  });

  it("never consults the limiter for a GET", async () => {
    await GET(ratingGet(), ctx);
    await BULK(bulkGet());
    expect(seenKeys).toHaveLength(0);
  });
});

describe("the host gate runs before the limiter", () => {
  it("refuses a disallowed host without spending allowance", async () => {
    // Production hosts have no write authority in the preview environment.
    const res = await MINT(mintPost(IP, "parkio.info"));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("forbidden_host");
    // Nothing was counted, so the full allowance survives.
    expect(seenKeys).toHaveLength(0);
    for (let n = 1; n <= 5; n += 1) {
      expect((await MINT(mintPost())).status, `mint ${n}`).toBe(201);
    }
  });
});

describe("key selection and privacy", () => {
  it("keys on CF-Connecting-IP and nothing else", async () => {
    await MINT(mintPost("192.0.2.55"));
    expect(seenKeys).toEqual(["192.0.2.55"]);
  });

  it("ignores client-supplied forwarding headers", async () => {
    const spoofed = new Request(`https://${HOST}/api/identity/anonymous`, {
      method: "POST",
      headers: { "X-Forwarded-For": "198.51.100.99", "CF-Connecting-IP": "192.0.2.55" },
    });
    await MINT(spoofed);
    expect(seenKeys).toEqual(["192.0.2.55"]);
    expect(seenKeys).not.toContain("198.51.100.99");
  });

  it("never persists the IP in the rating row", async () => {
    await POST(ratingPost("192.0.2.77"), ctx);
    const dump = sql("SELECT * FROM dining_ratings;");
    expect(dump).not.toContain("192.0.2.77");
    // And the schema has no column that could hold one.
    expect(sql("PRAGMA table_info(dining_ratings);").toLowerCase()).not.toContain("ip");
  });

  it("never returns the IP to the caller", async () => {
    const res = await POST(ratingPost("192.0.2.88"), ctx);
    const text = JSON.stringify(await res.json()) + [...res.headers].join(";");
    expect(text).not.toContain("192.0.2.88");
  });
});

describe("documented fail-open cases", () => {
  it("allows the write when no limiter binding exists (local / Pages build)", async () => {
    bindingPresent = false;
    for (let n = 0; n < 12; n += 1) {
      expect([200, 201]).toContain((await POST(ratingPost(), ctx)).status);
    }
  });

  it("allows the write when CF-Connecting-IP is absent, rather than inventing a key", async () => {
    for (let n = 0; n < 12; n += 1) {
      expect([200, 201]).toContain((await POST(ratingPost(null), ctx)).status);
    }
    // Nothing was keyed, because there was no trustworthy key to use.
    expect(seenKeys).toHaveLength(0);
  });
});

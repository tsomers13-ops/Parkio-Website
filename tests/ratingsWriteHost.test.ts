import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  COMMUNITY_WRITE_ENV_VAR,
  isAllowedCommunityWriteHost,
  readCommunityWriteEnvironment,
} from "@/lib/ratingsWriteHost";

/**
 * Host authorization for Community writes, proven through the real route
 * handlers against real sqlite3 running the real migration.
 *
 * The thing under test is a bypass, not a feature: Cloudflare Pages publishes
 * this Worker on parkio.pages.dev and on an immutable alias for every past
 * deployment, each bound to the same Production database. So every assertion
 * about a rejected host also asserts that no row was written and no
 * credential was minted.
 */

const SECRET = "test-identity-secret-not-real";
const VENUE = "ep-le-cellier";
const VALID_BODY = { overall: 5, taste: 5, value: 4, quality: 5 };

let dir: string;
let db: string;
let POST: (req: Request, ctx: { params: { venueKey: string } }) => Promise<Response>;
let GET: (req: Request, ctx: { params: { venueKey: string } }) => Promise<Response>;
let MINT: (req: Request) => Promise<Response>;

function sql(query: string): string {
  return execFileSync("sqlite3", [db, query], { encoding: "utf8" }).trim();
}
function ratingRows(): number {
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
function setEnv(overrides: Record<string, unknown>) {
  const env = (globalThis as unknown as { process: { env: Record<string, unknown> } }).process.env;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
}

/** A browser-shaped rating POST aimed at an explicit host. */
const postTo = (host: string, venue = VENUE) =>
  new Request(`https://${host}/api/dining/${venue}/ratings`, {
    method: "POST",
    headers: { origin: `https://${host}`, "content-type": "application/json" },
    body: JSON.stringify(VALID_BODY),
  });

const mintTo = (host: string) =>
  new Request(`https://${host}/api/identity/anonymous`, { method: "POST" });

const getFrom = (host: string, venue = VENUE) =>
  new Request(`https://${host}/api/dining/${venue}/ratings`);

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "parkio-host-"));
  db = path.join(dir, "host.db");
  execFileSync(
    "bash",
    ["-c", `sqlite3 "${db}" < "${path.resolve("migrations/0002_dining_ratings.sql")}"`],
    { stdio: "pipe" },
  );
  installTestEnv();
  setEnv({ DB: makeDb(), RATINGS_IDENTITY_SECRET: SECRET });
  const main = await import("@/app/api/dining/[venueKey]/ratings/route");
  const mint = await import("@/app/api/identity/anonymous/route");
  POST = main.POST as typeof POST;
  GET = main.GET as typeof GET;
  MINT = mint.POST as typeof MINT;
});

afterAll(() => {
  restoreEnv();
  rmSync(dir, { recursive: true, force: true });
});

function restoreEnv() {
  Object.defineProperty(globalThis.process, "env", {
    value: realEnv,
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  sql("DELETE FROM dining_ratings;");
  // No PARKIO_COMMUNITY_WRITE_ENV: the default must already be Production.
  setEnv({ DB: makeDb(), RATINGS_IDENTITY_SECRET: SECRET, [COMMUNITY_WRITE_ENV_VAR]: undefined });
});

describe("environment resolution", () => {
  it("treats an absent variable as Production, the narrowest policy", () => {
    expect(readCommunityWriteEnvironment(undefined)).toBe("production");
    expect(readCommunityWriteEnvironment("")).toBe("production");
    expect(readCommunityWriteEnvironment("   ")).toBe("production");
  });

  it("accepts the three known environments, case-insensitively", () => {
    expect(readCommunityWriteEnvironment("production")).toBe("production");
    expect(readCommunityWriteEnvironment("PREVIEW")).toBe("preview");
    expect(readCommunityWriteEnvironment(" development ")).toBe("development");
  });

  it("treats an unrecognized value as unknown, not as a default", () => {
    expect(readCommunityWriteEnvironment("staging")).toBe("unknown");
    expect(readCommunityWriteEnvironment("prod")).toBe("unknown");
    expect(readCommunityWriteEnvironment(42)).toBe("unknown");
  });

  it("grants an unknown environment no write authority at all", () => {
    expect(isAllowedCommunityWriteHost("parkio.info", "unknown")).toBe(false);
    expect(isAllowedCommunityWriteHost("localhost", "unknown")).toBe(false);
    expect(isAllowedCommunityWriteHost("abc.parkio.pages.dev", "unknown")).toBe(false);
  });
});

describe("host policy per environment", () => {
  it("allows only the canonical hosts in Production", () => {
    expect(isAllowedCommunityWriteHost("parkio.info", "production")).toBe(true);
    expect(isAllowedCommunityWriteHost("www.parkio.info", "production")).toBe(true);
    expect(isAllowedCommunityWriteHost("parkio.pages.dev", "production")).toBe(false);
    expect(isAllowedCommunityWriteHost("9ca196f7.parkio.pages.dev", "production")).toBe(false);
    expect(isAllowedCommunityWriteHost("localhost", "production")).toBe(false);
  });

  it("rejects lookalikes that a suffix or substring test would accept", () => {
    expect(isAllowedCommunityWriteHost("parkio.info.attacker.example", "production")).toBe(false);
    expect(isAllowedCommunityWriteHost("attacker-parkio.info", "production")).toBe(false);
    expect(isAllowedCommunityWriteHost("evilparkio.pages.dev", "preview")).toBe(false);
    expect(isAllowedCommunityWriteHost("parkio.pages.dev.attacker.example", "preview")).toBe(false);
  });

  it("allows any Preview alias in Preview without naming one", () => {
    expect(isAllowedCommunityWriteHost("9ca196f7.parkio.pages.dev", "preview")).toBe(true);
    expect(isAllowedCommunityWriteHost("feature-branch.parkio.pages.dev", "preview")).toBe(true);
    expect(isAllowedCommunityWriteHost("localhost", "preview")).toBe(true);
  });

  it("does not give Preview Production write authority", () => {
    expect(isAllowedCommunityWriteHost("parkio.info", "preview")).toBe(false);
    expect(isAllowedCommunityWriteHost("www.parkio.info", "preview")).toBe(false);
  });

  it("limits development to local hosts", () => {
    expect(isAllowedCommunityWriteHost("localhost", "development")).toBe(true);
    expect(isAllowedCommunityWriteHost("127.0.0.1", "development")).toBe(true);
    expect(isAllowedCommunityWriteHost("[::1]", "development")).toBe(true);
    expect(isAllowedCommunityWriteHost("parkio.info", "development")).toBe(false);
    expect(isAllowedCommunityWriteHost("abc.parkio.pages.dev", "development")).toBe(false);
  });

  it("rejects an empty hostname in every environment", () => {
    for (const env of ["production", "preview", "development", "unknown"] as const) {
      expect(isAllowedCommunityWriteHost("", env)).toBe(false);
    }
  });
});

describe("rating write, host gate through the real handler", () => {
  it("lets parkio.info through the host gate and into the normal path", async () => {
    const res = await POST(postTo("parkio.info"), { params: { venueKey: VENUE } });
    expect(res.status).toBe(201);
    expect(ratingRows()).toBe(1);
  });

  it("lets www.parkio.info through as well", async () => {
    const res = await POST(postTo("www.parkio.info"), { params: { venueKey: VENUE } });
    expect(res.status).toBe(201);
    expect(ratingRows()).toBe(1);
  });

  for (const host of [
    "parkio.pages.dev",
    "9ca196f7.parkio.pages.dev",
    "main.parkio.pages.dev",
    "attacker.example",
    "parkio.info.attacker.example",
    "attacker-parkio.info",
  ]) {
    it(`refuses ${host} with 403 and writes nothing`, async () => {
      const res = await POST(postTo(host), { params: { venueKey: VENUE } });
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("forbidden_host");
      expect(ratingRows()).toBe(0);
    });
  }

  it("refuses an unauthorized host before revealing whether a venue exists", async () => {
    const res = await POST(postTo("parkio.pages.dev", "not-a-real-venue"), {
      params: { venueKey: "not-a-real-venue" },
    });
    // 403, not 404: the host gate runs first, so venue keys are not probeable
    // from a hostname that has no write authority.
    expect(res.status).toBe(403);
    expect(ratingRows()).toBe(0);
  });

  it("normalizes an uppercase hostname and an explicit port", async () => {
    const upper = new Request(`https://PARKIO.INFO/api/dining/${VENUE}/ratings`, {
      method: "POST",
      headers: { origin: "https://parkio.info", "content-type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    expect((await POST(upper, { params: { venueKey: VENUE } })).status).toBe(201);

    sql("DELETE FROM dining_ratings;");
    const ported = new Request(`https://parkio.info:443/api/dining/${VENUE}/ratings`, {
      method: "POST",
      headers: { origin: "https://parkio.info", "content-type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    expect((await POST(ported, { params: { venueKey: VENUE } })).status).toBe(201);

    sql("DELETE FROM dining_ratings;");
    const upperAlias = new Request(`https://ABC123.PARKIO.PAGES.DEV/api/dining/${VENUE}/ratings`, {
      method: "POST",
      headers: { origin: "https://abc123.parkio.pages.dev", "content-type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    expect((await POST(upperAlias, { params: { venueKey: VENUE } })).status).toBe(403);
    expect(ratingRows()).toBe(0);
  });

  it("refuses every host when the environment is unknown", async () => {
    setEnv({ [COMMUNITY_WRITE_ENV_VAR]: "staging" });
    const res = await POST(postTo("parkio.info"), { params: { venueKey: VENUE } });
    expect(res.status).toBe(403);
    expect(ratingRows()).toBe(0);
  });

  it("accepts a Preview alias only when the environment says Preview", async () => {
    setEnv({ [COMMUNITY_WRITE_ENV_VAR]: "preview" });
    const res = await POST(postTo("9ca196f7.parkio.pages.dev"), { params: { venueKey: VENUE } });
    expect(res.status).toBe(201);
    expect(ratingRows()).toBe(1);
  });
});

describe("identity mint, host gate through the real handler", () => {
  it("mints for parkio.info", async () => {
    const res = await MINT(mintTo("parkio.info"));
    expect(res.status).toBe(201);
    expect(typeof (await res.json()).credential).toBe("string");
  });

  for (const host of ["parkio.pages.dev", "9ca196f7.parkio.pages.dev", "attacker.example"]) {
    it(`refuses to mint for ${host}, and leaks nothing`, async () => {
      const res = await MINT(mintTo(host));
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("forbidden_host");
      // No credential, and no trace of the signing secret anywhere in the
      // response — body or headers.
      expect(body.credential).toBeUndefined();
      const serialized = JSON.stringify(body) + [...res.headers].join(";");
      expect(serialized).not.toContain(SECRET);
      expect(ratingRows()).toBe(0);
    });
  }
});

describe("public reads are untouched", () => {
  it("serves the aggregate GET through pages.dev exactly as before", async () => {
    await POST(postTo("parkio.info"), { params: { venueKey: VENUE } });

    const viaPages = await GET(getFrom("parkio.pages.dev"), { params: { venueKey: VENUE } });
    expect(viaPages.status).toBe(200);
    const body = await viaPages.json();
    expect(body.ratingCount).toBe(1);

    const viaAlias = await GET(getFrom("9ca196f7.parkio.pages.dev"), {
      params: { venueKey: VENUE },
    });
    expect(viaAlias.status).toBe(200);
    expect((await viaAlias.json()).ratingCount).toBe(1);
  });

  it("serves the aggregate GET through an arbitrary host, the POST guard being POST-only", async () => {
    const res = await GET(getFrom("attacker.example"), { params: { venueKey: VENUE } });
    expect(res.status).toBe(200);
  });
});

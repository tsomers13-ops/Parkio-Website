import { describe, expect, it } from "vitest";

import {
  RATER_COOKIE_MAX_AGE_SECONDS,
  RATER_COOKIE_NAME,
  RATINGS_SECRET_ENV,
  createRaterId,
  encodeRaterCookie,
  readCookie,
  serializeRaterCookie,
  signRaterId,
  verifyRaterCookie,
} from "@/lib/ratingsIdentity";
import { isAllowedWriteOrigin, isJsonContentType } from "@/lib/ratingsOrigin";

const SECRET = "test-secret-not-a-real-one";
const OTHER_SECRET = "a-different-test-secret";

describe("rater identity", () => {
  it("mints opaque 128-bit ids that do not repeat", () => {
    const ids = new Set(Array.from({ length: 200 }, () => createRaterId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("signs and verifies a round trip", async () => {
    const id = createRaterId();
    const cookie = await encodeRaterCookie(id, SECRET);
    expect(cookie.startsWith(`${id}.`)).toBe(true);
    expect(await verifyRaterCookie(cookie, SECRET)).toBe(id);
  });

  it("rejects a tampered rater id", async () => {
    const id = createRaterId();
    const cookie = await encodeRaterCookie(id, SECRET);
    const forged = `${createRaterId()}.${cookie.split(".")[1]}`;
    expect(await verifyRaterCookie(forged, SECRET)).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const id = createRaterId();
    const [, sig] = (await encodeRaterCookie(id, SECRET)).split(".");
    expect(await verifyRaterCookie(`${id}.${sig.slice(0, -1)}X`, SECRET)).toBeNull();
  });

  it("rejects a cookie signed with a different secret", async () => {
    const id = createRaterId();
    const cookie = await encodeRaterCookie(id, OTHER_SECRET);
    expect(await verifyRaterCookie(cookie, SECRET)).toBeNull();
  });

  it("rejects an unsigned or malformed cookie", async () => {
    for (const bad of [null, undefined, "", createRaterId(), ".", ".sig", "not-hex.sig", `${createRaterId()}.`]) {
      expect(await verifyRaterCookie(bad as string | null, SECRET), String(bad)).toBeNull();
    }
  });

  it("produces a stable signature for the same input", async () => {
    const id = createRaterId();
    expect(await signRaterId(id, SECRET)).toBe(await signRaterId(id, SECRET));
  });

  it("encodes nothing but the id and signature", async () => {
    const id = createRaterId();
    const cookie = await encodeRaterCookie(id, SECRET);
    expect(cookie.split(".")).toHaveLength(2);
    expect(cookie).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(cookie).not.toContain("ep-");
    expect(cookie).not.toContain("@");
  });
});

describe("cookie security attributes", () => {
  it("is HttpOnly, SameSite=Lax, Path=/ and Secure over https", () => {
    const cookie = serializeRaterCookie("abc.def", true);
    expect(cookie).toContain(`${RATER_COOKIE_NAME}=abc.def`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain(`Max-Age=${RATER_COOKIE_MAX_AGE_SECONDS}`);
  });

  it("omits Secure only for plain-http local development", () => {
    expect(serializeRaterCookie("abc.def", false)).not.toContain("Secure");
  });

  it("names the secret env var without embedding a value", () => {
    expect(RATINGS_SECRET_ENV).toBe("RATINGS_IDENTITY_SECRET");
  });

  it("reads its own cookie out of a header with others present", () => {
    const req = new Request("https://parkio.info/", {
      headers: { cookie: `other=1; ${RATER_COOKIE_NAME}=abc.def; another=2` },
    });
    expect(readCookie(req, RATER_COOKIE_NAME)).toBe("abc.def");
    expect(readCookie(new Request("https://parkio.info/"), RATER_COOKIE_NAME)).toBeNull();
  });
});

describe("write origin policy", () => {
  it("allows Parkio production, preview and localhost", () => {
    for (const origin of [
      "https://parkio.info",
      "https://www.parkio.info",
      "https://abc123.parkio.pages.dev",
      "http://localhost:3000",
    ]) {
      expect(isAllowedWriteOrigin(origin), origin).toBe(true);
    }
  });

  it("rejects everything else, including lookalikes and a missing Origin", () => {
    for (const origin of [
      null,
      undefined,
      "",
      "https://evil.com",
      "https://parkio.info.evil.com",
      "https://parkio-info.com",
      "http://parkio.info",
      "https://evil.parkio.pages.dev.attacker.com",
      "not-a-url",
    ]) {
      expect(isAllowedWriteOrigin(origin as string | null), String(origin)).toBe(false);
    }
  });

  it("requires JSON content type", () => {
    expect(isJsonContentType("application/json")).toBe(true);
    expect(isJsonContentType("application/json; charset=utf-8")).toBe(true);
    for (const bad of [null, "", "text/plain", "application/x-www-form-urlencoded", "multipart/form-data"]) {
      expect(isJsonContentType(bad as string | null), String(bad)).toBe(false);
    }
  });
});

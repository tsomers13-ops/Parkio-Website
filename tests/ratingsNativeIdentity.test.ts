import { describe, expect, it } from "vitest";

import {
  NATIVE_CREDENTIAL_VERSION,
  issueNativeCredential,
  readBearerCredential,
  resolveIdentityMode,
  verifyNativeCredential,
} from "@/lib/ratingsNativeIdentity";
import { encodeRaterCookie, signRaterId } from "@/lib/ratingsIdentity";

/**
 * The native identity primitive: an opaque, server-signed bearer credential
 * that resolves to the same raterId a browser cookie resolves to.
 */

const SECRET = "test-identity-secret-not-real";
const OTHER_SECRET = "a-different-secret";

describe("issueNativeCredential", () => {
  it("mints a versioned credential over a random opaque subject", async () => {
    const { credential, raterId } = await issueNativeCredential(SECRET);
    const [version, subject, signature] = credential.split(".");

    expect(version).toBe(NATIVE_CREDENTIAL_VERSION);
    expect(subject).toBe(raterId);
    expect(subject).toMatch(/^[0-9a-f]{32}$/);
    expect(signature.length).toBeGreaterThan(0);
  });

  it("never repeats a subject", async () => {
    const ids = await Promise.all(
      Array.from({ length: 25 }, () => issueNativeCredential(SECRET).then((c) => c.raterId)),
    );
    expect(new Set(ids).size).toBe(25);
  });

  it("carries no PII, IP, device or timestamp claims", async () => {
    const { credential } = await issueNativeCredential(SECRET);
    // Three parts only: version, opaque subject, signature. Nothing else fits.
    expect(credential.split(".")).toHaveLength(3);
  });
});

describe("verifyNativeCredential", () => {
  it("accepts what it issued", async () => {
    const { credential, raterId } = await issueNativeCredential(SECRET);
    expect(await verifyNativeCredential(credential, SECRET)).toBe(raterId);
  });

  it("rejects a credential signed with another secret", async () => {
    const { credential } = await issueNativeCredential(OTHER_SECRET);
    expect(await verifyNativeCredential(credential, SECRET)).toBeNull();
  });

  it("rejects a tampered subject", async () => {
    const { credential } = await issueNativeCredential(SECRET);
    const [version, , signature] = credential.split(".");
    const forged = `${version}.${"f".repeat(32)}.${signature}`;
    expect(await verifyNativeCredential(forged, SECRET)).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const { credential } = await issueNativeCredential(SECRET);
    const [version, subject, signature] = credential.split(".");
    expect(
      await verifyNativeCredential(`${version}.${subject}.${signature}x`, SECRET),
    ).toBeNull();
  });

  it("rejects an unknown version", async () => {
    const { credential } = await issueNativeCredential(SECRET);
    const [, subject, signature] = credential.split(".");
    expect(await verifyNativeCredential(`v2.${subject}.${signature}`, SECRET)).toBeNull();
  });

  it("rejects malformed and empty values", async () => {
    for (const value of ["", "v1", "v1.abc", "....", "v1..sig", null, undefined]) {
      expect(await verifyNativeCredential(value as string, SECRET)).toBeNull();
    }
  });

  it("cannot be forged by anyone without the secret", async () => {
    // A raterId is public-shaped; the signature is the only barrier.
    const raterId = "a".repeat(32);
    expect(await verifyNativeCredential(`v1.${raterId}.guessed`, SECRET)).toBeNull();
  });

  it("is domain-separated from the browser cookie", async () => {
    // A cookie value must not work as a bearer credential, and vice versa,
    // even though both resolve to the same kind of id.
    const raterId = "b".repeat(32);
    const cookie = await encodeRaterCookie(raterId, SECRET);
    const cookieSignature = cookie.split(".")[1];

    expect(await verifyNativeCredential(`v1.${raterId}.${cookieSignature}`, SECRET)).toBeNull();

    const nativeSignature = await signRaterId(`parkio-native-v1:${raterId}`, SECRET);
    expect(nativeSignature).not.toBe(cookieSignature);
  });
});

describe("readBearerCredential", () => {
  const withAuth = (value?: string) =>
    new Request("https://parkio.info/api/dining/ep-le-cellier/ratings/", {
      headers: value ? { authorization: value } : {},
    });

  it("reads a bearer token", () => {
    expect(readBearerCredential(withAuth("Bearer abc.def.ghi"))).toBe("abc.def.ghi");
  });

  it("is case-insensitive on the scheme", () => {
    expect(readBearerCredential(withAuth("bearer abc"))).toBe("abc");
    expect(readBearerCredential(withAuth("BEARER abc"))).toBe("abc");
  });

  it("returns null with no header", () => {
    expect(readBearerCredential(withAuth())).toBeNull();
  });

  it("ignores other schemes", () => {
    expect(readBearerCredential(withAuth("Basic abc"))).toBeNull();
  });

  it("returns null for an empty bearer value", () => {
    expect(readBearerCredential(withAuth("Bearer   "))).toBeNull();
  });
});

describe("resolveIdentityMode", () => {
  const request = (auth?: string) =>
    new Request("https://parkio.info/api/dining/ep-le-cellier/ratings/", {
      method: "POST",
      headers: auth ? { authorization: auth } : {},
    });

  it("treats a request with no Authorization header as a browser", async () => {
    expect(await resolveIdentityMode(request(), SECRET)).toEqual({ mode: "browser" });
  });

  it("resolves a valid credential to its raterId", async () => {
    const { credential, raterId } = await issueNativeCredential(SECRET);
    expect(await resolveIdentityMode(request(`Bearer ${credential}`), SECRET)).toEqual({
      mode: "native",
      raterId,
    });
  });

  it("does NOT fall back to the browser path on a bad credential", async () => {
    // This is the security property: presenting junk must not be a way to
    // opt out of the browser Origin guard.
    expect(await resolveIdentityMode(request("Bearer nonsense"), SECRET)).toEqual({
      mode: "native-invalid",
    });
  });
});

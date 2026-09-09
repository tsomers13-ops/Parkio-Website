/**
 * Anonymous rating identity.
 *
 * A guest standing in EPCOT should be able to rate lunch without making an
 * account, but an unsigned UUID cookie would let anyone mint unlimited
 * identities by hand. So the cookie carries an opaque random id plus an
 * HMAC over it: the value is worthless to forge without the server secret,
 * and worthless to us as personal data.
 *
 * Encoded in the cookie: a random id and a signature. Nothing else — no IP,
 * no user agent, no fingerprint, no venue, no timestamp, no personal data.
 *
 * Web Crypto only, so this runs unchanged on the Cloudflare Edge Runtime.
 */

/** One cookie for all venues. Per-venue cookies would leak browsing history. */
export const RATER_COOKIE_NAME = "parkio_rater";

/** Env var holding the HMAC secret. The value is never logged or returned. */
export const RATINGS_SECRET_ENV = "RATINGS_IDENTITY_SECRET";

/** Long enough to be useful across a trip; short enough to age out. */
export const RATER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

/** 128 bits of opaque randomness, hex encoded. */
const RATER_ID_BYTES = 16;
const RATER_ID_PATTERN = /^[0-9a-f]{32}$/;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Cryptographically secure — never Math.random(), and never derived from
 * anything about the request.
 */
export function createRaterId(): string {
  const bytes = new Uint8Array(RATER_ID_BYTES);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export async function signRaterId(raterId: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raterId));
  return base64Url(new Uint8Array(sig));
}

/** Length-independent comparison, so a mismatch leaks no timing information. */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** `<raterId>.<signature>` */
export async function encodeRaterCookie(raterId: string, secret: string): Promise<string> {
  return `${raterId}.${await signRaterId(raterId, secret)}`;
}

/**
 * Verify a cookie value and return the raterId, or null.
 *
 * Every failure — absent, malformed, wrong shape, bad signature — returns the
 * same null, so a caller cannot learn which check failed.
 */
export async function verifyRaterCookie(
  value: string | null | undefined,
  secret: string,
): Promise<string | null> {
  if (!value) return null;
  const separator = value.indexOf(".");
  if (separator <= 0) return null;

  const raterId = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!RATER_ID_PATTERN.test(raterId) || signature.length === 0) return null;

  const expected = await signRaterId(raterId, secret);
  return constantTimeEquals(signature, expected) ? raterId : null;
}

/** Read one cookie out of a request's Cookie header. */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/**
 * Set-Cookie for the identity.
 *
 * HttpOnly so script cannot read or copy it. SameSite=Lax so it is not sent
 * on cross-site POSTs. Secure everywhere except plain-http local development,
 * where the browser would otherwise drop it.
 */
export function serializeRaterCookie(value: string, isSecure: boolean): string {
  const parts = [
    `${RATER_COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${RATER_COOKIE_MAX_AGE_SECONDS}`,
  ];
  if (isSecure) parts.push("Secure");
  return parts.join("; ");
}

/** The signing secret, or null when unconfigured. Writes must fail without it. */
export function readIdentitySecret(): string | null {
  const env = (globalThis as { process?: { env?: Record<string, unknown> } }).process?.env;
  const secret = env?.[RATINGS_SECRET_ENV];
  return typeof secret === "string" && secret.length > 0 ? secret : null;
}

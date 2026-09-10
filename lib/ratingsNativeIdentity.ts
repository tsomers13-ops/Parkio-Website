/**
 * Anonymous rating identity for native clients.
 *
 * The browser carries its identity in a signed HttpOnly cookie. A native app
 * has no cookie jar worth trusting and no Origin header, so it carries the
 * same kind of identity as a bearer credential instead.
 *
 * What is deliberately NOT different: the identity itself. A native credential
 * resolves to exactly the same opaque `raterId` the cookie resolves to, filed
 * against the same rows in the same table. There is one Parkio community, not
 * a web one and an iOS one.
 *
 * The credential is `v1.<raterId>.<signature>`. It is minted and verified only
 * on the server; the signing secret never leaves Cloudflare and is never
 * shipped in an app binary. It carries an opaque random subject and nothing
 * else — no PII, no IP, no device metadata, no timestamps.
 *
 * Signatures are domain-separated from the cookie's, so a cookie value cannot
 * be replayed as a bearer credential or the reverse, even though both resolve
 * to the same kind of id.
 *
 * Web Crypto only, so this runs unchanged on the Edge Runtime.
 */

import { createRaterId, signRaterId } from "./ratingsIdentity";

/** Bumped only if the credential format itself changes. */
export const NATIVE_CREDENTIAL_VERSION = "v1";

/** Domain separator. Keeps native signatures disjoint from cookie signatures. */
const NATIVE_SIGNING_PREFIX = "parkio-native-v1:";

const RATER_ID_PATTERN = /^[0-9a-f]{32}$/;

/** Standard transport. Never a query string, never a URL, never a log line. */
export const NATIVE_AUTH_HEADER = "authorization";
const BEARER_PREFIX = "bearer ";

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function signNative(raterId: string, secret: string): Promise<string> {
  return signRaterId(`${NATIVE_SIGNING_PREFIX}${raterId}`, secret);
}

/** Mint a brand-new anonymous native identity. */
export async function issueNativeCredential(secret: string): Promise<{
  credential: string;
  raterId: string;
}> {
  const raterId = createRaterId();
  const signature = await signNative(raterId, secret);
  return { credential: `${NATIVE_CREDENTIAL_VERSION}.${raterId}.${signature}`, raterId };
}

/**
 * Verify a credential and return its raterId, or null.
 *
 * Every failure mode — absent, wrong version, malformed, bad signature —
 * returns the same null, so a caller learns nothing about which check failed.
 */
export async function verifyNativeCredential(
  credential: string | null | undefined,
  secret: string,
): Promise<string | null> {
  if (!credential) return null;

  const parts = credential.split(".");
  if (parts.length !== 3) return null;

  const [version, raterId, signature] = parts;
  if (version !== NATIVE_CREDENTIAL_VERSION) return null;
  if (!RATER_ID_PATTERN.test(raterId) || signature.length === 0) return null;

  const expected = await signNative(raterId, secret);
  return constantTimeEquals(signature, expected) ? raterId : null;
}

/** Pull the bearer credential out of an Authorization header, if present. */
export function readBearerCredential(request: Request): string | null {
  const header = request.headers.get(NATIVE_AUTH_HEADER);
  if (!header) return null;
  if (!header.toLowerCase().startsWith(BEARER_PREFIX)) return null;
  const value = header.slice(BEARER_PREFIX.length).trim();
  return value.length > 0 ? value : null;
}

/**
 * How a request is asking to be identified.
 *
 * The distinction matters for write security. A browser POST is authenticated
 * by a cookie the browser attaches automatically, which is exactly what CSRF
 * abuses — so it must also prove same-origin. A native POST is authenticated
 * by a credential the caller had to be given and must attach deliberately;
 * nothing attaches it ambiently, so there is no confused-deputy problem and
 * no Origin to check.
 *
 * Crucially, `native-invalid` is its own outcome. A bad credential is
 * rejected outright and never falls back to the browser path — otherwise
 * sending a junk Authorization header would be a way to opt out of the Origin
 * guard.
 */
export type IdentityMode =
  | { mode: "native"; raterId: string }
  | { mode: "native-invalid" }
  | { mode: "browser" };

export async function resolveIdentityMode(
  request: Request,
  secret: string,
): Promise<IdentityMode> {
  const credential = readBearerCredential(request);
  if (credential === null) return { mode: "browser" };

  const raterId = await verifyNativeCredential(credential, secret);
  return raterId ? { mode: "native", raterId } : { mode: "native-invalid" };
}

/**
 * POST /api/identity/anonymous/
 *
 * Mint an anonymous rating identity for a native client.
 *
 * The browser never needs this: it gets its identity as a Set-Cookie on its
 * first rating. A native app has no cookie jar we control, so it asks for the
 * same identity explicitly and stores the result in the Keychain.
 *
 * The response contains an opaque credential and nothing else. No account, no
 * PII, no IP, no device metadata — the server learns nothing about the caller
 * and records nothing until they actually rate something.
 *
 * POST rather than GET because it creates something, and so it is never
 * prefetched, cached or link-shared.
 */

import { issueNativeCredential } from "@/lib/ratingsNativeIdentity";
import { readIdentitySecret } from "@/lib/ratingsIdentity";
import { jsonError } from "../../_lib/respond";

export const runtime = "edge";

export async function POST() {
  const secret = readIdentitySecret();
  // Without the secret we cannot mint a trustworthy identity, and signing
  // with a fallback would make every rating forgeable.
  if (!secret) {
    return jsonError(503, "identity_unavailable", "Identity is temporarily unavailable.");
  }

  const { credential } = await issueNativeCredential(secret);

  return new Response(JSON.stringify({ credential }), {
    status: 201,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Never cached anywhere: every caller must get their own identity.
      "Cache-Control": "no-store",
    },
  });
}

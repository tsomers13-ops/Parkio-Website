/**
 * Source-IP rate limiting for the two sensitive Community write paths.
 *
 * Uses Cloudflare's Workers Rate Limiting bindings. Two independent
 * namespaces, so exhausting one cannot starve the other:
 *
 *   IDENTITY_MINT_LIMITER   5 requests / 60s
 *   RATING_WRITE_LIMITER   10 requests / 60s
 *
 * The key is the client IP from `CF-Connecting-IP`, used transiently and
 * nowhere else. Parkio never writes it to D1, never logs it, and never returns
 * it. No KV, no Durable Object, no D1 counter table, no fingerprinting.
 *
 * This is a friction control, not an abuse control. Cloudflare's limiter is
 * per-location and "permissive, eventually consistent, and intentionally
 * designed to not be used as an accurate accounting system", so a distributed
 * attacker gets one allowance per Cloudflare location. What it does buy is that
 * a single script cannot mint identities or rewrite ratings without limit.
 */

import { getRateLimiter } from "./cloudflareEnv";

/** Cloudflare's own header. Deliberately the only header consulted. */
const CLIENT_IP_HEADER = "CF-Connecting-IP";

export type RateLimitedRoute = "IDENTITY_MINT_LIMITER" | "RATING_WRITE_LIMITER";

export type RateLimitDecision =
  | { allowed: true; reason: "within_limit" | "no_binding" | "no_client_ip" }
  | { allowed: false };

/**
 * Read the client IP. Returns null rather than reaching for a substitute:
 * X-Forwarded-For and friends are client-supplied, and a spoofable key is
 * worse than no key because it hands an attacker a fresh allowance per request.
 */
export function readClientIp(req: Request): string | null {
  const ip = req.headers.get(CLIENT_IP_HEADER);
  return ip && ip.trim().length > 0 ? ip.trim() : null;
}

/**
 * Decide whether this request may proceed.
 *
 * Two deliberate FAIL-OPEN cases, both narrow and both documented:
 *
 *  - `no_binding`: no limiter is configured (local development, the Pages
 *    build, tests). Failing closed would make ratings unusable everywhere the
 *    binding is absent, to protect against nothing.
 *
 *  - `no_client_ip`: `CF-Connecting-IP` is missing. Cloudflare sets it on every
 *    request that reaches a Worker, so in practice this means we are not behind
 *    Cloudflare at all. Failing closed here would turn any edge-layer change
 *    into a total write outage, and failing open costs nothing that the
 *    hostname guard, Origin check and bearer validation do not already cover.
 *
 * Both are availability choices about a control that is itself only friction.
 * Authorization is never skipped: the hostname guard runs before this, and
 * Origin/bearer/validation run after it.
 */
export async function checkRateLimit(
  req: Request,
  route: RateLimitedRoute,
): Promise<RateLimitDecision> {
  const limiter = getRateLimiter(route);
  if (!limiter) return { allowed: true, reason: "no_binding" };

  const key = readClientIp(req);
  if (key === null) return { allowed: true, reason: "no_client_ip" };

  try {
    const { success } = await limiter.limit({ key });
    return success ? { allowed: true, reason: "within_limit" } : { allowed: false };
  } catch {
    // The limiter itself failed. A limiter outage must not take ratings down.
    return { allowed: true, reason: "no_binding" };
  }
}

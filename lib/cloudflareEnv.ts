/**
 * Cloudflare binding access.
 *
 * Plain environment variables and secrets reach the application through
 * `process.env` on both hosting adapters, so `readIdentitySecret()` and the
 * hostname guard need no special handling.
 *
 * Binding *objects* are different. `process.env` coerces values to strings, so
 * a D1 database or a rate limiter arrives as "[object Object]" and is useless.
 * `@opennextjs/cloudflare` exposes those on the request context instead.
 *
 * This wrapper is deliberately tolerant: outside a Worker request (next dev,
 * vitest, a build-time render) there is no context, so it returns null and
 * callers fall back to `process.env` or degrade gracefully. That is what keeps
 * local development and the existing Pages build working unchanged.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Minimal shape of the bindings this application reads. */
export interface ParkioBindings {
  DB?: unknown;
  IDENTITY_MINT_LIMITER?: RateLimiterBinding;
  RATING_WRITE_LIMITER?: RateLimiterBinding;
}

/** Cloudflare's rate limiter: `limit({ key })` → `{ success }`. */
export interface RateLimiterBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/**
 * The Cloudflare `env` for this request, or null when there is no Worker
 * context. Never throws — an adapter-less environment is a normal case here,
 * not an error.
 */
export function getCloudflareContextEnv(): ParkioBindings | null {
  try {
    return (getCloudflareContext().env as unknown as ParkioBindings) ?? null;
  } catch {
    return null;
  }
}

/**
 * A named rate limiter, or null when the binding is absent — which is the
 * normal case locally and on the Pages build. Callers must decide explicitly
 * what a missing limiter means; see lib/ratingsRateLimit.ts.
 */
export function getRateLimiter(
  name: "IDENTITY_MINT_LIMITER" | "RATING_WRITE_LIMITER",
): RateLimiterBinding | null {
  const binding = getCloudflareContextEnv()?.[name];
  return binding && typeof binding.limit === "function" ? binding : null;
}


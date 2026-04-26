/**
 * Lightweight in-memory cache with TTL.
 *
 * Edge-runtime safe — no Node-only APIs. Module-level Map persists
 * within a single isolate (warm instance). Combined with HTTP
 * `Cache-Control: s-maxage=...` headers on each route, this gives:
 *
 *   - per-instance hit:    <1ms          (Map lookup)
 *   - per-CDN hit:         <50ms         (Cloudflare/Vercel edge cache)
 *   - per-upstream hit:    300–1500ms    (themeparks.wiki round trip)
 *
 * For multi-region durability, swap this for Cloudflare KV later. The
 * `getOrFetch` signature stays the same.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlSeconds: number): void {
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

export function cacheDelete(key: string): void {
  store.delete(key);
}

/**
 * Get the value at `key`, or compute it via `fetcher` and cache for `ttlSeconds`.
 * The fetcher is only called on a miss. Errors propagate (so the route handler
 * can decide whether to fall back to mock data).
 */
export async function getOrFetch<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const value = await fetcher();
  cacheSet(key, value, ttlSeconds);
  return value;
}

/** TTL constants used by API routes — tweak in one place. */
export const CACHE_TTL = {
  /**
   * Live wait times: 2 minutes. The in-memory cache here is the
   * upstream-protection layer — themeparks.wiki gets at most one hit
   * per park every 2 min regardless of how many visitors we have.
   * Browser-side polling is also 60s so the user-visible staleness
   * is bounded around 2-3 min worst case.
   */
  live: 2 * 60,
  /**
   * Underlying park-schedule fetch. Hours rarely change mid-day so we
   * can cache the upstream pull longer to save calls; the rendered
   * status field uses the shorter `parkStatus` TTL on the response.
   */
  hours: 30 * 60,
  /**
   * Response TTL for endpoints that include `status: OPEN | CLOSED`.
   * Two minutes balances freshness (gate flips at 9 AM / 11 PM are
   * visible quickly) with upstream protection.
   */
  parkStatus: 2 * 60,
  /** Park / resort metadata: 1 hour. */
  park: 60 * 60,
};

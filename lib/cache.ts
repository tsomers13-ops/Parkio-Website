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
   * Live wait times: 5 minutes.
   *
   * This is a deliberate balance between three pressures:
   *   1. User-visible freshness — wait times in the park genuinely
   *      shift on a 5–15 min cadence, so 5 min staleness is well
   *      inside the noise floor for guest decision-making.
   *   2. Upstream protection — themeparks.wiki gets at most one hit
   *      per park every 5 min regardless of traffic.
   *   3. Cloudflare D1 free-tier write budget — a snapshot row is
   *      appended per attraction on every cache miss (see
   *      lib/historySnapshots.ts). At 5-min TTL the projected daily
   *      write volume sits comfortably under D1's 100K/day free cap.
   *      Lowering this back to 2 min would put us over the cap.
   *
   * Browser-side polling is 60s. Worst-case user-visible staleness is
   * therefore bounded around 5–6 min when the browser hits a freshly
   * expired cache and triggers a refetch.
   */
  live: 5 * 60,
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

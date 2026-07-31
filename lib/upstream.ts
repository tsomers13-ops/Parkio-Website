/**
 * Fail-soft, cached reads of the themeparks.wiki upstream.
 *
 * Every route wants the same thing: share one cache entry per park so
 * we don't hammer upstream once per request, and degrade to `null`
 * (which the normalizers already handle) when upstream is down. This
 * keeps that policy in one place instead of repeating the
 * getOrFetch + try/catch dance in each handler.
 */

import { CACHE_TTL, getOrFetch } from "./cache";
import {
  getEntityLive,
  getEntitySchedule,
  type ThemeparksLiveResponse,
  type ThemeparksScheduleResponse,
} from "./themeparksApi";

/** Today + forecast schedule for a park. `null` when upstream fails. */
export async function fetchSchedule(
  externalId: string,
): Promise<ThemeparksScheduleResponse | null> {
  try {
    return await getOrFetch(`schedule:${externalId}`, CACHE_TTL.hours, () =>
      getEntitySchedule(externalId),
    );
  } catch {
    return null;
  }
}

/**
 * Live wait times for a park. `null` when upstream fails.
 *
 * `onFresh` runs only when the value actually came from upstream (the
 * cache missed) — callers use it to trigger history snapshot writes.
 */
export async function fetchLive(
  externalId: string,
  opts: { onFresh?: () => void; onError?: (err: unknown) => void } = {},
): Promise<ThemeparksLiveResponse | null> {
  try {
    return await getOrFetch(`live:${externalId}`, CACHE_TTL.live, async () => {
      opts.onFresh?.();
      return await getEntityLive(externalId);
    });
  } catch (err) {
    opts.onError?.(err);
    return null;
  }
}

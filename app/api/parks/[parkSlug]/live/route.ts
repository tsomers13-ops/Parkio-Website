/**
 * GET /api/parks/[parkSlug]/live
 * Returns live wait times + status for every supported attraction in the park.
 *
 * Strategy:
 *   - Fetch fresh live data from themeparks.wiki (with 5-min cache —
 *     see lib/cache.ts for the rationale: balances user-visible
 *     staleness, upstream protection, and the D1 write-budget).
 *   - Normalize against Parkio's static attraction list (stable slugs).
 *   - On upstream failure, return the static list with status UNKNOWN
 *     and `live: false` so clients can decide how to render.
 *   - On a CACHE MISS only (i.e. fresh upstream fetch), schedule a
 *     non-blocking write to D1 with one row per attraction. See
 *     `lib/historySnapshots.ts` and `docs/D1-SETUP.md`. The write fires
 *     via `ctx.waitUntil(...)` so it never delays the user's response,
 *     and it fails soft (no D1 binding → silent no-op).
 */

import { getRequestContext } from "@cloudflare/next-on-pages";

import { CACHE_TTL, getOrFetch } from "@/lib/cache";
import { getParkConfig } from "@/lib/disneyParkConfig";
import { persistLiveSnapshots } from "@/lib/historySnapshots";
import { normalizeLive } from "@/lib/parkioNormalizer";
import {
  getEntityLive,
  type ThemeparksLiveResponse,
} from "@/lib/themeparksApi";
import { jsonOk, notFound } from "../../../_lib/respond";

export const runtime = "edge";
export const revalidate = 300; // 5 minutes — keep in sync with CACHE_TTL.live

interface Params {
  params: { parkSlug: string };
}

export async function GET(_req: Request, { params }: Params) {
  const cfg = getParkConfig(params.parkSlug);
  if (!cfg) {
    return notFound(`Unknown park slug: ${params.parkSlug}`);
  }

  // Track whether this request actually pulled fresh upstream data.
  // The closure inside `getOrFetch` only runs on a cache miss — we flip
  // the flag there so we know to schedule a snapshot write afterward.
  let isFreshFromUpstream = false;

  let live: ThemeparksLiveResponse | null = null;
  try {
    live = await getOrFetch(
      `live:${cfg.externalId}`,
      CACHE_TTL.live,
      async () => {
        isFreshFromUpstream = true;
        return await getEntityLive(cfg.externalId);
      },
    );
  } catch {
    // Upstream unavailable — fall through to fallback.
    live = null;
  }

  const payload = normalizeLive(cfg.slug, live);
  if (!payload) return notFound(`Unknown park slug: ${params.parkSlug}`);

  // History collection — only when we actually pulled fresh data, never
  // on cache hits. Wrapped in waitUntil so the response returns now and
  // the DB write completes in the background. Errors are swallowed by
  // persistLiveSnapshots — the API contract is unaffected by D1 state.
  if (isFreshFromUpstream && payload.live) {
    scheduleSnapshotWrite(payload);
  }

  return jsonOk(payload, CACHE_TTL.live, CACHE_TTL.live * 4);
}

/**
 * Hook the snapshot write into the Cloudflare Pages request lifecycle
 * via `ctx.waitUntil`. Pulled into its own function so call sites stay
 * tidy and the failure path is isolated.
 *
 * Three failure modes, all silent:
 *   1. Not running on Cloudflare Pages (e.g., local `next dev`) →
 *      `getRequestContext` throws → we catch and skip.
 *   2. D1 binding not configured on the project → `env.DB` undefined
 *      → persistLiveSnapshots returns immediately.
 *   3. D1 schema not yet applied / write rejected → caught inside
 *      persistLiveSnapshots, logged as warn, response unaffected.
 */
function scheduleSnapshotWrite(
  payload: ReturnType<typeof normalizeLive>,
): void {
  if (!payload) return;
  try {
    const { env, ctx } = getRequestContext();
    ctx.waitUntil(persistLiveSnapshots(env as { DB?: unknown }, payload));
  } catch {
    // Not running on Cloudflare Pages — silently skip. This path is
    // hit by `next dev`, unit tests, and any preview environment that
    // doesn't expose the Pages request context.
  }
}

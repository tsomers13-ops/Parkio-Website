/**
 * GET /api/parks/[parkSlug]/live
 * Live wait times + status for every supported attraction in the park,
 * plus upcoming showtimes. Cached for 5 minutes.
 *
 * This used to live in `functions/api/parks/[parkSlug]/live.ts` as a
 * Cloudflare Pages Function. That never ran: the site is built with
 * `@cloudflare/next-on-pages`, which emits an advanced-mode
 * `_worker.js`, and Pages ignores the `functions/` directory entirely
 * when one is present — so the path fell through to the Next.js app
 * and 404'd in production while every `app/api/*` route worked.
 *
 * Snapshot writes (`persistLiveSnapshots`) are best-effort here: a
 * route handler has no `ctx.waitUntil`, so on a cache miss we await
 * the D1 batch (one round trip, at most once per park per TTL).
 */

import { CACHE_TTL, getOrFetch } from "@/lib/cache";
import { getParkConfig } from "@/lib/disneyParkConfig";
import { persistLiveSnapshots, type SnapshotEnv } from "@/lib/historySnapshots";
import { normalizeLive } from "@/lib/parkioNormalizer";
import {
  getEntityLive,
  type ThemeparksLiveResponse,
} from "@/lib/themeparksApi";
import { jsonOk, notFound } from "../../../_lib/respond";

export const runtime = "edge";
export const revalidate = 300;

interface Params {
  params: { parkSlug: string };
}

export async function GET(_req: Request, { params }: Params) {
  const cfg = getParkConfig(params.parkSlug);
  if (!cfg) {
    return notFound(`Unknown park slug: ${params.parkSlug}`);
  }

  // Only a cache miss talks to themeparks.wiki — and only a cache miss
  // should write a history row.
  let isFreshFromUpstream = false;

  let live: ThemeparksLiveResponse | null = null;
  try {
    live = await getOrFetch(`live:${cfg.externalId}`, CACHE_TTL.live, () => {
      isFreshFromUpstream = true;
      return getEntityLive(cfg.externalId);
    });
  } catch {
    // Upstream unavailable — normalizeLive still returns the static
    // attraction list with `live: false` so clients degrade to estimates.
    live = null;
  }

  const payload = normalizeLive(cfg.slug, live);
  if (!payload) return notFound(`Unknown park slug: ${params.parkSlug}`);

  if (isFreshFromUpstream && payload.live) {
    await persistLiveSnapshots(snapshotEnv(), payload);
  }

  return jsonOk(payload, CACHE_TTL.live, CACHE_TTL.live * 4);
}

/**
 * D1 binding lookup. `@cloudflare/next-on-pages` exposes Pages bindings
 * on `process.env`, so `DB` is present in production and absent locally
 * / on Vercel — where `persistLiveSnapshots` no-ops.
 */
function snapshotEnv(): SnapshotEnv | undefined {
  const env = (globalThis as { process?: { env?: Record<string, unknown> } })
    .process?.env;
  return env?.DB ? { DB: env.DB } : undefined;
}

/**
 * GET /api/parks/[parkSlug]/live
 * Returns live wait times + status for every supported attraction in the park.
 *
 * Strategy:
 *   - Fetch fresh live data from themeparks.wiki (with 5-min cache).
 *   - Normalize against Parkio's static attraction list (stable slugs).
 *   - On upstream failure, return the static list with status UNKNOWN
 *     and `live: false` so clients can decide how to render.
 */

import { CACHE_TTL, getOrFetch } from "@/lib/cache";
import { getParkConfig } from "@/lib/disneyParkConfig";
import { normalizeLive } from "@/lib/parkioNormalizer";
import {
  getEntityLive,
  type ThemeparksLiveResponse,
} from "@/lib/themeparksApi";
import { jsonOk, notFound } from "../../../_lib/respond";

export const runtime = "edge";
export const revalidate = 120; // 2 minutes

interface Params {
  params: { parkSlug: string };
}

export async function GET(_req: Request, { params }: Params) {
  const cfg = getParkConfig(params.parkSlug);
  if (!cfg) {
    return notFound(`Unknown park slug: ${params.parkSlug}`);
  }

  let live: ThemeparksLiveResponse | null = null;
  try {
    live = await getOrFetch(
      `live:${cfg.externalId}`,
      CACHE_TTL.live,
      () => getEntityLive(cfg.externalId),
    );
  } catch {
    // Upstream unavailable — fall through to fallback.
    live = null;
  }

  const payload = normalizeLive(cfg.slug, live);
  if (!payload) return notFound(`Unknown park slug: ${params.parkSlug}`);

  return jsonOk(payload, CACHE_TTL.live, CACHE_TTL.live * 4);
}

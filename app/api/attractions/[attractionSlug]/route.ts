/**
 * GET /api/attractions/[attractionSlug]
 * Returns a single attraction with live status + wait time when available.
 *
 * Slugs are stable (used as the iOS-side identifier). They look like:
 *   - mk-space-mountain
 *   - dl-rise
 *   - dca-radiator-springs
 */

import { CACHE_TTL, getOrFetch } from "@/lib/cache";
import { RIDES } from "@/lib/data";
import { getParkConfig } from "@/lib/disneyParkConfig";
import {
  findAttractionBySlug,
  normalizeLive,
} from "@/lib/parkioNormalizer";
import {
  getEntityLive,
  type ThemeparksLiveResponse,
} from "@/lib/themeparksApi";
import { jsonOk, notFound } from "../../_lib/respond";

export const runtime = "edge";
export const revalidate = 300;

interface Params {
  params: { attractionSlug: string };
}

export async function GET(_req: Request, { params }: Params) {
  const ride = RIDES.find((r) => r.id === params.attractionSlug);
  if (!ride) {
    const fallback = findAttractionBySlug(params.attractionSlug);
    if (!fallback) {
      return notFound(`Unknown attraction slug: ${params.attractionSlug}`);
    }
    return jsonOk(fallback, CACHE_TTL.live, CACHE_TTL.live * 4);
  }

  const parkCfg = getParkConfig(ride.parkId);
  if (!parkCfg) {
    return notFound(`Park not configured for ride ${params.attractionSlug}`);
  }

  // Reuse the shared park-level live cache so we don't hammer themeparks.wiki
  // once per ride.
  let live: ThemeparksLiveResponse | null = null;
  try {
    live = await getOrFetch(
      `live:${parkCfg.externalId}`,
      CACHE_TTL.live,
      () => getEntityLive(parkCfg.externalId),
    );
  } catch {
    live = null;
  }

  const parkPayload = normalizeLive(parkCfg.slug, live);
  const attraction = parkPayload?.attractions.find(
    (a) => a.slug === params.attractionSlug,
  );

  if (!attraction) {
    return notFound(`Unknown attraction slug: ${params.attractionSlug}`);
  }

  return jsonOk(attraction, CACHE_TTL.live, CACHE_TTL.live * 4);
}

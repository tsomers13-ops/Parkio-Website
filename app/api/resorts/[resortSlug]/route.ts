/**
 * GET /api/resorts/[resortSlug]
 * Returns the resort and the list of parks it contains, each with today's
 * status + hours.
 *
 * Currently supports:
 *   - walt-disney-world
 *   - disneyland-resort
 */

import { CACHE_TTL } from "@/lib/cache";
import {
  DISNEY_PARKS,
  getResortConfig,
} from "@/lib/disneyParkConfig";
import { normalizePark } from "@/lib/parkioNormalizer";
import type { ApiPark, ApiResort } from "@/lib/types";
import { fetchSchedule } from "@/lib/upstream";
import { jsonOk, notFound } from "../../_lib/respond";

export const runtime = "edge";
export const revalidate = 120; // includes per-park status

interface Params {
  params: { resortSlug: string };
}

export async function GET(_req: Request, { params }: Params) {
  const resort = getResortConfig(params.resortSlug);
  if (!resort) {
    return notFound(`Unknown resort slug: ${params.resortSlug}`);
  }

  const parkConfigs = DISNEY_PARKS.filter(
    (p) => p.resortSlug === resort.slug,
  );

  const parks: ApiPark[] = await Promise.all(
    parkConfigs.map(async (cfg) => {
      const schedule = await fetchSchedule(cfg.externalId);
      return normalizePark(cfg.slug, schedule) as ApiPark;
    }),
  );

  const body: ApiResort = {
    slug: resort.slug,
    name: resort.name,
    timezone: resort.timezone,
    parks,
    lastUpdated: new Date().toISOString(),
  };

  return jsonOk(body, CACHE_TTL.parkStatus, CACHE_TTL.parkStatus * 4);
}

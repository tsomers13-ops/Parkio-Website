/**
 * GET /api/parks
 * Returns the full list of Disney parks Parkio supports, with today's
 * status + hours where available.
 *
 * Cached at the CDN for 5 minutes; per-park schedule fetched in parallel.
 */

import { CACHE_TTL } from "@/lib/cache";
import { DISNEY_PARKS } from "@/lib/disneyParkConfig";
import { normalizePark } from "@/lib/parkioNormalizer";
import type { ApiPark } from "@/lib/types";
import { fetchSchedule } from "@/lib/upstream";
import { jsonOk } from "../_lib/respond";

export const runtime = "edge";
export const revalidate = 120; // 2 min — status is time-sensitive

export async function GET() {
  const parks: ApiPark[] = await Promise.all(
    DISNEY_PARKS.map(async (cfg) => {
      // Upstream failure degrades to a minimal record rather than a 500.
      const schedule = await fetchSchedule(cfg.externalId);
      const normalized = normalizePark(cfg.slug, schedule);
      // normalizePark only returns null when the slug is invalid, which
      // can't happen here since we're iterating the config itself.
      return normalized as ApiPark;
    }),
  );

  return jsonOk(
    { parks, count: parks.length, lastUpdated: new Date().toISOString() },
    CACHE_TTL.parkStatus,
    CACHE_TTL.parkStatus * 4,
  );
}

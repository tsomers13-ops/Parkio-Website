/**
 * GET /api/parks/[parkSlug]
 * Returns a single park's metadata + today's status + today's hours.
 */

import { CACHE_TTL, getOrFetch } from "@/lib/cache";
import { getParkConfig } from "@/lib/disneyParkConfig";
import { normalizePark } from "@/lib/parkioNormalizer";
import {
  getEntitySchedule,
  type ThemeparksScheduleResponse,
} from "@/lib/themeparksApi";
import { jsonOk, notFound } from "../../_lib/respond";

export const runtime = "edge";
export const revalidate = 120; // status is time-sensitive

interface Params {
  params: { parkSlug: string };
}

export async function GET(_req: Request, { params }: Params) {
  const cfg = getParkConfig(params.parkSlug);
  if (!cfg) {
    return notFound(`Unknown park slug: ${params.parkSlug}`);
  }

  let schedule: ThemeparksScheduleResponse | null = null;
  try {
    schedule = await getOrFetch(
      `schedule:${cfg.externalId}`,
      CACHE_TTL.hours,
      () => getEntitySchedule(cfg.externalId),
    );
  } catch {
    // Fall back to a minimal park record when upstream is down.
    schedule = null;
  }

  const park = normalizePark(cfg.slug, schedule);
  if (!park) return notFound(`Unknown park slug: ${params.parkSlug}`);

  return jsonOk(park, CACHE_TTL.parkStatus, CACHE_TTL.parkStatus * 4);
}

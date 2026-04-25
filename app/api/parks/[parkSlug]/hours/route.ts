/**
 * GET /api/parks/[parkSlug]/hours
 * Returns today's hours plus the next ~14 days of forecast schedule.
 * Cached for 30 minutes.
 */

import { CACHE_TTL, getOrFetch } from "@/lib/cache";
import { getParkConfig } from "@/lib/disneyParkConfig";
import { normalizeHours } from "@/lib/parkioNormalizer";
import {
  getEntitySchedule,
  type ThemeparksScheduleResponse,
} from "@/lib/themeparksApi";
import { jsonOk, notFound } from "../../../_lib/respond";

export const runtime = "edge";
export const revalidate = 1800;

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
    schedule = null;
  }

  const payload = normalizeHours(cfg.slug, schedule);
  if (!payload) return notFound(`Unknown park slug: ${params.parkSlug}`);

  return jsonOk(payload, CACHE_TTL.hours, CACHE_TTL.hours * 2);
}

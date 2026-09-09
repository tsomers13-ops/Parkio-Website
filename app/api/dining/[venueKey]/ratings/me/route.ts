/**
 * GET /api/dining/[venueKey]/ratings/me
 *
 * This guest's own current rating, if they have one. Never mints an identity:
 * a visitor who has not rated anything stays uncookied.
 */

import { getRatingsDb, readMyRating } from "@/lib/ratingsDb";
import {
  RATER_COOKIE_NAME,
  readCookie,
  readIdentitySecret,
  verifyRaterCookie,
} from "@/lib/ratingsIdentity";
import { validateRatingVenueKey } from "@/lib/ratingsValidation";
import { jsonError, notFound } from "../../../../_lib/respond";

export const runtime = "edge";

interface Params {
  params: { venueKey: string };
}

function noStore(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: Request, { params }: Params) {
  const venue = validateRatingVenueKey(params.venueKey);
  if (!venue.ok) return notFound(`Unknown dining venue: ${params.venueKey}`);

  const secret = readIdentitySecret();
  const cookie = readCookie(req, RATER_COOKIE_NAME);

  // No secret, no cookie, or a cookie that fails verification all mean the
  // same thing to a caller: this guest has no rating here. The response never
  // says which, so a tampered cookie learns nothing.
  const raterId = secret ? await verifyRaterCookie(cookie, secret) : null;
  if (!raterId) return noStore({ venueKey: venue.venueKey, rating: null });

  const result = await readMyRating(getRatingsDb(), venue.venueKey, raterId);
  if (result.status === "unavailable") {
    return jsonError(503, "ratings_unavailable", "Ratings are temporarily unavailable.");
  }
  return noStore({ venueKey: venue.venueKey, rating: result.rating });
}

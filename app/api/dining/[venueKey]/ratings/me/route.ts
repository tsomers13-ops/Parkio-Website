/**
 * GET /api/dining/[venueKey]/ratings/me
 *
 * This guest's own current rating, if they have one. Never mints an identity:
 * a visitor who has not rated anything stays uncookied, and a native client
 * that has never asked for a credential is never given one here.
 *
 * Identity is optional. Without one the honest answer is "no rating", which
 * is exactly what an unidentified caller should get.
 */

import { getRatingsDb, readMyRating } from "@/lib/ratingsDb";
import {
  readBearerCredential,
  verifyNativeCredential,
} from "@/lib/ratingsNativeIdentity";
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
  const bearer = readBearerCredential(req);

  // A native client presenting a credential is identified by it and never
  // falls back to a cookie. An invalid one is rejected rather than quietly
  // downgraded, so a client with a stale credential is told to replace it
  // instead of being shown a misleading "you have not rated this".
  if (bearer !== null) {
    const nativeRater = secret ? await verifyNativeCredential(bearer, secret) : null;
    if (!nativeRater) {
      return jsonError(401, "invalid_credential", "Rating identity is not valid.");
    }
    const nativeResult = await readMyRating(getRatingsDb(), venue.venueKey, nativeRater);
    if (nativeResult.status === "unavailable") {
      return jsonError(503, "ratings_unavailable", "Ratings are temporarily unavailable.");
    }
    return noStore({ venueKey: venue.venueKey, rating: nativeResult.rating });
  }

  // No secret, no cookie, or a cookie that fails verification all mean the
  // same thing to a caller: this guest has no rating here. The response never
  // says which, so a tampered cookie learns nothing.
  const raterId = secret ? await verifyRaterCookie(readCookie(req, RATER_COOKIE_NAME), secret) : null;
  if (!raterId) return noStore({ venueKey: venue.venueKey, rating: null });

  const result = await readMyRating(getRatingsDb(), venue.venueKey, raterId);
  if (result.status === "unavailable") {
    return jsonError(503, "ratings_unavailable", "Ratings are temporarily unavailable.");
  }
  return noStore({ venueKey: venue.venueKey, rating: result.rating });
}

/**
 * GET /api/dining/ratings/?venueKeys=a,b,c   public bulk aggregate
 *
 * Exists so Dining discovery can show a Guest Rating on every card without
 * issuing one request per card. EPCOT's 42 venues and Hollywood Studios' 20
 * are each a single request and a single SQL statement.
 *
 * Public and read-only. It mints no identity, reads no cookie, returns no
 * personal rating, and does not touch the write path — a guest browsing the
 * Dining list stays as anonymous as one browsing the homepage.
 */

import { parseBulkVenueKeys } from "@/lib/ratingsBulk";
import { getRatingsDb, readBulkAggregates } from "@/lib/ratingsDb";
import { badRequest, jsonError, jsonOk } from "../../_lib/respond";

export const runtime = "edge";

/** Matches the single-venue aggregate: cards tolerate a minute of staleness. */
const AGGREGATE_S_MAXAGE = 60;
const AGGREGATE_SWR = 120;

export async function GET(req: Request) {
  const parsed = parseBulkVenueKeys(new URL(req.url).searchParams.get("venueKeys"));
  if (!parsed.ok) return badRequest(parsed.error);

  const result = await readBulkAggregates(getRatingsDb(), parsed.venueKeys);
  if (result.status === "unavailable") {
    // Deliberately not an empty map: discovery must be able to tell "no
    // ratings exist" from "ratings could not be read", and omit the card
    // line for the second reason without claiming the first.
    return jsonError(503, "ratings_unavailable", "Ratings are temporarily unavailable.");
  }

  // No Set-Cookie: reading public numbers must never create an identity.
  return jsonOk({ ratings: result.ratings }, AGGREGATE_S_MAXAGE, AGGREGATE_SWR);
}

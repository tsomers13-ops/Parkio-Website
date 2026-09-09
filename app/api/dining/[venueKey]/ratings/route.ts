/**
 * GET  /api/dining/[venueKey]/ratings   public aggregate
 * POST /api/dining/[venueKey]/ratings   submit or revise this guest's rating
 *
 * Identity is anonymous and signed. A read never mints one — only a write
 * does, so a visitor who never rates anything is never given a cookie.
 */

import {
  getRatingsDb,
  readAggregate,
  upsertRating,
} from "@/lib/ratingsDb";
import {
  RATER_COOKIE_NAME,
  createRaterId,
  encodeRaterCookie,
  readCookie,
  readIdentitySecret,
  serializeRaterCookie,
  verifyRaterCookie,
} from "@/lib/ratingsIdentity";
import {
  MAX_RATING_BODY_BYTES,
  isAllowedWriteOrigin,
  isJsonContentType,
} from "@/lib/ratingsOrigin";
import { validateRatingInput, validateRatingVenueKey } from "@/lib/ratingsValidation";
import { badRequest, jsonError, jsonOk, notFound } from "../../../_lib/respond";

export const runtime = "edge";

/** Short edge cache: new ratings surface quickly without hammering D1. */
const AGGREGATE_S_MAXAGE = 60;
const AGGREGATE_SWR = 120;

interface Params {
  params: { venueKey: string };
}

function noStore(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Ratings could not be read. Deliberately NOT an aggregate of zero — a guest
 * seeing "no ratings yet" when the database is simply down would be misled.
 * Callers render the page without the ratings block.
 */
function ratingsUnavailable(): Response {
  return jsonError(503, "ratings_unavailable", "Ratings are temporarily unavailable.");
}

export async function GET(_req: Request, { params }: Params) {
  const venue = validateRatingVenueKey(params.venueKey);
  if (!venue.ok) return notFound(`Unknown dining venue: ${params.venueKey}`);

  const result = await readAggregate(getRatingsDb(), venue.venueKey);
  if (result.status === "unavailable") return ratingsUnavailable();

  // No Set-Cookie here: reading public numbers must never create an identity.
  return jsonOk(result.aggregate, AGGREGATE_S_MAXAGE, AGGREGATE_SWR);
}

export async function POST(req: Request, { params }: Params) {
  const venue = validateRatingVenueKey(params.venueKey);
  if (!venue.ok) return notFound(`Unknown dining venue: ${params.venueKey}`);

  if (!isAllowedWriteOrigin(req.headers.get("origin"))) {
    return jsonError(403, "forbidden_origin", "Cross-site submissions are not allowed.");
  }
  if (!isJsonContentType(req.headers.get("content-type"))) {
    return jsonError(415, "unsupported_media_type", "Content-Type must be application/json.");
  }

  const raw = await req.text();
  if (raw.length > MAX_RATING_BODY_BYTES) {
    return jsonError(413, "payload_too_large", "Rating payload is too large.");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return badRequest("Body must be valid JSON.");
  }

  const parsed = validateRatingInput(payload);
  if (!parsed.ok) return badRequest(parsed.errors.join("; "));

  const secret = readIdentitySecret();
  // Without the secret we cannot mint a trustworthy identity. Failing the
  // write is correct; signing with a fallback would make ratings forgeable.
  if (!secret) return ratingsUnavailable();

  const db = getRatingsDb();
  if (!db) return ratingsUnavailable();

  const existing = await verifyRaterCookie(readCookie(req, RATER_COOKIE_NAME), secret);
  const raterId = existing ?? createRaterId();

  try {
    await upsertRating(db, venue.venueKey, raterId, parsed.value, new Date());
  } catch {
    // A write must never report a success it did not achieve.
    return jsonError(503, "ratings_write_failed", "Your rating could not be saved.");
  }

  const aggregate = await readAggregate(db, venue.venueKey);

  const body = {
    rating: {
      overall: parsed.value.overall,
      taste: parsed.value.taste ?? null,
      value: parsed.value.value ?? null,
      quality: parsed.value.quality ?? null,
    },
    aggregate: aggregate.status === "ok" ? aggregate.aggregate : null,
  };

  const response = noStore(body, existing ? 200 : 201);
  if (!existing) {
    const isSecure = new URL(req.url).protocol === "https:";
    response.headers.append(
      "Set-Cookie",
      serializeRaterCookie(await encodeRaterCookie(raterId, secret), isSecure),
    );
  }
  return response;
}

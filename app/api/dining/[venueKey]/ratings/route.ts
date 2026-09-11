/**
 * GET  /api/dining/[venueKey]/ratings   public aggregate
 * POST /api/dining/[venueKey]/ratings   submit or revise this guest's rating
 *
 * Identity is anonymous and signed. A read never mints one — only a write
 * does, so a visitor who never rates anything is never given a cookie.
 *
 * Two identity transports, one identity model. A browser is identified by its
 * signed HttpOnly cookie; a native client by a bearer credential it was issued
 * from /api/identity/anonymous/. Both resolve to the same opaque raterId and
 * write the same rows, so web and iOS ratings form one community.
 */

import {
  getRatingsDb,
  readAggregate,
  readMyRating,
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
  readBearerCredential,
  verifyNativeCredential,
} from "@/lib/ratingsNativeIdentity";
import { calculateCommunityRanking } from "@/lib/ratingsRanking";
import { isAllowedCommunityWriteRequest } from "@/lib/ratingsWriteHost";
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

  // Same shared trust function as the bulk endpoint. Additive and dormant:
  // the guest-facing block still renders the raw average and count.
  const ranking = calculateCommunityRanking(
    result.aggregate.overallAverage,
    result.aggregate.ratingCount,
  );

  // No Set-Cookie here: reading public numbers must never create an identity.
  return jsonOk({ ...result.aggregate, ...ranking }, AGGREGATE_S_MAXAGE, AGGREGATE_SWR);
}

export async function POST(req: Request, { params }: Params) {
  // First, before anything else looks at the request. Cloudflare Pages serves
  // this same Worker on parkio.pages.dev and on an immutable alias for every
  // past deployment, all bound to the same Production database. Only
  // parkio.info carries Production write authority; every other hostname is
  // refused here, ahead of identity, validation and D1.
  //
  // Ahead of the venue check too, so an unauthorized host is not told which
  // venue keys exist.
  if (!isAllowedCommunityWriteRequest(req)) {
    return jsonError(403, "forbidden_host", "Ratings cannot be submitted from this host.");
  }

  const venue = validateRatingVenueKey(params.venueKey);
  if (!venue.ok) return notFound(`Unknown dining venue: ${params.venueKey}`);

  // A bearer credential means this is a native client. Nothing attaches that
  // header ambiently, so there is no confused deputy to protect against and
  // no Origin to check — the credential itself is the proof.
  //
  // A browser sends no Authorization header, so it takes the original path
  // unchanged: same guard, same position, same status codes. Presenting a
  // junk credential is therefore not a way to opt out of the Origin check —
  // it commits the caller to the native path, which rejects it below.
  const bearer = readBearerCredential(req);
  const isNativeRequest = bearer !== null;

  if (!isNativeRequest && !isAllowedWriteOrigin(req.headers.get("origin"))) {
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

  // `created` drives 201-vs-200 and, for browsers, whether to mint a cookie.
  let raterId: string;
  let created: boolean;
  let mintCookie = false;

  if (isNativeRequest) {
    const nativeRater = await verifyNativeCredential(bearer, secret);
    if (!nativeRater) {
      return jsonError(401, "invalid_credential", "Rating identity is not valid.");
    }
    raterId = nativeRater;
    // A native credential always exists, so it says nothing about whether
    // this guest has rated this venue before. Ask the row instead.
    const mine = await readMyRating(db, venue.venueKey, raterId);
    if (mine.status === "unavailable") return ratingsUnavailable();
    created = mine.rating === null;
  } else {
    const existing = await verifyRaterCookie(readCookie(req, RATER_COOKIE_NAME), secret);
    raterId = existing ?? createRaterId();
    created = existing === null;
    mintCookie = existing === null;
  }

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

  const response = noStore(body, created ? 201 : 200);
  // Never on the native path: a native client stores its credential in the
  // Keychain and must not be handed a browser cookie as well.
  if (mintCookie) {
    const isSecure = new URL(req.url).protocol === "https:";
    response.headers.append(
      "Set-Cookie",
      serializeRaterCookie(await encodeRaterCookie(raterId, secret), isSecure),
    );
  }
  return response;
}

/**
 * Browser-side contract for the ratings API.
 *
 * Kept separate from the components so the URL shapes and response handling
 * are unit-testable without rendering anything.
 *
 * The app runs `trailingSlash: true`, so every ratings URL MUST end in a
 * slash. Without it Next issues a 308 and the browser re-sends a POST as a
 * GET, silently dropping the rating. That is why the builders below exist
 * instead of inline template strings.
 */

import type { DiningRatingAggregate, DiningRatingInput } from "./ratingsTypes";

export function ratingsAggregateUrl(venueKey: string): string {
  return `/api/dining/${encodeURIComponent(venueKey)}/ratings/`;
}

export function ratingsMeUrl(venueKey: string): string {
  return `/api/dining/${encodeURIComponent(venueKey)}/ratings/me/`;
}

/** The guest's own current rating, as returned by /me. */
export interface MyRatingView {
  overall: number;
  taste: number | null;
  value: number | null;
  quality: number | null;
}

/**
 * Aggregate load result.
 *
 * `unavailable` is a distinct state from a zero aggregate — the UI must never
 * render "no guest ratings yet" when the service simply failed.
 */
export type AggregateLoad =
  | { status: "ok"; aggregate: DiningRatingAggregate }
  | { status: "unavailable" };

export async function fetchAggregate(
  venueKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AggregateLoad> {
  try {
    const res = await fetchImpl(ratingsAggregateUrl(venueKey), { headers: { accept: "application/json" } });
    if (!res.ok) return { status: "unavailable" };
    return { status: "ok", aggregate: (await res.json()) as DiningRatingAggregate };
  } catch {
    return { status: "unavailable" };
  }
}

/**
 * The guest's own rating. A failure here is not worth surfacing — the public
 * aggregate can still render — so it degrades to "no personal rating".
 */
export async function fetchMyRating(
  venueKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MyRatingView | null> {
  try {
    const res = await fetchImpl(ratingsMeUrl(venueKey), { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const body = (await res.json()) as { rating: MyRatingView | null };
    return body.rating ?? null;
  } catch {
    return null;
  }
}

export type SubmitResult =
  | { status: "ok"; rating: MyRatingView; aggregate: DiningRatingAggregate | null }
  | { status: "error" };

/**
 * Submit or revise. Only the dimensions the guest actually chose are sent —
 * an unanswered Taste is absent, never a zero and never a copy of Overall.
 *
 * The response is authoritative: callers replace their aggregate with it
 * rather than incrementing a count locally, because an update must not add a
 * vote and only the server knows which case this was.
 */
export async function submitRating(
  venueKey: string,
  input: DiningRatingInput,
  fetchImpl: typeof fetch = fetch,
): Promise<SubmitResult> {
  const payload: Record<string, number> = { overall: input.overall };
  for (const key of ["taste", "value", "quality"] as const) {
    const v = input[key];
    if (typeof v === "number") payload[key] = v;
  }
  try {
    const res = await fetchImpl(ratingsAggregateUrl(venueKey), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { status: "error" };
    const body = (await res.json()) as {
      rating: MyRatingView;
      aggregate: DiningRatingAggregate | null;
    };
    return { status: "ok", rating: body.rating, aggregate: body.aggregate ?? null };
  } catch {
    return { status: "error" };
  }
}

/** "1 rating" / "2 ratings" — never "1 ratings". */
export function ratingCountLabel(count: number): string {
  return `${count} ${count === 1 ? "rating" : "ratings"}`;
}

// ── Bulk discovery aggregates ───────────────────────────────────────────────

/** One card's worth of community signal. */
export interface BulkRatingEntry {
  ratingCount: number;
  overallAverage: number | null;
}

/**
 * Bulk aggregate URL.
 *
 * Trailing slash before the query string, for the same reason as every other
 * ratings URL. Keys are sent in the caller's order and that order is stable
 * per park, so every visitor to EPCOT Dining requests the same URL and the
 * edge cache actually gets used.
 */
export function bulkRatingsUrl(venueKeys: string[]): string {
  const keys = venueKeys.map((key) => encodeURIComponent(key)).join(",");
  return `/api/dining/ratings/?venueKeys=${keys}`;
}

export type BulkRatingsLoad =
  | { status: "ok"; ratings: Record<string, BulkRatingEntry> }
  | { status: "unavailable" };

/**
 * One request for a whole discovery page.
 *
 * Any failure — network, 503, malformed body — resolves to `unavailable`, and
 * discovery then renders with no rating lines at all. Ratings are enhancement
 * data: the page must never depend on them.
 */
export async function fetchBulkRatings(
  venueKeys: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<BulkRatingsLoad> {
  if (venueKeys.length === 0) return { status: "ok", ratings: {} };
  try {
    const res = await fetchImpl(bulkRatingsUrl(venueKeys), {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return { status: "unavailable" };
    const body = (await res.json()) as { ratings?: Record<string, BulkRatingEntry> };
    if (!body || typeof body !== "object" || !body.ratings) return { status: "unavailable" };
    return { status: "ok", ratings: body.ratings };
  } catch {
    return { status: "unavailable" };
  }
}

/**
 * Screen-reader sentence for a card's rating.
 *
 * "★ 4.6" alone is meaningless without sight of the star, so the accessible
 * name states the scale and the sample size in words.
 */
export function guestRatingLabel(average: number, count: number): string {
  return `Guest rating ${average.toFixed(1)} out of 5 from ${ratingCountLabel(count)}`;
}

/**
 * Query parsing for the public bulk aggregate read.
 *
 * Pure and framework-free, so the contract can be tested without HTTP.
 *
 * The registry is the only authority on what a venueKey is. Festival booth
 * ids, attraction ids, canonicalIds and slugs are not venueKeys and are
 * treated identically to gibberish — there is no fallback resolution.
 */

import { isKnownDiningVenueKey } from "./dining";
import { MAX_BULK_VENUE_KEYS } from "./ratingsSql";

export { MAX_BULK_VENUE_KEYS };

export type BulkVenueKeysResult =
  | { ok: true; venueKeys: string[] }
  | { ok: false; error: string };

/**
 * Parse `?venueKeys=a,b,c`.
 *
 * Documented contract for keys that are not in the permanent registry:
 * **they are omitted from the response, not rejected.** A client running
 * cached JavaScript after a venue is retired should lose one card's rating,
 * not the whole page's. Callers can still tell the two apart — a known venue
 * with no ratings is present with `ratingCount: 0`, an unknown key is absent.
 *
 * The size limit is checked against the raw requested list, before dedupe and
 * before the registry filter. Otherwise 10,000 junk keys would collapse to a
 * handful and slip under the cap after we had already parsed them.
 */
export function parseBulkVenueKeys(raw: string | null): BulkVenueKeysResult {
  if (raw === null) {
    return { ok: false, error: "venueKeys is required" };
  }

  const requested = raw
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key !== "");

  if (requested.length === 0) {
    return { ok: false, error: "venueKeys must list at least one key" };
  }
  if (requested.length > MAX_BULK_VENUE_KEYS) {
    return {
      ok: false,
      error: `venueKeys accepts at most ${MAX_BULK_VENUE_KEYS} keys`,
    };
  }

  // Dedupe first: a repeated key must not consume two SQL placeholders, and
  // must not appear twice in the IN list.
  const seen = new Set<string>();
  const venueKeys: string[] = [];
  for (const key of requested) {
    if (seen.has(key)) continue;
    seen.add(key);
    if (isKnownDiningVenueKey(key)) venueKeys.push(key);
  }

  return { ok: true, venueKeys };
}

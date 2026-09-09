/**
 * Pure validation for rating submissions.
 *
 * Deliberately hand-written: a schema library would be a dependency and a
 * bundle cost for four integers. Fails closed — anything not explicitly
 * allowed is rejected, including unknown properties, so a malformed or
 * probing payload can never reach SQL.
 *
 * The database enforces the same contract independently (hardened typeof()
 * CHECKs), so neither layer is trusted alone.
 */

import { isKnownDiningVenueKey } from "./dining";
import { RATING_MAX, RATING_MIN, type DiningRatingInput } from "./ratingsTypes";

const ALLOWED_KEYS = ["overall", "taste", "value", "quality"] as const;

export type RatingValidationResult =
  | { ok: true; value: DiningRatingInput }
  | { ok: false; errors: string[] };

/**
 * A whole star, 1–5.
 *
 * `Number.isInteger` already rejects NaN, Infinity, decimals and every
 * non-number, so booleans and numeric strings fall out here rather than being
 * coerced.
 */
function isWholeStar(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= RATING_MIN &&
    value <= RATING_MAX
  );
}

export function validateRatingInput(payload: unknown): RatingValidationResult {
  const errors: string[] = [];

  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, errors: ["payload must be an object"] };
  }
  const raw = payload as Record<string, unknown>;

  for (const key of Object.keys(raw)) {
    if (!(ALLOWED_KEYS as readonly string[]).includes(key)) {
      errors.push(`unknown property '${key}'`);
    }
  }

  if (!("overall" in raw)) {
    errors.push("overall is required");
  } else if (!isWholeStar(raw.overall)) {
    errors.push(`overall must be a whole number ${RATING_MIN}-${RATING_MAX}`);
  }

  for (const key of ["taste", "value", "quality"] as const) {
    if (!(key in raw) || raw[key] === undefined) continue;
    if (!isWholeStar(raw[key])) {
      errors.push(`${key} must be a whole number ${RATING_MIN}-${RATING_MAX} when present`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const value: DiningRatingInput = { overall: raw.overall as number };
  for (const key of ["taste", "value", "quality"] as const) {
    if (key in raw && raw[key] !== undefined) value[key] = raw[key] as number;
  }
  return { ok: true, value };
}

/**
 * A rating may only be filed against a minted permanent venueKey.
 *
 * Rejects canonicalIds, slugs, externalIds, festival booth ids and attraction
 * ids. There is no fallback resolution: a venueKey that happens to share text
 * with a slug is still only accepted because it is in the venueKey registry.
 */
export function validateRatingVenueKey(venueKey: unknown): RatingValidationResult extends never
  ? never
  : { ok: true; venueKey: string } | { ok: false; errors: string[] } {
  if (typeof venueKey !== "string" || venueKey.trim() === "") {
    return { ok: false, errors: ["venueKey must be a non-empty string"] };
  }
  if (!isKnownDiningVenueKey(venueKey)) {
    return { ok: false, errors: [`unknown venueKey '${venueKey}'`] };
  }
  return { ok: true, venueKey };
}

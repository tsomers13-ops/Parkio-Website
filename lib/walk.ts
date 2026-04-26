/**
 * Simulated walk-time helpers — no real GPS, no external geocoding.
 *
 * Computes a rough "minutes to walk" between two ride coordinates by
 * multiplying degree-Euclidean distance by a tuned scale factor, then
 * buckets the result into one of four user-friendly ranges.
 *
 * Calibrated against real Magic Kingdom rides — at 1000 min/deg:
 *   Pirates → Tiana          (0.0016 deg) ≈ 1.6 min   "1–2 min walk"
 *   Pirates → Thunder Mtn    (0.0020 deg) ≈ 2.0 min   "1–2 min walk"
 *   Pirates → Haunted Mansion(0.0026 deg) ≈ 2.6 min   "3–5 min walk"
 *   Pirates → Small World    (0.0033 deg) ≈ 3.3 min   "3–5 min walk"
 *   Pirates → Peoplemover    (0.0052 deg) ≈ 5.2 min   "5–8 min walk"
 *   Pirates → Space Mountain (0.0061 deg) ≈ 6.1 min   "5–8 min walk"
 *
 * Each bucket is a stable range string so we never expose a
 * misleading exact number.
 */

const WALK_MIN_PER_DEG = 1000;

export type WalkBucket =
  | "1–2 min walk"
  | "3–5 min walk"
  | "5–8 min walk"
  | "8+ min walk";

/**
 * Raw walk minutes — used internally for bucketing, not for display.
 * Caller passes in two `{lat, lng}` points.
 */
export function walkMinutes(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dlat = a.lat - b.lat;
  const dlng = a.lng - b.lng;
  return Math.sqrt(dlat * dlat + dlng * dlng) * WALK_MIN_PER_DEG;
}

/**
 * Bucket walk-time into the four user-facing ranges. Always returns
 * a range string; never an exact number.
 */
export function walkBucket(walkMin: number): WalkBucket {
  if (walkMin < 2.5) return "1–2 min walk";
  if (walkMin < 5) return "3–5 min walk";
  if (walkMin < 8) return "5–8 min walk";
  return "8+ min walk";
}

/**
 * Convenience: distance + bucket in one call. Returns null when the
 * two points refer to the same ride (no point in showing "0 min").
 */
export function walkBucketBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): WalkBucket | null {
  const m = walkMinutes(a, b);
  if (m === 0) return null;
  return walkBucket(m);
}

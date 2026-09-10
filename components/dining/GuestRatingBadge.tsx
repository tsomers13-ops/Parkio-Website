import { guestRatingLabel, ratingCountLabel, type BulkRatingEntry } from "@/lib/ratingsClient";
import { toDisplayAverage } from "@/lib/ratingsTypes";

/**
 * The community signal on a discovery card.
 *
 * Compact by design — a guest scanning 42 EPCOT venues wants "do other people
 * like this?" answered in a glance, not a breakdown. Taste, Value and Quality
 * stay on the detail page.
 *
 * This is NOT the Parkio Score. That is editorial, out of 10, and appears on
 * a card only as the "Parkio pick" marker; this is community, out of 5, and
 * carries its own count. The two never share a scale or a visual cluster.
 *
 * Renders nothing at all in three cases, and that is the whole point:
 *
 *   - ratings could not be read  (`rating` is null/undefined)
 *   - the venue has no ratings   (`ratingCount` is 0)
 *   - the average is missing     (defensive; a count without an average)
 *
 * A zero-rating venue is common — most of the 62 will be unrated for a long
 * time — and stamping "0.0 ★" or "No guest ratings yet" on every card would
 * be both cluttered and, in the first case, a lie. The card is already
 * complete without this line.
 *
 * Everything here is phrasing content: the card is a single <a>, so a <div>
 * or <p> would be invalid inside it.
 */
export function GuestRatingBadge({ rating }: { rating?: BulkRatingEntry | null }) {
  if (!rating || rating.ratingCount < 1 || rating.overallAverage === null) return null;

  const average = toDisplayAverage(rating.overallAverage);
  if (average === null) return null;

  return (
    <span className="mt-2 flex items-center gap-1.5 text-sm">
      {/* One accessible sentence; the visual parts are decorative fragments. */}
      <span className="sr-only">{guestRatingLabel(average, rating.ratingCount)}</span>
      <svg
        viewBox="0 0 20 20"
        aria-hidden="true"
        focusable="false"
        className="h-4 w-4 shrink-0 text-amber-500"
        fill="currentColor"
      >
        <path d="M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.2l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.6z" />
      </svg>
      <span aria-hidden="true" className="font-semibold text-ink-900">
        {average.toFixed(1)}
      </span>
      <span aria-hidden="true" className="text-ink-300">
        ·
      </span>
      <span aria-hidden="true" className="text-ink-600">
        {ratingCountLabel(rating.ratingCount)}
      </span>
    </span>
  );
}

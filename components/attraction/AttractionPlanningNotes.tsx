import { isTopRide } from "@/lib/popularity";
import type { Park, Ride } from "@/lib/types";

/**
 * Short planning notes, derived only from data Parkio actually holds.
 *
 * Two sources, both source-backed:
 *   • the hand-curated headliner set in lib/popularity.ts
 *   • the presence of a height restriction
 *
 * When neither applies the section renders nothing. That is deliberate —
 * an attraction with no notable planning facts gets no notes rather than
 * invented ones ("best at rope drop", "skip if motion sick", and similar
 * claims the dataset cannot support).
 */

export function planningNotes(park: Park, ride: Ride): string[] {
  const notes: string[] = [];

  if (isTopRide(park.id, ride.id)) {
    notes.push(
      `Parkio lists this among the headline attractions at ${park.name}.`,
    );
  }

  if (ride.height) {
    // `ride.height` is already a full phrase (e.g. '42" (107 cm) minimum'),
    // so it is quoted as-is rather than wrapped in wording that repeats it.
    notes.push(
      `Height requirement: ${ride.height}. Not everyone in a group may be able to ride.`,
    );
  }

  return notes;
}

export function AttractionPlanningNotes({
  park,
  ride,
}: {
  park: Park;
  ride: Ride;
}) {
  const notes = planningNotes(park, ride);
  if (notes.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight text-ink-900">
        Worth knowing
      </h2>
      <ul className="mt-3 space-y-2">
        {notes.map((note) => (
          <li
            key={note}
            className="flex gap-2.5 text-sm leading-relaxed text-ink-600"
          >
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-300" />
            <span>{note}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

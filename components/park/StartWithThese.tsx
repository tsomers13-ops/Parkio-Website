import Link from "next/link";
import { categoryLabel } from "@/components/attraction/AttractionFacts";
import { attractionCanonicalPath } from "@/lib/attractionRoute";
import { getRidesForPark } from "@/lib/data";
import { isTopRide } from "@/lib/popularity";
import { planningLand } from "@/lib/lands";
import type { Park, ParkId, Ride } from "@/lib/types";

/**
 * The park's curated headline attractions.
 *
 * The set comes entirely from lib/popularity.ts — the existing
 * hand-curated list. Nothing here ranks by live wait, base wait, or any
 * invented score, and the ordering is simply the dataset's own order so
 * it is deterministic.
 *
 * The heading is "Start with these" rather than "Best rides" or
 * "Must-do": the curated data supports "these are the headliners", not a
 * quality judgement or a personal recommendation.
 */
export function startWithThese(park: Park): Ride[] {
  return getRidesForPark(park.id as ParkId).filter((ride) =>
    isTopRide(park.id, ride.id),
  );
}

export function StartWithThese({ park }: { park: Park }) {
  const rides = startWithThese(park);
  if (rides.length === 0) return null;

  return (
    <section className="mx-auto max-w-5xl px-5 pt-14 sm:px-8 sm:pt-16">
      <h2 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
        Start with these
      </h2>
      <p className="mt-2 text-ink-600">
        The headline attractions at {park.name}.
      </p>

      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rides.map((ride) => (
          <li key={ride.id}>
            <Link
              href={attractionCanonicalPath(park.id, ride.id)}
              className="block h-full rounded-2xl border border-ink-100 bg-white px-4 py-4 shadow-soft transition hover:border-ink-200 hover:bg-ink-50"
            >
              <span className="block text-[11px] font-medium uppercase tracking-widest text-ink-500">
                {planningLand(ride.land)}
              </span>
              <span className="mt-0.5 block text-base font-semibold text-ink-900">
                {ride.name}
              </span>
              <span className="mt-1 block text-xs text-ink-500">
                {categoryLabel(ride.category)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

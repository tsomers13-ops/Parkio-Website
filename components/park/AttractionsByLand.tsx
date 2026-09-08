import Link from "next/link";
import {
  categoryLabel,
  heightLabel,
  lightningLaneLabel,
} from "@/components/attraction/AttractionFacts";
import { attractionCanonicalPath } from "@/lib/attractionRoute";
import { getRidesForPark } from "@/lib/data";
import { groupRidesByLand, pavilionName } from "@/lib/lands";
import type { Park, ParkId } from "@/lib/types";

/**
 * Server-rendered attraction discovery for a park.
 *
 * No live data, no client boundary, no map state, no browser APIs — this
 * is the crawlable, always-available way into the 84 attraction pages.
 *
 * Rides are sourced by park inside this component, so a caller cannot
 * accidentally hand it a mixed list. Every link is built with the Slice 2
 * canonical path helper using this park's own id.
 */
export function AttractionsByLand({ park }: { park: Park }) {
  const rides = getRidesForPark(park.id as ParkId);
  const groups = groupRidesByLand(rides);

  if (groups.length === 0) return null;

  return (
    <section
      id="attractions"
      className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-16"
    >
      <h2 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
        Attractions at {park.name}
      </h2>
      <p className="mt-2 text-ink-600">
        {rides.length} {rides.length === 1 ? "attraction" : "attractions"},
        grouped by area. Open any one for planning details.
      </p>

      <div className="mt-10 space-y-10">
        {groups.map((group) => (
          <div key={group.name}>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-accent-600">
              {group.name}
            </h3>

            <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {group.rides.map((ride) => {
                const pavilion = pavilionName(ride.land);
                return (
                  <li key={ride.id}>
                    <Link
                      href={attractionCanonicalPath(park.id, ride.id)}
                      className="block h-full rounded-2xl border border-ink-100 bg-white px-4 py-4 shadow-soft transition hover:border-ink-200 hover:bg-ink-50"
                    >
                      {pavilion && (
                        <span className="block text-[11px] font-medium uppercase tracking-widest text-ink-500">
                          {pavilion}
                        </span>
                      )}
                      <span className="mt-0.5 block text-base font-semibold text-ink-900">
                        {ride.name}
                      </span>
                      <span className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs text-ink-600">
                        <span className="rounded-full bg-ink-100 px-2 py-0.5 font-medium">
                          {categoryLabel(ride.category)}
                        </span>
                        <span className="rounded-full bg-ink-100 px-2 py-0.5 font-medium">
                          {heightLabel(ride.height)}
                        </span>
                        <span className="rounded-full bg-ink-100 px-2 py-0.5 font-medium">
                          Lightning Lane: {lightningLaneLabel(ride.lightningLane)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

import { getRidesForPark } from "@/lib/data";
import { groupRidesByLand } from "@/lib/lands";
import type { Park, ParkId } from "@/lib/types";

/**
 * A short, factual orientation to the park — what is here and how it is
 * organised — derived entirely by counting the existing dataset.
 *
 * Deliberately not a dashboard. Nothing here is a crowd score, a "best
 * time", a wait statistic, or a historical claim: the D1 snapshot table
 * has no read path, so any trend figure would be fabricated.
 */
export function parkPlanningSummary(park: Park) {
  const rides = getRidesForPark(park.id as ParkId);
  const groups = groupRidesByLand(rides);
  return {
    attractions: rides.length,
    areas: groups.length,
    withHeightRequirement: rides.filter((r) => r.height).length,
    withoutHeightRequirement: rides.filter((r) => !r.height).length,
    lightningLane: rides.filter((r) => r.lightningLane).length,
  };
}

export function ParkPlanningOverview({ park }: { park: Park }) {
  const summary = parkPlanningSummary(park);

  const stats: Array<{ value: string; label: string }> = [
    { value: String(summary.attractions), label: "Attractions on Parkio" },
    { value: String(summary.areas), label: "Areas to explore" },
    {
      value: String(summary.withHeightRequirement),
      label: "Have a height requirement",
    },
    { value: String(summary.lightningLane), label: "Offer Lightning Lane" },
  ];

  return (
    <section id="plan" className="mx-auto max-w-5xl px-5 pt-12 sm:px-8 sm:pt-14">
      <h2 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
        Planning {park.name}
      </h2>
      <p className="mt-2 max-w-2xl text-ink-600">
        {summary.attractions} attractions across {summary.areas} areas.{" "}
        {summary.withoutHeightRequirement} of them have no height requirement,
        so most of a group can ride together.
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-ink-100 bg-white px-4 py-4 shadow-soft"
          >
            <dt className="sr-only">{stat.label}</dt>
            <dd>
              <span className="block text-2xl font-semibold text-ink-900">
                {stat.value}
              </span>
              <span className="mt-1 block text-xs text-ink-600">
                {stat.label}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

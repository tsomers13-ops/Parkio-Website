import Link from "next/link";
import { Chip } from "@/components/dining/DiningFacts";
import {
  getIndexablePermanentDining,
  getPermanentDiningForPark,
  isDiningParkId,
} from "@/lib/dining";
import { diningCanonicalPath, parkDiningPath } from "@/lib/diningRoute";
import { DINING_TYPES, diningTypeLabel } from "@/lib/diningTypes";
import {
  getBoothStatus,
  getFestival,
  getFestivalStatus,
  getSeasonalDiningForPark,
  todayInPark,
} from "@/lib/seasonalDining";
import type { Park } from "@/lib/types";

/**
 * Compact dining entry point on a park page.
 *
 * Deliberately a preview, not the experience: it answers "what are my food
 * options here?" and hands off to the dining page. The park page stays
 * scannable — no 45 booths, no 42 venue cards.
 */
export function ParkDiningModule({ park }: { park: Park }) {
  if (!isDiningParkId(park.id)) return null;

  const venues = getPermanentDiningForPark(park.id);
  if (venues.length === 0) return null;

  const counts = DINING_TYPES.map((type) => ({
    type,
    count: venues.filter((venue) => venue.type === type).length,
  })).filter((entry) => entry.count > 0);

  // Preview the venues Parkio has actually reviewed, best-scored first.
  // parkioScore is source data, so this is a real ranking, not an invented one.
  const highlights = [...getIndexablePermanentDining(park.id)]
    .sort((a, b) => (b.editorial?.parkioScore ?? 0) - (a.editorial?.parkioScore ?? 0))
    .slice(0, 3);

  const today = todayInPark();
  const booths = getSeasonalDiningForPark(park.id);
  const festival = booths.length > 0 ? getFestival(booths[0].festivalId) : undefined;
  const festivalActive =
    festival !== undefined && getFestivalStatus(festival, today) === "active";
  const participating = festivalActive
    ? booths.filter((booth) => getBoothStatus(booth, today) !== "expired").length
    : 0;

  return (
    <section id="dining" className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-16">
      <h2 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
        Dining at {park.name}
      </h2>
      <p className="mt-2 text-ink-600">
        {venues.length} year-round locations, from grab-and-go kiosks to table service.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {counts.map(({ type, count }) => (
          <Chip key={type}>
            {count} {diningTypeLabel(type)}
          </Chip>
        ))}
      </div>

      {highlights.length > 0 && (
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {highlights.map((venue) => (
            <li key={venue.slug}>
              <Link
                href={diningCanonicalPath(venue.parkId, venue.slug)}
                className="block h-full rounded-2xl border border-ink-100 bg-white px-4 py-4 shadow-soft transition hover:border-ink-200 hover:bg-ink-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
              >
                <span className="block text-sm font-semibold text-ink-900">{venue.name}</span>
                <span className="mt-1 block text-xs text-ink-500">
                  {diningTypeLabel(venue.type)} · {venue.land}
                </span>
                {venue.editorial && (
                  <span className="mt-2 block text-sm leading-snug text-ink-600">
                    {venue.editorial.shortVerdict}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {festivalActive && festival && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/70 px-5 py-5">
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
            Happening now
          </span>
          <h3 className="mt-2 text-lg font-semibold text-ink-900">{festival.name}</h3>
          <p className="mt-1 text-sm text-ink-600">
            {participating} participating locations · {festival.startsOn} to {festival.endsOn}
          </p>
          <Link
            href={`${parkDiningPath(park.id)}#festival-heading`}
            className="mt-3 inline-block text-sm font-medium text-accent-700 hover:underline"
          >
            Explore festival food →
          </Link>
        </div>
      )}

      <Link
        href={parkDiningPath(park.id)}
        className="mt-6 inline-block rounded-full border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-800 shadow-soft transition hover:border-ink-300 hover:bg-ink-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
      >
        Explore all {park.name} dining
      </Link>
    </section>
  );
}

"use client";

/**
 * BestRidesAllParksGrid
 *
 * Compact "top picks per park" grid for the /best-rides-today hub.
 *
 * Reuses the SAME data + scoring as ParkRecommendations:
 *   - `useAllLive()` — single multiplexed fetch across all 6 parks
 *     (the same hook /waits already uses, so no extra round-trips).
 *   - `partitionAttractions()` — Parkio Picks logic from lib/popularity
 *     (best-now / backup / skip).
 *
 * Renders the top 1–2 "best now" picks for each park as inline links —
 * no new visual primitives, just <Link> + Tailwind. A user can scan
 * all six parks in one view and click straight into the park's full
 * Picks page.
 *
 * If you want to extend the per-park section, do it inside
 * <ParkRecommendations> on the park-specific page. This grid is
 * deliberately minimal so it doesn't compete with that surface.
 */

import Link from "next/link";

import { partitionAttractions } from "@/lib/popularity";
import type { ApiAttraction, ApiPark } from "@/lib/types";
import { useAllLive } from "@/lib/useAllLive";
import { waitColorClasses, waitTier } from "@/lib/utils";

const PICKS_PER_PARK = 2;

export function BestRidesAllParksGrid() {
  const { status, parks, liveByPark } = useAllLive();

  if (status === "loading" && parks.length === 0) {
    return (
      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        <div className="rounded-3xl border border-ink-100 bg-white p-12 text-center text-ink-500 shadow-soft">
          Loading the best picks across every park…
        </div>
      </section>
    );
  }

  return (
    <section className="border-t border-ink-100 bg-white">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {parks.map((park) => {
            const attractions = liveByPark.get(park.slug)?.attractions ?? [];
            return <ParkPicksBlock key={park.slug} park={park} attractions={attractions} />;
          })}
        </div>
      </div>
    </section>
  );
}

function ParkPicksBlock({
  park,
  attractions,
}: {
  park: ApiPark;
  attractions: ApiAttraction[];
}) {
  const { bestNow } = partitionAttractions(park.slug, attractions);
  const topPicks = bestNow.slice(0, PICKS_PER_PARK);

  return (
    <article className="rounded-3xl border border-ink-100 bg-white p-6 shadow-soft sm:p-7">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <Link
          href={`/${park.slug}-best-rides-today`}
          className="block text-2xl font-semibold tracking-tight text-ink-900 transition hover:text-accent-600"
        >
          {park.name}
        </Link>
        <Link
          href={`/${park.slug}-best-rides-today`}
          className="text-sm font-semibold text-accent-700 transition hover:text-accent-900"
        >
          See all picks →
        </Link>
      </header>

      {topPicks.length === 0 ? (
        <p className="mt-4 text-sm text-ink-500">
          No standout picks right now. Live waits are still loading or the
          park hasn't opened — check back shortly.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {topPicks.map((pick, i) => {
            const wait = pick.waitMinutes;
            return (
              <li
                key={pick.slug}
                className="flex items-center justify-between rounded-2xl bg-ink-50/60 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-accent-700">
                    Pick {i + 1}
                  </div>
                  <div className="mt-0.5 truncate text-base font-semibold text-ink-900">
                    {pick.name}
                  </div>
                </div>
                {typeof wait === "number" && (
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${waitColorClasses(waitTier(wait))}`}
                  >
                    {wait} min
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}

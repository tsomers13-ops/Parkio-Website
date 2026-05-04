/**
 * SeoParkLanding
 *
 * Composition helper for the park-specific "today" SEO landing pages.
 * Reuses the SAME live-data components that power /parks/[parkId] —
 * no new visual design, no new data flow. The only new thing is the
 * outer copy (H1 + intro + below-the-map conversion stack), which is
 * deliberately tuned for the high-intent "today" search query.
 *
 * If you find yourself adding new UI here, that's a sign the change
 * belongs on the /parks/[parkId] page itself — keep this file thin.
 */

import Link from "next/link";

import { ConversionBlock } from "@/components/ConversionBlock";
import { Footer } from "@/components/Footer";
import { HomeDailyTeaser } from "@/components/HomeDailyTeaser";
import { MapFocusProvider } from "@/components/MapFocusProvider";
import { Navbar } from "@/components/Navbar";
import { ParkLiveDataProvider } from "@/components/ParkLiveDataProvider";
import { ParkMap } from "@/components/ParkMap";
import { ParkRightNow } from "@/components/ParkRightNow";
import type { Park, Ride } from "@/lib/types";

export interface SeoParkLandingProps {
  park: Park;
  rides: Ride[];
  /** Long-form date string (e.g. "Monday, May 4, 2026"). */
  todayLong: string;
}

export function SeoParkLanding({
  park,
  rides,
  todayLong,
}: SeoParkLandingProps) {
  return (
    <main className="relative min-h-screen bg-white">
      <Navbar />

      {/* Hero — front-loads "today" + park name so the page literally
          matches the search query intent. */}
      <section className="relative">
        <div className="bg-aurora absolute inset-0 -z-10 opacity-70" />
        <div className="mx-auto max-w-7xl px-5 pb-8 pt-10 sm:px-8 sm:pb-12 sm:pt-14">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-widest text-accent-600">
              Today · {todayLong}
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
              {park.name} wait times today.
            </h1>
            <p className="mt-4 text-lg text-ink-600">
              Live queues for every operating attraction at {park.name},
              refreshed every minute. Below: the best ride to head to right
              now, plus the full live map.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`/parks/${park.id}`}
                className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-ink-800"
              >
                Open {park.shortName ?? park.name} on Parkio
              </Link>
              <Link
                href="/guide"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink-900 ring-1 ring-ink-200 transition hover:bg-ink-50"
              >
                Read Parkio Daily →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Live data — exact same data flow used on /parks/[parkId] so
          there's no duplication of fetches or component logic. */}
      <ParkLiveDataProvider parkSlug={park.id}>
        <MapFocusProvider>
          <ParkRightNow park={park} rides={rides} />
          <div id="park-map" className="scroll-mt-4">
            <ParkMap park={park} rides={rides} />
          </div>
        </MapFocusProvider>
      </ParkLiveDataProvider>

      {/* Conversion stack: Parkio Daily teaser, then app download, then
          the standard footer. Mirrors the home page's lower funnel. */}
      <section className="mx-auto max-w-7xl px-5 pt-12 sm:px-8 sm:pt-16">
        <HomeDailyTeaser />
      </section>

      <section className="mx-auto max-w-3xl px-5 pb-16 pt-10 sm:px-8 sm:pb-24">
        <ConversionBlock variant="app" />
      </section>

      <Footer />
    </main>
  );
}

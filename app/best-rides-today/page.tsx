import type { Metadata } from "next";
import Link from "next/link";

import { AppDownloadButton } from "@/components/AppDownloadButton";
import { BestRidesAllParksGrid } from "@/components/BestRidesAllParksGrid";
import { ConversionBlock } from "@/components/ConversionBlock";
import { Footer } from "@/components/Footer";
import { HomeDailyTeaser } from "@/components/HomeDailyTeaser";
import { Navbar } from "@/components/Navbar";
import { getTodayLandingDate } from "@/lib/seoLandingDate";

/**
 * Park-cluster internal-nav links for the "best rides today" hub.
 * Hand-curated (mirrors /wait-times-today) so the slug→landing-page
 * mapping is visible here and the order matches search demand.
 */
const PARK_LANDINGS: ReadonlyArray<{
  name: string;
  resort: string;
  href: string;
}> = [
  { name: "Magic Kingdom", resort: "Walt Disney World", href: "/magic-kingdom-best-rides-today" },
  { name: "EPCOT", resort: "Walt Disney World", href: "/epcot-best-rides-today" },
  { name: "Hollywood Studios", resort: "Walt Disney World", href: "/hollywood-studios-best-rides-today" },
  { name: "Animal Kingdom", resort: "Walt Disney World", href: "/animal-kingdom-best-rides-today" },
  { name: "Disneyland", resort: "Disneyland Resort", href: "/disneyland-best-rides-today" },
  { name: "California Adventure", resort: "Disneyland Resort", href: "/california-adventure-best-rides-today" },
];

/* ─────────────────────────────────────────────────────────────────
 * /best-rides-today
 *
 * SEO landing page targeting the cross-park decision query
 *   "best disney rides today"
 *
 * Sister page to /wait-times-today. Where /wait-times-today shows
 * the raw data, this page shows the *decision*: Parkio's top 1–2
 * picks per park right now, derived from the same live data via
 * `partitionAttractions()`. No new visual primitives — the hub grid
 * and the per-park pages compose existing components.
 * ───────────────────────────────────────────────────────────────── */

const PATH = "/best-rides-today";

export function generateMetadata(): Metadata {
  const { long } = getTodayLandingDate();
  const title = `Best Disney Rides Today — ${long}`;
  const description = `What to ride at Disney today, ${long}. Parkio's smart picks across Magic Kingdom, EPCOT, Hollywood Studios, Animal Kingdom, Disneyland, and California Adventure — headliners with short queues, walk-on gems, and what to skip — refreshed every minute.`;
  return {
    title,
    description,
    alternates: { canonical: PATH },
    openGraph: {
      title: "Best Disney Rides Today — Parkio",
      description,
      type: "website",
      url: PATH,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function BestRidesTodayPage() {
  const { long } = getTodayLandingDate();

  return (
    <main className="min-h-screen bg-white">
      <Navbar />

      <section className="relative">
        <div className="bg-aurora absolute inset-0 -z-10 opacity-70" />
        <div className="mx-auto max-w-7xl px-5 pb-12 pt-12 sm:px-8 sm:pb-16 sm:pt-16">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-widest text-accent-600">
              Today · {long}
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
              Best Disney rides today.
            </h1>
            <p className="mt-4 text-lg text-ink-600">
              Smart picks across all six U.S. Disney parks based on live wait
              times right now. Headliners with short queues, walk-on gems most
              people skip, and what to avoid until later — refreshed every
              minute.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              {/* Primary CTA: App Store. Above the fold. */}
              <AppDownloadButton tone="dark" size="md" />
              <Link
                href="/parks"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink-900 ring-1 ring-ink-200 transition hover:bg-ink-50"
              >
                Open in app
              </Link>
              <Link
                href="/wait-times-today"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink-900 ring-1 ring-ink-200 transition hover:bg-ink-50"
              >
                See live wait times →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* By-park internal navigation. Six explicit links to the park-
          specific best-rides-today pages so Google can discover the
          full cluster in one crawl and visitors can jump straight to
          the park they're searching for. */}
      <section className="mx-auto max-w-7xl px-5 sm:px-8">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-ink-500">
          Best rides by park
        </h2>
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PARK_LANDINGS.map((p) => (
            <li key={p.href}>
              <Link
                href={p.href}
                className="group flex items-center justify-between rounded-2xl bg-white px-5 py-4 ring-1 ring-ink-100 transition hover:ring-ink-300 hover:shadow-soft"
              >
                <div>
                  <div className="text-base font-semibold text-ink-900">
                    {p.name}
                  </div>
                  <div className="text-xs text-ink-500">{p.resort}</div>
                </div>
                <span className="text-ink-400 transition group-hover:translate-x-0.5 group-hover:text-ink-700">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* The full per-park top-picks grid — primary content. */}
      <BestRidesAllParksGrid />

      {/* Conversion: Parkio Daily teaser */}
      <section className="mx-auto max-w-7xl px-5 sm:px-8">
        <HomeDailyTeaser />
      </section>

      {/* Conversion: app download */}
      <section className="mx-auto max-w-3xl px-5 pb-16 pt-10 sm:px-8 sm:pb-24">
        <ConversionBlock variant="app" />
      </section>

      <Footer />
    </main>
  );
}

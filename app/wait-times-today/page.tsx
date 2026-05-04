import type { Metadata } from "next";
import Link from "next/link";
import { ConversionBlock } from "@/components/ConversionBlock";
import { Footer } from "@/components/Footer";
import { HomeDailyTeaser } from "@/components/HomeDailyTeaser";
import { Navbar } from "@/components/Navbar";
import { ParksTodayOverview } from "@/components/ParksTodayOverview";
import { WaitsAllParks } from "@/components/WaitsAllParks";
import { getTodayLandingDate } from "@/lib/seoLandingDate";

/**
 * Park-cluster internal-nav links. Hand-curated rather than derived
 * from disneyParkConfig so the slug→landing-page mapping is visible
 * here and the order matches search demand (WDW first by traffic,
 * Disneyland Resort below). Adding a new park = add a row here.
 */
const PARK_LANDINGS: ReadonlyArray<{
  name: string;
  resort: string;
  href: string;
}> = [
  { name: "Magic Kingdom", resort: "Walt Disney World", href: "/magic-kingdom-wait-times-today" },
  { name: "EPCOT", resort: "Walt Disney World", href: "/epcot-wait-times-today" },
  { name: "Hollywood Studios", resort: "Walt Disney World", href: "/hollywood-studios-wait-times-today" },
  { name: "Animal Kingdom", resort: "Walt Disney World", href: "/animal-kingdom-wait-times-today" },
  { name: "Disneyland", resort: "Disneyland Resort", href: "/disneyland-wait-times-today" },
  { name: "California Adventure", resort: "Disneyland Resort", href: "/california-adventure-wait-times-today" },
];

/* ─────────────────────────────────────────────────────────────────
 * /wait-times-today
 *
 * SEO landing page targeting the cross-park query
 *   "disney wait times today"
 *
 * The page reuses the same components that power /waits — no new UI
 * built — but front-loads the date and "today" framing for query
 * intent, plus pushes the Parkio Daily and the iPhone app.
 * ───────────────────────────────────────────────────────────────── */

const PATH = "/wait-times-today";

export function generateMetadata(): Metadata {
  const { long } = getTodayLandingDate();
  const title = `Disney Wait Times Today — ${long}`;
  const description = `Live Disney wait times for ${long}. Real-time queues at Magic Kingdom, EPCOT, Hollywood Studios, Animal Kingdom, Disneyland, and California Adventure — refreshed every minute on Parkio.`;
  return {
    title,
    description,
    alternates: { canonical: PATH },
    openGraph: {
      title: "Disney Wait Times Today — Parkio",
      description,
      type: "website",
      url: PATH,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function WaitTimesTodayPage() {
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
              Disney wait times today.
            </h1>
            <p className="mt-4 text-lg text-ink-600">
              Live queues across all six U.S. Disney parks, refreshed every
              minute. Tap a park to see every operating ride and the best
              picks right now.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/parks"
                className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-ink-800"
              >
                Open Parkio
              </Link>
              <Link
                href="/guide"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink-900 ring-1 ring-ink-200 transition hover:bg-ink-50"
              >
                Read Parkio Daily →
              </Link>
            </div>
          </div>

          <ParksTodayOverview />
        </div>
      </section>

      {/* By-park internal navigation. Six explicit links to the park-
          specific landing pages so Google can discover the full
          cluster in one crawl and visitors can jump straight to the
          park they're searching for. Renders as a dense pill grid so
          all six fit above the fold on mobile. */}
      <section className="mx-auto max-w-7xl px-5 sm:px-8">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-ink-500">
          Wait times by park
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

      {/* The full per-park live grid — reused 1:1 from /waits */}
      <WaitsAllParks />

      {/* Conversion: Parkio Daily teaser → keeps the reader in the
          Parkio ecosystem with the latest briefing. */}
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

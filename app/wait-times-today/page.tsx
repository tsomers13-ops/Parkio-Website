import type { Metadata } from "next";
import Link from "next/link";
import { AppDownloadButton } from "@/components/AppDownloadButton";
import { ConversionBlock } from "@/components/ConversionBlock";
import { Footer } from "@/components/Footer";
import { HomeDailyTeaser } from "@/components/HomeDailyTeaser";
import { Navbar } from "@/components/Navbar";
import { ParkLandingLinks } from "@/components/ParkLandingLinks";
import { ParksTodayOverview } from "@/components/ParksTodayOverview";
import { WaitsAllParks } from "@/components/WaitsAllParks";
import { getTodayLandingDate } from "@/lib/seoLandingDate";

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
              {/* Primary CTA: App Store. Above the fold. */}
              <AppDownloadButton tone="dark" size="md" />
              <Link
                href="/parks"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink-900 ring-1 ring-ink-200 transition hover:bg-ink-50"
              >
                Open in app
              </Link>
              <Link
                href="/best-rides-today"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink-900 ring-1 ring-ink-200 transition hover:bg-ink-50"
              >
                See best rides today →
              </Link>
            </div>
          </div>

          <ParksTodayOverview />
        </div>
      </section>

      <ParkLandingLinks variant="wait-times" heading="Wait times by park" />

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

import type { Metadata } from "next";
import Link from "next/link";

import { AppDownloadButton } from "@/components/AppDownloadButton";
import { BestRidesAllParksGrid } from "@/components/BestRidesAllParksGrid";
import { ConversionBlock } from "@/components/ConversionBlock";
import { Footer } from "@/components/Footer";
import { HomeDailyTeaser } from "@/components/HomeDailyTeaser";
import { Navbar } from "@/components/Navbar";
import { ParkLandingLinks } from "@/components/ParkLandingLinks";
import { getTodayLandingDate } from "@/lib/seoLandingDate";

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

      <ParkLandingLinks variant="best-rides" heading="Best rides by park" />

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

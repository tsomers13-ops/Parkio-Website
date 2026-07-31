/**
 * Page chrome shared by the park-specific "today" SEO landing pages.
 *
 * Both intents (wait times / best rides) render the exact same shape:
 * navbar → aurora hero (date eyebrow, H1, intro, CTA row) → the live
 * section the caller passes in → Parkio Daily teaser → app conversion
 * block → footer. Only the copy and the live section differ.
 *
 * If you find yourself adding new UI here, that's a sign the change
 * belongs on the /parks/[parkId] page itself — keep this file thin.
 */

import Link from "next/link";
import type { ReactNode } from "react";

import { AppDownloadButton } from "@/components/AppDownloadButton";
import { ConversionBlock } from "@/components/ConversionBlock";
import { Footer } from "@/components/Footer";
import { HomeDailyTeaser } from "@/components/HomeDailyTeaser";
import { Navbar } from "@/components/Navbar";
import type { Park } from "@/lib/types";

export interface SeoParkShellProps {
  park: Park;
  /** Long-form date string (e.g. "Monday, May 4, 2026"). */
  todayLong: string;
  /** H1 copy — front-loads the search query intent. */
  headline: string;
  /** Supporting paragraph under the H1. */
  intro: ReactNode;
  /** Third CTA pill, after "Open in app". */
  secondaryCta: { href: string; label: string };
  /** Live-data section(s) — the actual page content. */
  children: ReactNode;
}

export function SeoParkShell({
  park,
  todayLong,
  headline,
  intro,
  secondaryCta,
  children,
}: SeoParkShellProps) {
  return (
    <main className="relative min-h-screen bg-white">
      <Navbar />

      <section className="relative">
        <div className="bg-aurora absolute inset-0 -z-10 opacity-70" />
        <div className="mx-auto max-w-7xl px-5 pb-8 pt-10 sm:px-8 sm:pb-12 sm:pt-14">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-widest text-accent-600">
              Today · {todayLong}
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
              {headline}
            </h1>
            <p className="mt-4 text-lg text-ink-600">{intro}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              {/* Primary CTA: App Store. Above the fold so a search-
                  driven visitor sees the download path first. */}
              <AppDownloadButton tone="dark" size="md" />
              <Link
                href={`/parks/${park.id}`}
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink-900 ring-1 ring-ink-200 transition hover:bg-ink-50"
              >
                Open in app
              </Link>
              <Link
                href={secondaryCta.href}
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink-900 ring-1 ring-ink-200 transition hover:bg-ink-50"
              >
                {secondaryCta.label}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {children}

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

/**
 * Factory for the per-park "today" SEO landing pages.
 *
 * There are twelve of them (six parks × two intents) and they were all
 * byte-identical apart from the park id, the SEO label and the meta
 * description. Everything else — canonical/OG/Twitter metadata shape,
 * the notFound() guard, the data lookup — lives here.
 *
 * Adding a park = one page file with four fields.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SeoParkBestRides } from "@/components/SeoParkBestRides";
import { SeoParkLanding } from "@/components/SeoParkLanding";
import { getPark, getRidesForPark } from "@/lib/data";
import { getTodayLandingDate } from "@/lib/seoLandingDate";

export type SeoParkVariant = "wait-times" | "best-rides";

const VARIANTS = {
  "wait-times": { slugSuffix: "wait-times-today", heading: "Wait Times Today" },
  "best-rides": { slugSuffix: "best-rides-today", heading: "Best Rides Today" },
} as const;

export interface SeoParkPageOptions {
  /** Park id from lib/data — also the first half of the URL slug. */
  parkId: string;
  /**
   * Park name as it should read in the <title>. Deliberately separate
   * from `park.name`: search demand is for "Disneyland", not
   * "Disneyland Park".
   */
  label: string;
  variant: SeoParkVariant;
  /** Meta description; receives the long-form date (e.g. "Monday, May 4, 2026"). */
  description: (todayLong: string) => string;
}

/**
 * Returns the two exports a Next.js page module needs:
 * `generateMetadata` and the default `Page` component.
 */
export function createSeoParkPage({
  parkId,
  label,
  variant,
  description,
}: SeoParkPageOptions) {
  const { slugSuffix, heading } = VARIANTS[variant];
  const path = `/${parkId}-${slugSuffix}`;

  function generateMetadata(): Metadata {
    const { long } = getTodayLandingDate();
    const title = `${label} ${heading} — ${long}`;
    const desc = description(long);
    return {
      title,
      description: desc,
      alternates: { canonical: path },
      openGraph: {
        title: `${label} ${heading} — Parkio`,
        description: desc,
        type: "website",
        url: path,
      },
      twitter: { card: "summary_large_image", title, description: desc },
    };
  }

  function Page() {
    const park = getPark(parkId);
    if (!park) notFound();
    const rides = getRidesForPark(park.id);
    const { long } = getTodayLandingDate();
    const Surface = variant === "wait-times" ? SeoParkLanding : SeoParkBestRides;
    return <Surface park={park} rides={rides} todayLong={long} />;
  }

  return { generateMetadata, Page };
}

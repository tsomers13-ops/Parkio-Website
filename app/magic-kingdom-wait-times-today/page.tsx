import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SeoParkLanding } from "@/components/SeoParkLanding";
import { getPark, getRidesForPark } from "@/lib/data";
import { getTodayLandingDate } from "@/lib/seoLandingDate";

const PARK_ID = "magic-kingdom";
const PATH = "/magic-kingdom-wait-times-today";

export function generateMetadata(): Metadata {
  const { long } = getTodayLandingDate();
  const title = `Magic Kingdom Wait Times Today — ${long}`;
  const description = `Live Magic Kingdom wait times for ${long}. Real-time queues for every operating attraction at Walt Disney World's flagship park, refreshed every minute on Parkio.`;
  return {
    title,
    description,
    alternates: { canonical: PATH },
    openGraph: {
      title: "Magic Kingdom Wait Times Today — Parkio",
      description,
      type: "website",
      url: PATH,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function Page() {
  const park = getPark(PARK_ID);
  if (!park) notFound();
  const rides = getRidesForPark(park.id);
  const { long } = getTodayLandingDate();
  return <SeoParkLanding park={park} rides={rides} todayLong={long} />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SeoParkLanding } from "@/components/SeoParkLanding";
import { getPark, getRidesForPark } from "@/lib/data";
import { getTodayLandingDate } from "@/lib/seoLandingDate";

const PARK_ID = "disneyland";
const PATH = "/disneyland-wait-times-today";

export function generateMetadata(): Metadata {
  const { long } = getTodayLandingDate();
  const title = `Disneyland Wait Times Today — ${long}`;
  const description = `Live Disneyland Park wait times for ${long}. Real-time queues for Rise of the Resistance, Space Mountain, and every operating attraction at the original Disneyland in Anaheim, refreshed every minute on Parkio.`;
  return {
    title,
    description,
    alternates: { canonical: PATH },
    openGraph: {
      title: "Disneyland Wait Times Today — Parkio",
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

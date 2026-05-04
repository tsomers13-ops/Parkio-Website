import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SeoParkLanding } from "@/components/SeoParkLanding";
import { getPark, getRidesForPark } from "@/lib/data";
import { getTodayLandingDate } from "@/lib/seoLandingDate";

const PARK_ID = "hollywood-studios";
const PATH = "/hollywood-studios-wait-times-today";

export function generateMetadata(): Metadata {
  const { long } = getTodayLandingDate();
  const title = `Hollywood Studios Wait Times Today — ${long}`;
  const description = `Live Disney's Hollywood Studios wait times for ${long}. Real-time queues for Star Wars: Rise of the Resistance, Tower of Terror, Slinky Dog Dash, Mickey & Minnie's Runaway Railway, and every operating attraction — refreshed every minute on Parkio.`;
  return {
    title,
    description,
    alternates: { canonical: PATH },
    openGraph: {
      title: "Hollywood Studios Wait Times Today — Parkio",
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

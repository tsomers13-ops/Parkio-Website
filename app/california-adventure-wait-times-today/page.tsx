import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SeoParkLanding } from "@/components/SeoParkLanding";
import { getPark, getRidesForPark } from "@/lib/data";
import { getTodayLandingDate } from "@/lib/seoLandingDate";

const PARK_ID = "california-adventure";
const PATH = "/california-adventure-wait-times-today";

export function generateMetadata(): Metadata {
  const { long } = getTodayLandingDate();
  const title = `California Adventure Wait Times Today — ${long}`;
  const description = `Live Disney California Adventure wait times for ${long}. Real-time queues for Radiator Springs Racers, Guardians of the Galaxy: Mission Breakout, Incredicoaster, WEB Slingers, Soarin' Around the World, and every operating attraction — refreshed every minute on Parkio.`;
  return {
    title,
    description,
    alternates: { canonical: PATH },
    openGraph: {
      title: "California Adventure Wait Times Today — Parkio",
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

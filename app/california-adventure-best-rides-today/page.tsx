import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SeoParkBestRides } from "@/components/SeoParkBestRides";
import { getPark, getRidesForPark } from "@/lib/data";
import { getTodayLandingDate } from "@/lib/seoLandingDate";

const PARK_ID = "california-adventure";
const PATH = "/california-adventure-best-rides-today";

export function generateMetadata(): Metadata {
  const { long } = getTodayLandingDate();
  const title = `California Adventure Best Rides Today — ${long}`;
  const description = `What to ride at Disney California Adventure today, ${long}. Parkio's smart picks based on live wait times — Radiator Springs Racers, Guardians of the Galaxy: Mission Breakout, Incredicoaster, WEB Slingers, Soarin' Around the World, and every operating attraction — refreshed every minute.`;
  return {
    title,
    description,
    alternates: { canonical: PATH },
    openGraph: {
      title: "California Adventure Best Rides Today — Parkio",
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
  return <SeoParkBestRides park={park} rides={rides} todayLong={long} />;
}

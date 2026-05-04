import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SeoParkBestRides } from "@/components/SeoParkBestRides";
import { getPark, getRidesForPark } from "@/lib/data";
import { getTodayLandingDate } from "@/lib/seoLandingDate";

const PARK_ID = "magic-kingdom";
const PATH = "/magic-kingdom-best-rides-today";

export function generateMetadata(): Metadata {
  const { long } = getTodayLandingDate();
  const title = `Magic Kingdom Best Rides Today — ${long}`;
  const description = `What to ride at Magic Kingdom today, ${long}. Parkio's smart picks based on live wait times — Seven Dwarfs Mine Train, Space Mountain, Big Thunder Mountain, TRON Lightcycle / Run, Peter Pan's Flight, Pirates of the Caribbean, and every operating attraction — refreshed every minute.`;
  return {
    title,
    description,
    alternates: { canonical: PATH },
    openGraph: {
      title: "Magic Kingdom Best Rides Today — Parkio",
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

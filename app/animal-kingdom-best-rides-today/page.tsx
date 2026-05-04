import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SeoParkBestRides } from "@/components/SeoParkBestRides";
import { getPark, getRidesForPark } from "@/lib/data";
import { getTodayLandingDate } from "@/lib/seoLandingDate";

const PARK_ID = "animal-kingdom";
const PATH = "/animal-kingdom-best-rides-today";

export function generateMetadata(): Metadata {
  const { long } = getTodayLandingDate();
  const title = `Animal Kingdom Best Rides Today — ${long}`;
  const description = `What to ride at Disney's Animal Kingdom today, ${long}. Parkio's smart picks based on live wait times — Avatar Flight of Passage, Expedition Everest, Na'vi River Journey, Kilimanjaro Safaris, DINOSAUR, Kali River Rapids, and every operating attraction — refreshed every minute.`;
  return {
    title,
    description,
    alternates: { canonical: PATH },
    openGraph: {
      title: "Animal Kingdom Best Rides Today — Parkio",
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

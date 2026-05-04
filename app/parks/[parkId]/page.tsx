import { notFound } from "next/navigation";
import { Footer } from "@/components/Footer";
import { MapFocusProvider } from "@/components/MapFocusProvider";
import { ParkHappeningSoon } from "@/components/ParkHappeningSoon";
import { ParkInsights } from "@/components/ParkInsights";
import { ParkLiveDataProvider } from "@/components/ParkLiveDataProvider";
import { ParkMap } from "@/components/ParkMap";
import { ParkNearYou } from "@/components/ParkNearYou";
import { ParkPageAppCta } from "@/components/ParkPageAppCta";
import { ParkRecommendations } from "@/components/ParkRecommendations";
import { ParkRightNow } from "@/components/ParkRightNow";
import { PARKS, getPark, getRidesForPark } from "@/lib/data";
import type { ParkId } from "@/lib/types";

interface ParkPageProps {
  params: { parkId: string };
}

export const dynamicParams = false;

export function generateStaticParams() {
  return PARKS.map((p) => ({ parkId: p.id }));
}

export function generateMetadata({ params }: ParkPageProps) {
  const park = getPark(params.parkId);
  if (!park) return { title: "Park" };
  return {
    title: `${park.name} live wait times`,
    description: `Real-time wait times for every attraction at ${park.name}. Live map, ride status, and a clean attraction list — updated every minute.`,
    alternates: { canonical: `/parks/${park.id}` },
    openGraph: {
      title: `${park.name} — Live wait times on Parkio`,
      description: `See live wait times, ride status, and the longest queues at ${park.name} right now.`,
      type: "website",
      url: `/parks/${park.id}`,
    },
  };
}

export default function ParkPage({ params }: ParkPageProps) {
  const park = getPark(params.parkId);
  if (!park) notFound();

  const rides = getRidesForPark(park.id as ParkId);

  return (
    <main className="relative">
      <ParkLiveDataProvider parkSlug={park.id}>
        <MapFocusProvider>
          <ParkRightNow park={park} rides={rides} />
          <div id="park-map" className="scroll-mt-4">
            <ParkMap park={park} rides={rides} />
          </div>
          <ParkHappeningSoon park={park} />
          <ParkNearYou park={park} rides={rides} />
          <ParkRecommendations park={park} />
          <ParkInsights park={park} />
        </MapFocusProvider>
      </ParkLiveDataProvider>
      {/* Subtle inline App Store CTA — sits above the footer so it
          never competes with the live map. */}
      <ParkPageAppCta />
      <Footer />
    </main>
  );
}

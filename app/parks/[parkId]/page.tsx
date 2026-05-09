import { notFound } from "next/navigation";
import { Footer } from "@/components/Footer";
import { MapFocusProvider } from "@/components/MapFocusProvider";
import { MapNavOverlay } from "@/components/MapNavOverlay";
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

/**
 * Park page — full-screen map experience.
 *
 * Layout intent:
 *   1. The map is the FIRST and DOMINANT surface. ParkMap renders at
 *      `h-[100dvh]` so on landing the user sees a full-viewport map
 *      and nothing else above it.
 *   2. The page deliberately does NOT render the global <Navbar />.
 *      The only persistent nav on this route is <MapNavOverlay />,
 *      which floats fixed at the viewport corners (top-left "← Parks",
 *      top-right "Open Parkio") and never moves with scroll.
 *   3. Supporting sections (Right Now hero, Happening Soon, Near You,
 *      Recommendations, Insights, App CTA) scroll BELOW the map for
 *      users who want more — but they're not in the way of the map
 *      on first paint.
 *
 * Constraints honored: the map component itself, ParkLiveDataProvider,
 * MapFocusProvider, and every supporting component are unchanged.
 * Only the order and placement on this single route file changed.
 */
export default function ParkPage({ params }: ParkPageProps) {
  const park = getPark(params.parkId);
  if (!park) notFound();

  const rides = getRidesForPark(park.id as ParkId);

  return (
    <main className="relative">
      {/* Floating top-of-viewport back + App Store CTA. Sits at
          fixed/top-0/z-50 so it stays in place at every scroll depth.
          This is the only nav surface on this route — the global
          Navbar is intentionally NOT rendered. */}
      <MapNavOverlay />

      <ParkLiveDataProvider parkSlug={park.id}>
        <MapFocusProvider>
          {/* MAP — full-viewport hero. First child of <main> with no
              padding/margin pushing it down, so the map sits flush
              against the viewport top under the floating overlay. */}
          <div id="park-map" className="scroll-mt-0">
            <ParkMap park={park} rides={rides} />
          </div>

          {/* Supporting sections — scroll below the full-viewport
              map. Order is intentional: Right Now hero (single best
              pick), then Happening Soon (showtimes), then Near You
              (proximity-aware list), then Recommendations (Parkio
              Picks), then Insights. */}
          <ParkRightNow park={park} rides={rides} />
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

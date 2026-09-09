import { notFound } from "next/navigation";
import { Footer } from "@/components/Footer";
import { MapFocusProvider } from "@/components/MapFocusProvider";
import { Navbar } from "@/components/Navbar";
import { ParkHappeningSoon } from "@/components/ParkHappeningSoon";
import { ParkInsights } from "@/components/ParkInsights";
import { ParkLiveDataProvider } from "@/components/ParkLiveDataProvider";
import { ParkMap } from "@/components/ParkMap";
import { ParkNearYou } from "@/components/ParkNearYou";
import { ParkNextMove } from "@/components/ParkNextMove";
import { ParkPageAppCta } from "@/components/ParkPageAppCta";
import { ParkRightNow } from "@/components/ParkRightNow";
import { AttractionsByLand } from "@/components/park/AttractionsByLand";
import { InParkDisclosure } from "@/components/park/InParkDisclosure";
import { ParkDiningModule } from "@/components/park/ParkDiningModule";
import { ParkIdentityHeader } from "@/components/park/ParkIdentityHeader";
import { ParkJumpActions } from "@/components/park/ParkJumpActions";
import { ParkPlanningOverview } from "@/components/park/ParkPlanningOverview";
import { StartWithThese } from "@/components/park/StartWithThese";
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
 * Park planning page.
 *
 * The Website's job is "help me discover, research, and plan"; the iOS
 * app's job is "what should I do right now". This route used to answer
 * the second one — a 100dvh map on first paint, with the global Navbar
 * deliberately suppressed in favour of a floating map overlay.
 *
 * It now leads with planning: identity, an overview, the curated
 * headliners, and every attraction grouped by area — all server-rendered
 * and crawlable, and all readable without JavaScript or live data.
 *
 * The live stack is unchanged and still here, moved into an explicit
 * "In the park now?" disclosure. Nothing about how those components
 * decide anything was touched — only where they live.
 */
export default function ParkPage({ params }: ParkPageProps) {
  const park = getPark(params.parkId);
  if (!park) notFound();

  const rides = getRidesForPark(park.id as ParkId);

  return (
    <>
      {/* The global Navbar is back: with no full-screen map to escape
          from, MapNavOverlay's floating "← Parks" affordance is no
          longer needed on this route. */}
      <Navbar />

      <main className="min-h-screen bg-white">
        <ParkIdentityHeader park={park} />
        <ParkJumpActions park={park} />

        {/* ── Planning (server-rendered, no live data) ───────────── */}
        <ParkPlanningOverview park={park} />
        <StartWithThese park={park} />
        <AttractionsByLand park={park} />
        <ParkDiningModule park={park} />

        {/* ── In the park (secondary, closed by default) ─────────── */}
        <InParkDisclosure>
          <ParkLiveDataProvider parkSlug={park.id}>
            <MapFocusProvider>
              {/* Constrained: the map is a tool inside the planning page
                  now, not a full-viewport hero. Other callers (the SEO
                  landing pages) keep the original height by default. */}
              <ParkMap
                park={park}
                rides={rides}
                heightClassName="h-[70vh] min-h-[420px]"
              />
              <ParkRightNow park={park} rides={rides} />
              <ParkHappeningSoon park={park} />
              <ParkNearYou park={park} rides={rides} />
              <ParkNextMove park={park} />
              <ParkInsights park={park} />
            </MapFocusProvider>
          </ParkLiveDataProvider>
        </InParkDisclosure>

        <ParkPageAppCta />
      </main>

      <Footer />
    </>
  );
}

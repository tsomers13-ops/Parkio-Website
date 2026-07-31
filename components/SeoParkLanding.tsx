/**
 * SeoParkLanding
 *
 * Composition helper for the park-specific "today" SEO landing pages.
 * Reuses the SAME live-data components that power /parks/[parkId] —
 * no new visual design, no new data flow. The only new thing is the
 * outer copy, which is deliberately tuned for the high-intent "today"
 * search query; the page chrome comes from <SeoParkShell>.
 */

import { MapFocusProvider } from "@/components/MapFocusProvider";
import { ParkLiveDataProvider } from "@/components/ParkLiveDataProvider";
import { ParkMap } from "@/components/ParkMap";
import { ParkRightNow } from "@/components/ParkRightNow";
import { SeoParkShell } from "@/components/SeoParkShell";
import type { Park, Ride } from "@/lib/types";

export interface SeoParkLandingProps {
  park: Park;
  rides: Ride[];
  /** Long-form date string (e.g. "Monday, May 4, 2026"). */
  todayLong: string;
}

export function SeoParkLanding({
  park,
  rides,
  todayLong,
}: SeoParkLandingProps) {
  return (
    <SeoParkShell
      park={park}
      todayLong={todayLong}
      headline={`${park.name} wait times today.`}
      intro={
        <>
          Live queues for every operating attraction at {park.name}, refreshed
          every minute. Below: the best ride to head to right now, plus the
          full live map.
        </>
      }
      secondaryCta={{ href: "/guide", label: "Read Parkio Daily →" }}
    >
      {/* Live data — exact same data flow used on /parks/[parkId] so
          there's no duplication of fetches or component logic. */}
      <ParkLiveDataProvider parkSlug={park.id}>
        <MapFocusProvider>
          <ParkRightNow park={park} rides={rides} />
          <div id="park-map" className="scroll-mt-4">
            <ParkMap park={park} rides={rides} />
          </div>
        </MapFocusProvider>
      </ParkLiveDataProvider>
    </SeoParkShell>
  );
}

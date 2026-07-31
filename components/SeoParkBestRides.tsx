/**
 * SeoParkBestRides
 *
 * Composition helper for the park-specific "best rides today" SEO
 * landing pages. Mirrors `SeoParkLanding` (same <SeoParkShell> chrome)
 * but uses the One-tap Strategy surface (<ParkNextMove>) as the
 * primary section: a single decisive recommendation + an "After that"
 * follow-up plan, instead of the multi-card "What to ride next" stack.
 */

import { MapFocusProvider } from "@/components/MapFocusProvider";
import { ParkLiveDataProvider } from "@/components/ParkLiveDataProvider";
import { ParkMap } from "@/components/ParkMap";
import { ParkNextMove } from "@/components/ParkNextMove";
import { SeoParkShell } from "@/components/SeoParkShell";
import type { Park, Ride } from "@/lib/types";

export interface SeoParkBestRidesProps {
  park: Park;
  rides: Ride[];
  /** Long-form date string (e.g. "Monday, May 4, 2026"). */
  todayLong: string;
}

export function SeoParkBestRides({
  park,
  rides,
  todayLong,
}: SeoParkBestRidesProps) {
  return (
    <SeoParkShell
      park={park}
      todayLong={todayLong}
      headline={`${park.name} best rides today.`}
      intro={
        <>
          Smart picks for {park.name} based on live wait times right now.
          Headliners with short queues, walk-on gems most people skip, and what
          to avoid until later — refreshed every minute.
        </>
      }
      secondaryCta={{
        href: `/${park.id}-wait-times-today`,
        label: "See live wait times →",
      }}
    >
      {/* Live data — exact same data flow used on /parks/[parkId] so
          there's no duplication of fetches or component logic. The
          PRIMARY section here is the One-tap Strategy ("Your next
          move" + "After that"); the map sits below as a secondary
          "see everything" surface. */}
      <ParkLiveDataProvider parkSlug={park.id}>
        <MapFocusProvider>
          <ParkNextMove park={park} />
          <div id="park-map" className="scroll-mt-4">
            <ParkMap park={park} rides={rides} />
          </div>
        </MapFocusProvider>
      </ParkLiveDataProvider>
    </SeoParkShell>
  );
}

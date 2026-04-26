"use client";

import { useMemo } from "react";
import { isTopRide } from "@/lib/popularity";
import type { ApiAttractionStatus, Park, Ride } from "@/lib/types";
import { waitColorClasses, waitTier } from "@/lib/utils";
import { useMapFocus } from "./MapFocusProvider";
import { useParkLive } from "./ParkLiveDataProvider";

interface ParkNearYouProps {
  park: Park;
  rides: Ride[];
}

/* ──────────────────────── Scoring constants ──────────────────────── */

/**
 * Distance (in degrees) at which the proximity bonus drops to zero.
 * 0.005 degrees ≈ 555 m at the equator — covers roughly half of a
 * Disney park, so anything beyond this counts as "across the park".
 *
 * No real-world conversion is needed; the value is only used as a
 * normalizer for the proximity score.
 */
const PROXIMITY_ZERO_DEG = 0.005;

/** Bonus added when the candidate is a curated headliner. */
const HEADLINER_BONUS = 15;

/** How much weight proximity carries vs. wait time + popularity. */
const PROXIMITY_WEIGHT = 40;

/** Rides with waits above this fall out of "Near you" entirely. */
const NEAR_YOU_WAIT_CEILING_MIN = 60;

/** Maximum picks shown in the section. */
const MAX_PICKS = 5;

/* ──────────────────────── Helpers ──────────────────────── */

function euclidean(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dlat = a.lat - b.lat;
  const dlng = a.lng - b.lng;
  return Math.sqrt(dlat * dlat + dlng * dlng);
}

/**
 * Combined score blending wait, popularity, and proximity to the
 * anchor (the user's last-selected ride). Higher = better.
 *
 *   waitScore        = 60 - wait                      (range 0..60)
 *   headliner bonus  = +15 if curated headliner       (range 0|15)
 *   proximityScore   = (1 - dist/0.005) * 40          (range 0..40)
 *
 * Returns -Infinity for rides we should never recommend (not
 * operating, no wait, or wait above the ceiling).
 */
function nearYouScore(
  parkSlug: string,
  rideSlug: string,
  status: ApiAttractionStatus,
  wait: number | null,
  ride: Ride,
  anchor: Ride,
): number {
  if (status !== "OPERATING") return -Infinity;
  if (typeof wait !== "number") return -Infinity;
  if (wait > NEAR_YOU_WAIT_CEILING_MIN) return -Infinity;

  const waitScore = NEAR_YOU_WAIT_CEILING_MIN - wait;
  const popularity = isTopRide(parkSlug, rideSlug) ? HEADLINER_BONUS : 0;
  const dist = euclidean(ride, anchor);
  const proximity = Math.max(0, 1 - dist / PROXIMITY_ZERO_DEG);
  return waitScore + popularity + proximity * PROXIMITY_WEIGHT;
}

/* ──────────────────────── Component ──────────────────────── */

/**
 * "Near you" section — surfaces 3-5 nearby low-wait rides ranked by
 * a combined wait+popularity+proximity score, anchored to the user's
 * most recently selected ride (a proxy for real GPS until that lands).
 *
 * Reuses the same shared live data the map and Parkio Picks use; no
 * new fetch, no caching changes, no scoring logic added to
 * lib/popularity.ts (the rules here are local to this card).
 */
export function ParkNearYou({ park, rides }: ParkNearYouProps) {
  const { liveApi: live } = useParkLive();
  const { currentRideSlug, focusRide } = useMapFocus();

  // Anchor = the ride whose coordinates we use as the "user location".
  const anchor = useMemo(() => {
    if (!currentRideSlug) return null;
    return rides.find((r) => r.id === currentRideSlug) ?? null;
  }, [currentRideSlug, rides]);

  // Index live data by slug so we can look up wait + status quickly.
  const liveBySlug = useMemo(() => {
    const m = new Map<
      string,
      { status: ApiAttractionStatus; waitMinutes: number | null }
    >();
    if (live) {
      for (const a of live.attractions) {
        m.set(a.slug, { status: a.status, waitMinutes: a.waitMinutes });
      }
    }
    return m;
  }, [live]);

  const nearYou = useMemo(() => {
    if (!anchor) return [];
    const scored = rides
      // Don't recommend the user's own location back to them.
      .filter((r) => r.id !== anchor.id)
      .map((r) => {
        const liveData = liveBySlug.get(r.id);
        const status: ApiAttractionStatus = liveData?.status ?? "UNKNOWN";
        const wait = liveData?.waitMinutes ?? null;
        const score = nearYouScore(park.id, r.id, status, wait, r, anchor);
        return { ride: r, status, wait, score };
      })
      .filter((x) => Number.isFinite(x.score))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_PICKS);
    return scored;
  }, [rides, anchor, liveBySlug, park.id]);

  function handlePick(rideId: string) {
    // Tap a Near-you row → fly the map to it, open the sheet, and
    // (because ParkMap pushes every selection up) update the location
    // anchor for the next round of recommendations. Same focus
    // mechanism the "Right now" hero uses.
    focusRide(rideId);
    const map = document.getElementById("park-map");
    if (map) map.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section
      className="border-y border-ink-100 bg-white"
      aria-label="Near you"
    >
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-500">
              Near you
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
              What's close to your last stop
            </h2>
            <p className="mt-1.5 text-sm text-ink-600">
              {anchor ? (
                <>
                  Based on your last selected ride:{" "}
                  <span className="font-semibold text-ink-800">
                    {anchor.name}
                  </span>
                  .
                </>
              ) : (
                <>Select a ride on the map to see what's nearby.</>
              )}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-ink-100 bg-ink-50/40 p-2 sm:p-3">
          {!anchor ? (
            <EmptyState />
          ) : nearYou.length === 0 ? (
            <NoMatchesState />
          ) : (
            <ul className="divide-y divide-ink-100/70">
              {nearYou.map(({ ride, wait }) => (
                <li key={ride.id}>
                  <button
                    type="button"
                    onClick={() => handlePick(ride.id)}
                    className="group flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white sm:px-4"
                    aria-label={`Show ${ride.name} on the map`}
                  >
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className="min-w-0 truncate text-sm font-semibold tracking-tight text-ink-900"
                        title={ride.name}
                      >
                        {ride.name}
                      </span>
                      {isTopRide(park.id, ride.id) && (
                        <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-accent-50 px-1.5 py-0.5 text-[10px] font-semibold text-accent-700 ring-1 ring-accent-100">
                          Headliner
                        </span>
                      )}
                      <span className="text-[11px] font-medium text-ink-500">
                        {ride.land}
                      </span>
                    </div>
                    <WaitPill minutes={wait} />
                    <Chevron />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────── Sub-views ──────────────────────── */

function EmptyState() {
  return (
    <div className="flex items-center justify-center px-4 py-8 text-center sm:py-10">
      <div className="max-w-md">
        <div className="mx-auto inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-ink-500">
          <svg
            viewBox="0 0 16 16"
            fill="none"
            className="h-4 w-4"
            aria-hidden
          >
            <path
              d="M8 1.5C5.5 1.5 3.5 3.5 3.5 6c0 3 4.5 8 4.5 8s4.5-5 4.5-8c0-2.5-2-4.5-4.5-4.5z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              cx="8"
              cy="6"
              r="1.5"
              stroke="currentColor"
              strokeWidth="1.4"
            />
          </svg>
        </div>
        <p className="mt-2 text-sm font-medium text-ink-700">
          Pick a ride on the map to anchor recommendations.
        </p>
        <p className="mt-1 text-xs text-ink-500">
          We'll suggest nearby rides with short waits.
        </p>
      </div>
    </div>
  );
}

function NoMatchesState() {
  return (
    <div className="px-4 py-8 text-center text-sm text-ink-500 sm:py-10">
      Nothing nearby with a short wait right now. Try the picks below.
    </div>
  );
}

function WaitPill({ minutes }: { minutes: number | null }) {
  if (typeof minutes !== "number") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-ink-500 ring-1 ring-ink-200">
        <span className="h-1.5 w-1.5 rounded-full bg-ink-300" />
        —
      </span>
    );
  }
  const c = waitColorClasses(waitTier(minutes));
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ring-1 ${c.bg} ${c.text} ${c.ring}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {minutes} min
    </span>
  );
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className="h-4 w-4 shrink-0 text-ink-300 transition group-hover:text-ink-500"
      aria-hidden
    >
      <path
        d="M6 3l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

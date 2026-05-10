"use client";

import { useMemo } from "react";
import { RIDES } from "@/lib/data";
import {
  LOW_WAIT_THRESHOLD_MIN,
  isTopRide,
  partitionAttractions,
} from "@/lib/popularity";
import type { ApiAttraction, Park, Ride } from "@/lib/types";
import { simulatedWait, waitColorClasses, waitTier } from "@/lib/utils";
import { walkBucketBetween, type WalkBucket } from "@/lib/walk";
import { useMapFocus } from "./MapFocusProvider";
import { useParkLive } from "./ParkLiveDataProvider";

interface ParkRightNowProps {
  park: Park;
  rides: Ride[];
}

/**
 * "Right now" hero — the single most prominent thing on the park
 * page. Surfaces ONE recommendation (the top of Best Right Now from
 * lib/popularity#partitionAttractions) directly above the map so a
 * first-time visitor can read the page and act in 3 seconds.
 *
 * No new fetch, no new logic — just consumes the same live data the
 * map and Parkio Picks already share via <ParkLiveDataProvider>.
 *
 * "View on map" smooth-scrolls to the map below (#park-map anchor in
 * app/parks/[parkId]/page.tsx). No state changes, no marker open —
 * deliberately lightweight.
 */
export function ParkRightNow({ park, rides }: ParkRightNowProps) {
  const { liveApi: live, status } = useParkLive();
  const { focusRide, currentRideSlug } = useMapFocus();

  // Real-live = at least one OPERATING + numeric attraction. Mirrors
  // the predicate used by ParkInsights and WaitsAllParks so all three
  // surfaces classify "live" the same way.
  const hasRealLiveData = useMemo(
    () =>
      !!live?.attractions?.some(
        (a) => a.status === "OPERATING" && typeof a.waitMinutes === "number",
      ),
    [live],
  );

  const top = useMemo(() => {
    // Live path — real attractions feed partitionAttractions.
    if (live && hasRealLiveData) {
      const { bestNow } = partitionAttractions(park.id, live.attractions);
      return bestNow[0] ?? null;
    }

    // Estimated fallback — synthesize ApiAttraction-shaped rows from
    // the static RIDES list using `simulatedWait` (same simulation
    // ParkMap uses for UNKNOWN attractions). Blocks rides the partial
    // payload has explicitly marked CLOSED/DOWN/REFURBISHMENT so we
    // never recommend a ride that's actually not running. Runs even
    // when `live === null` (e.g. provider's catch path on a failed
    // initial fetch) so the section never gets stuck on its skeleton.
    if (status === "loading") return null;

    const blocked = new Set<string>();
    for (const a of live?.attractions ?? []) {
      if (
        a.status === "CLOSED" ||
        a.status === "DOWN" ||
        a.status === "REFURBISHMENT"
      ) {
        blocked.add(a.slug);
      }
    }

    const fallbackTimestamp = live?.lastUpdated ?? new Date().toISOString();
    const synthesized: ApiAttraction[] = RIDES.filter(
      (r) => r.parkId === park.id && !blocked.has(r.id),
    ).map((r) => ({
      id: r.externalId,
      slug: r.id,
      parkSlug: park.id,
      name: r.name,
      status: "OPERATING",
      waitMinutes: simulatedWait(r),
      coordinates: { lat: r.lat, lng: r.lng },
      lastUpdated: fallbackTimestamp,
    }));
    if (synthesized.length === 0) return null;

    const { bestNow } = partitionAttractions(park.id, synthesized);
    return bestNow[0] ?? null;
  }, [live, hasRealLiveData, status, park.id]);

  // Walk-time bucket from the user's "current location" (the last
  // ride they tapped on the map) to the top pick. Hidden when the
  // user hasn't picked a ride yet, OR when the top pick IS the
  // ride they're already at — both cases would be misleading.
  const walk: WalkBucket | null = useMemo(() => {
    if (!top || !currentRideSlug) return null;
    if (currentRideSlug === top.slug) return null;
    const anchor = rides.find((r) => r.id === currentRideSlug);
    const target = rides.find((r) => r.id === top.slug);
    if (!anchor || !target) return null;
    return walkBucketBetween(anchor, target);
  }, [top, currentRideSlug, rides]);

  function handleViewOnMap() {
    if (!top) return;
    // Tell the map below to pan/zoom/highlight + auto-open the ride
    // detail panel. ParkMap subscribes to the same MapFocusProvider
    // and handles the actual flyTo + pulse + sheet open sequence.
    focusRide(top.slug);
    const map = document.getElementById("park-map");
    if (map) map.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ─── Loading skeleton — only during the true initial fetch.
       After that, even if `live` is still null (failed fetch), the
       estimated-fallback path above produces a usable `top` from
       static RIDES + simulatedWait. No more lock-in. ─── */
  if (status === "loading") {
    return (
      <Shell>
        <Eyebrow tone="muted" />
        <div className="mt-3 h-8 w-2/3 animate-pulse rounded-md bg-ink-100" />
        <div className="mt-3 h-4 w-1/2 animate-pulse rounded-md bg-ink-100" />
      </Shell>
    );
  }

  /* ─── No top pick (park closed / no operating rides) ─── */
  if (!top) {
    return (
      <Shell muted>
        <Eyebrow tone="muted" />
        <p className="mt-3 text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">
          Rides aren't running yet.
        </p>
        <p className="mt-1 text-sm text-ink-600">
          Check back when {park.name} opens.
        </p>
      </Shell>
    );
  }

  const popular = isTopRide(park.id, top.slug);
  const wait = top.waitMinutes;
  const lowWait = typeof wait === "number" && wait <= LOW_WAIT_THRESHOLD_MIN;
  const reason = pickReason(popular, wait);

  // When `top` came from the simulated-fallback path (no real live
  // data), surface that to the reader: muted eyebrow tone (no live
  // pulse), an "Estimated" pill in the chip row, and an "(est.)"
  // suffix on the wait pill. The recommendation itself is still
  // useful — we're just being honest that the number is computed
  // from baseWait, not pulled from a live queue.
  const isEstimated = !hasRealLiveData;

  return (
    <Shell muted={isEstimated}>
      <Eyebrow tone={isEstimated ? "muted" : "live"} />

      <div className="mt-3 flex items-end justify-between gap-4 sm:gap-6">
        <div className="min-w-0 flex-1">
          <h2
            className="truncate text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl"
            title={top.name}
          >
            {top.name}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            {popular && (
              <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-700 ring-1 ring-accent-100">
                Headliner
              </span>
            )}
            {lowWait && (
              <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                Low wait
              </span>
            )}
            {isEstimated && (
              <span
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600 ring-1 ring-ink-200"
                title="Live waits unavailable — wait time is estimated from this ride's typical wait"
              >
                <span className="h-1 w-1 rounded-full bg-ink-400" />
                Estimated
              </span>
            )}
            <span className="text-sm text-ink-600">{reason}</span>
            {walk && (
              <span
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-sm text-ink-500"
                title="Approximate walk from the last ride you tapped"
              >
                <span aria-hidden className="text-ink-300">
                  ·
                </span>
                <WalkIcon />
                {walk}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <BigWaitPill minutes={wait} estimated={isEstimated} />
          <button
            type="button"
            onClick={handleViewOnMap}
            className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-accent-700 transition-colors hover:text-accent-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 rounded-md"
            aria-label={`View ${top.name} on map`}
          >
            View on map
            <svg
              viewBox="0 0 16 16"
              fill="none"
              className="h-3 w-3"
              aria-hidden
            >
              <path
                d="M3 6l5 5 5-5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </Shell>
  );
}

/* ─────────────────────────── Reason copy ─────────────────────────── */

function pickReason(popular: boolean, wait: number | null): string {
  if (typeof wait !== "number") return "Best pick right now";
  if (popular && wait <= LOW_WAIT_THRESHOLD_MIN) {
    return "Top ride with a short wait";
  }
  if (popular && wait <= 30) return "Top ride, moderate wait";
  if (popular) return "Top ride right now";
  if (wait <= 10) return "Hidden gem — barely any wait";
  return "Short wait, quick win";
}

/* ─────────────────────────── Shell ─────────────────────────── */

function Shell({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  const bg = muted
    ? "bg-gradient-to-br from-ink-50/60 via-white to-ink-50/40"
    : "bg-gradient-to-br from-accent-50 via-white to-emerald-50/40";
  return (
    <section
      className={`relative border-b border-ink-100 ${bg}`}
      aria-label="Right now"
    >
      {/* Subtle accent line at the very top — premium / featured cue */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-accent-400/70 to-transparent"
      />
      <div className="relative mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-8">
        {children}
      </div>
    </section>
  );
}

/* ─────────────────────────── Eyebrow ─────────────────────────── */

function Eyebrow({ tone }: { tone: "live" | "muted" }) {
  if (tone === "muted") {
    return (
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-ink-300" />
        <span className="text-xs font-semibold uppercase tracking-widest text-ink-500">
          Right now
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-500" />
      </span>
      <span className="text-xs font-semibold uppercase tracking-widest text-accent-700">
        Right now
      </span>
    </div>
  );
}

/* ─────────────────────────── Walk-time icon ─────────────────────────── */

function WalkIcon() {
  // Minimal walking-figure glyph. Sized to match the surrounding
  // text-sm so it reads as inline punctuation, not a chip.
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <circle cx="9.5" cy="2.5" r="1.3" />
      <path
        d="M9 5.5c-.6 0-1 .3-1.3.8L6.5 8.5l-2 1 .5 1 2.2-1 .9-1.6V11l-1.5 3.4.95.4L8.5 12l1 1.4v1h1v-1.4l-1.3-2 .5-1.7L11 11.5v-2L10 8l.5-1.5h2v-1H10c-.4 0-.7-.4-1-1z"
      />
    </svg>
  );
}

/* ─────────────────────────── Wait pill (large) ─────────────────────────── */

function BigWaitPill({
  minutes,
  estimated = false,
}: {
  minutes: number | null;
  estimated?: boolean;
}) {
  if (typeof minutes !== "number") {
    return (
      <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-ink-100 px-3.5 py-2 text-base font-semibold tabular-nums text-ink-500 ring-1 ring-ink-200">
        <span className="h-2 w-2 rounded-full bg-ink-300" />
        —
      </span>
    );
  }
  // When estimated, render in the neutral ink palette (no green/
  // amber/rose tier color) so the number doesn't visually compete
  // with real live waits elsewhere on the page. A tiny "(est.)"
  // suffix removes any ambiguity for a reader who jumps straight
  // to the wait pill without reading the chips.
  if (estimated) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-ink-100 px-3.5 py-2 text-base font-semibold tabular-nums text-ink-700 ring-1 ring-ink-200"
        title="Estimated from this ride's typical wait — live data unavailable right now"
      >
        <span className="h-2 w-2 rounded-full bg-ink-400" />
        {minutes} min
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
          est.
        </span>
      </span>
    );
  }
  const tier = waitTier(minutes);
  const c = waitColorClasses(tier);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-base font-semibold tabular-nums ring-1 ${c.bg} ${c.text} ${c.ring}`}
    >
      <span className={`h-2 w-2 rounded-full ${c.dot}`} />
      {minutes} min
    </span>
  );
}

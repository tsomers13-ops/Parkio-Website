"use client";

import { useMemo } from "react";
import {
  LOW_WAIT_THRESHOLD_MIN,
  isTopRide,
  partitionAttractions,
} from "@/lib/popularity";
import type { Park } from "@/lib/types";
import { waitColorClasses, waitTier } from "@/lib/utils";
import { useParkLive } from "./ParkLiveDataProvider";

interface ParkRightNowProps {
  park: Park;
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
export function ParkRightNow({ park }: ParkRightNowProps) {
  const { liveApi: live, status } = useParkLive();

  const top = useMemo(() => {
    if (!live) return null;
    const { bestNow } = partitionAttractions(park.id, live.attractions);
    return bestNow[0] ?? null;
  }, [live, park.id]);

  function handleViewOnMap() {
    const map = document.getElementById("park-map");
    if (map) map.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ─── Loading skeleton ─── */
  if (status === "loading" || !live) {
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

  return (
    <Shell>
      <Eyebrow tone="live" />

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
            <span className="text-sm text-ink-600">{reason}</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <BigWaitPill minutes={wait} />
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

/* ─────────────────────────── Wait pill (large) ─────────────────────────── */

function BigWaitPill({ minutes }: { minutes: number | null }) {
  if (typeof minutes !== "number") {
    return (
      <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-ink-100 px-3.5 py-2 text-base font-semibold tabular-nums text-ink-500 ring-1 ring-ink-200">
        <span className="h-2 w-2 rounded-full bg-ink-300" />
        —
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

"use client";

import { useMemo } from "react";
import {
  LOW_WAIT_THRESHOLD_MIN,
  isTopRide,
  partitionAttractions,
} from "@/lib/popularity";
import type { ApiAttraction, Park } from "@/lib/types";
import { waitColorClasses, waitTier } from "@/lib/utils";
import { useParkLive } from "./ParkLiveDataProvider";

interface ParkRecommendationsProps {
  park: Park;
}

type LoadStatus = "loading" | "live" | "estimates";

/**
 * "Parkio Picks" decision layer. Three scannable cards built on the
 * same /api/parks/{slug}/live data the map uses:
 *
 *   - Best right now:           tier-1 (headliners ≤ 60), tier-1½
 *                               (walk-on gems ≤ 10), tier-2 (regular
 *                               gems ≤ 25). "Low wait" badge ≤ 15 min.
 *   - Backup picks & quick wins: priority-sorted overflow card. HL
 *                               overflow first, then mid-wait non-HL,
 *                               then walk-on gems that didn't fit Best.
 *   - Skip for now:             anything currently > 60 min.
 *
 * No real AI — just hand-curated popularity sets in lib/popularity.ts
 * combined with deterministic tiered scoring. Designed to be readable
 * in under 5 seconds on a phone in line.
 *
 * Pulls live data from the page-level <ParkLiveDataProvider> so it
 * shares one fetch with ParkMap + ParkInsights.
 */
export function ParkRecommendations({ park }: ParkRecommendationsProps) {
  const { liveApi: live, status } = useParkLive();

  const { bestNow, goodOptions, skipForNow } = useMemo(() => {
    if (!live) return { bestNow: [], goodOptions: [], skipForNow: [] };
    return partitionAttractions(park.id, live.attractions);
  }, [live, park.id]);

  // Detect "park isn't really open" — no attractions are reporting an
  // OPERATING status. Used to swap empty-state copy so guests don't
  // see "Most rides have lines over an hour" when nothing is running.
  const noneOperating =
    !!live &&
    live.attractions.length > 0 &&
    !live.attractions.some((a) => a.status === "OPERATING");

  return (
    <section className="relative border-y border-ink-100 bg-gradient-to-b from-accent-50/40 via-white to-ink-50/40">
      {/* Subtle accent top-line — signals premium / featured content */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-accent-400/70 to-transparent"
      />
      <div className="relative mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-accent-50 px-3 py-1 ring-1 ring-accent-100">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
              <span className="text-xs font-semibold uppercase tracking-widest text-accent-700">
                Parkio Picks
              </span>
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              What to ride{" "}
              <span className="bg-gradient-to-br from-accent-600 to-sky-500 bg-clip-text text-transparent">
                next
              </span>
              .
            </h2>
            <p className="mt-3 text-base text-ink-600 sm:text-lg">
              Start here — these are your best moves right now, based
              on live waits and top rides.
            </p>
          </div>
          <StatusBadge status={status} />
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card
            title="Best right now"
            tone="emerald"
            empty={
              status === "loading"
                ? "Loading…"
                : noneOperating
                  ? "Rides aren't running yet. Check back when the park opens."
                  : "Most rides have lines over an hour. Good time for a snack or a show."
            }
            attractions={bestNow}
            parkSlug={park.id}
            highlightTopRides
          />
          <Card
            title="Backup picks & quick wins"
            tone="amber"
            empty={
              status === "loading"
                ? "Loading…"
                : noneOperating
                  ? "Nothing operating yet — wait times will appear once the park opens."
                  : "No backups or quick wins right now."
            }
            attractions={goodOptions}
            parkSlug={park.id}
          />
          <Card
            title="Skip for now"
            tone="rose"
            empty={
              status === "loading"
                ? "Loading…"
                : noneOperating
                  ? "No queues to avoid yet — the park hasn't opened."
                  : "No long lines right now. Take advantage."
            }
            attractions={skipForNow}
            parkSlug={park.id}
          />
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Card ─────────────────────────── */

function Card({
  title,
  tone,
  attractions,
  empty,
  parkSlug,
  highlightTopRides = false,
}: {
  title: string;
  tone: "emerald" | "amber" | "rose";
  attractions: ApiAttraction[];
  empty: string;
  parkSlug: string;
  highlightTopRides?: boolean;
}) {
  const tag =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : "bg-rose-50 text-rose-700 ring-rose-200";

  return (
    <div className="rounded-3xl border border-ink-100 bg-white p-5 shadow-lift transition-shadow duration-200 sm:p-6">
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${tag}`}
        >
          {title}
        </span>
        {attractions.length > 0 && (
          <span className="text-[11px] font-medium text-ink-400">
            {attractions.length} pick{attractions.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {attractions.length === 0 ? (
        <div className="mt-4 px-1 py-6 text-center text-sm text-ink-500">
          {empty}
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-ink-100">
          {attractions.map((a) => (
            <Row
              key={a.id}
              attraction={a}
              parkSlug={parkSlug}
              showTopBadge={highlightTopRides}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  attraction,
  parkSlug,
  showTopBadge,
}: {
  attraction: ApiAttraction;
  parkSlug: string;
  showTopBadge: boolean;
}) {
  const popular = showTopBadge && isTopRide(parkSlug, attraction.slug);
  const wait = attraction.waitMinutes;
  const lowWait =
    showTopBadge &&
    typeof wait === "number" &&
    wait <= LOW_WAIT_THRESHOLD_MIN;

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
        <span
          className="min-w-0 truncate text-sm font-semibold tracking-tight text-ink-900"
          title={attraction.name}
        >
          {attraction.name}
        </span>
        {popular && (
          <span
            className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-accent-50 px-1.5 py-0.5 text-[10px] font-semibold text-accent-700 ring-1 ring-accent-100"
            title="Top-tier headliner"
          >
            Headliner
          </span>
        )}
        {lowWait && (
          <span
            className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-100"
            title="Walk-on territory"
          >
            Low wait
          </span>
        )}
      </div>
      <WaitPill minutes={wait} />
    </li>
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
  const tier = waitTier(minutes);
  const c = waitColorClasses(tier);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ring-1 ${c.bg} ${c.text} ${c.ring}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {minutes} min
    </span>
  );
}

function StatusBadge({ status }: { status: LoadStatus }) {
  if (status === "loading") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-50 px-3 py-1.5 text-[11px] font-medium text-ink-500 ring-1 ring-ink-200">
        <span className="h-1.5 w-1.5 rounded-full bg-ink-300" />
        Loading
      </span>
    );
  }
  if (status === "estimates") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-3 py-1.5 text-[11px] font-medium text-ink-600 ring-1 ring-ink-200"
        title="Live data unavailable — picks based on estimated waits"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-ink-400" />
        Estimated waits
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      Live · refreshes every minute
    </span>
  );
}

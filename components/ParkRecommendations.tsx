"use client";

import Link from "next/link";
import { useMemo } from "react";
import { RIDES } from "@/lib/data";
import {
  LOW_WAIT_THRESHOLD_MIN,
  isTopRide,
  partitionAttractions,
} from "@/lib/popularity";
import type { ApiAttraction, Park } from "@/lib/types";
import { simulatedWait, waitColorClasses, waitTier } from "@/lib/utils";
import { useParkLive } from "./ParkLiveDataProvider";

interface ParkRecommendationsProps {
  park: Park;
}

type LoadStatus = "loading" | "live" | "estimates";

/**
 * Parkio Picks — decision engine.
 *
 * Two surfaces, top-to-bottom:
 *
 *   1. "Start here" hero — a single recommendation with reasoning
 *      ("Top ride with a short wait", "Hidden gem — barely any wait",
 *      etc.). Tells the reader exactly what to do next.
 *   2. "Next best options" — a ranked list of follow-up picks.
 *      Combines partitionAttractions's bestNow.slice(1) + goodOptions
 *      so a guest can read the page and plan the next 3–5 moves.
 *
 * `Best Right Now` always has at least one item via a 3-tier fallback
 * (ideal picks → lowest-wait operating → simulated from RIDES). When
 * the page is in estimated mode (no real live data), the hero pill is
 * rendered in a muted ink palette with an "(est.)" suffix so we never
 * lie about the source of the number.
 *
 * No new fetch, no Picks-logic change — partitionAttractions still
 * decides the ranking. The change is purely how we present its output.
 */
export function ParkRecommendations({ park }: ParkRecommendationsProps) {
  const { liveApi: live, status } = useParkLive();

  // Real-live = at least one OPERATING + numeric attraction. Mirrors
  // the predicate used by ParkRightNow / ParkInsights / WaitsAllParks.
  const hasRealLiveData = useMemo(
    () =>
      !!live?.attractions?.some(
        (a) => a.status === "OPERATING" && typeof a.waitMinutes === "number",
      ),
    [live],
  );
  const isEstimated = !hasRealLiveData;

  // Existing logic — unchanged. Used for tier-1 of the bestNow chain
  // and for the goodOptions/skipForNow lists.
  const { bestNow: idealPicks, goodOptions, skipForNow } = useMemo(() => {
    if (!live) return { bestNow: [], goodOptions: [], skipForNow: [] };
    return partitionAttractions(park.id, live.attractions);
  }, [live, park.id]);

  /**
   * Best Right Now — fallback chain so the card always has at least
   * one pick (see component docstring for tier definitions).
   */
  const bestNow = useMemo<ApiAttraction[]>(() => {
    if (idealPicks.length > 0) return idealPicks;

    if (live) {
      const operating = live.attractions
        .filter(
          (a) => a.status === "OPERATING" && typeof a.waitMinutes === "number",
        )
        .sort(
          (a, b) => (a.waitMinutes as number) - (b.waitMinutes as number),
        )
        .slice(0, 5);
      if (operating.length > 0) return operating;
    }

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
    synthesized.sort((a, b) => {
      const ah = isTopRide(park.id, a.slug) ? 1 : 0;
      const bh = isTopRide(park.id, b.slug) ? 1 : 0;
      if (ah !== bh) return bh - ah;
      return (a.waitMinutes as number) - (b.waitMinutes as number);
    });
    return synthesized.slice(0, 5);
  }, [idealPicks, live, park.id]);

  // The hero recommendation = the first pick in the ranked plan.
  const top = bestNow[0] ?? null;

  // "Next best options" ranked list — all remaining bestNow rides
  // followed by the goodOptions overflow. Both sub-lists are already
  // sorted by partitionAttractions, so concatenation preserves order.
  // De-duplicated by slug (defensive — partitionAttractions never
  // double-emits, but the synthesized fallback could overlap with
  // any partial live data).
  const nextBest = useMemo<ApiAttraction[]>(() => {
    const seen = new Set<string>();
    if (top) seen.add(top.slug);
    const merged: ApiAttraction[] = [];
    for (const a of bestNow.slice(1)) {
      if (!seen.has(a.slug)) {
        seen.add(a.slug);
        merged.push(a);
      }
    }
    for (const a of goodOptions) {
      if (!seen.has(a.slug)) {
        seen.add(a.slug);
        merged.push(a);
      }
    }
    return merged.slice(0, 8);
  }, [top, bestNow, goodOptions]);

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
          <StatusBadge status={status} estimated={isEstimated} />
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <StartHereCard
            top={top}
            parkSlug={park.id}
            estimated={isEstimated}
            loading={status === "loading"}
          />
          <NextBestCard
            attractions={nextBest}
            parkSlug={park.id}
            loading={status === "loading"}
          />
        </div>

        {/* "Skip for now" — preserved for guests who want it but
            de-emphasized. Hidden when empty so we never render the
            old "No long lines right now" empty copy. */}
        {skipForNow.length > 0 && (
          <details className="group mt-6 rounded-2xl border border-ink-100 bg-white/70 p-4 shadow-soft sm:p-5">
            <summary className="cursor-pointer list-none text-sm font-semibold text-ink-700 transition group-open:text-ink-900">
              <span className="inline-flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-rose-700">
                  Skip for now
                </span>
                <span className="text-ink-500">
                  {skipForNow.length} ride
                  {skipForNow.length === 1 ? "" : "s"} over an hour
                </span>
              </span>
            </summary>
            <ul className="mt-3 divide-y divide-ink-100">
              {skipForNow.map((a) => (
                <Row key={a.id} attraction={a} parkSlug={park.id} />
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

/* ─────────────────────────── Start here ─────────────────────────── */

function StartHereCard({
  top,
  parkSlug,
  estimated,
  loading,
}: {
  top: ApiAttraction | null;
  parkSlug: string;
  estimated: boolean;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-lift sm:p-7 lg:col-span-1">
        <Eyebrow tone={estimated ? "muted" : "live"} text="First ride now" />
        <div className="mt-3 h-7 w-3/4 animate-pulse rounded-md bg-ink-100" />
        <div className="mt-3 h-4 w-1/2 animate-pulse rounded-md bg-ink-100" />
      </div>
    );
  }

  if (!top) {
    return (
      <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-lift sm:p-7 lg:col-span-1">
        <Eyebrow tone="muted" text="First ride now" />
        <p className="mt-3 text-lg font-semibold tracking-tight text-ink-900">
          Rides aren't running yet.
        </p>
        <p className="mt-1 text-sm text-ink-600">
          Check back when the park opens.
        </p>
      </div>
    );
  }

  const popular = isTopRide(parkSlug, top.slug);
  const wait = top.waitMinutes;
  const lowWait = typeof wait === "number" && wait <= LOW_WAIT_THRESHOLD_MIN;
  const reason = pickReason(popular, wait);

  return (
    <article className="rounded-3xl border border-ink-100 bg-white p-6 shadow-lift sm:p-7 lg:col-span-1">
      <Eyebrow tone={estimated ? "muted" : "live"} text="First ride now" />
      <h3 className="mt-3 truncate text-2xl font-semibold tracking-tight text-ink-900 sm:text-[28px]">
        {top.name}
      </h3>
      <div className="mt-2 flex flex-wrap items-center gap-2">
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
        {estimated && (
          <span
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600 ring-1 ring-ink-200"
            title="Live waits unavailable — wait time is predicted from this ride's typical wait"
          >
            <span className="h-1 w-1 rounded-full bg-ink-400" />
            Estimated
          </span>
        )}
      </div>
      <p className="mt-3 text-sm text-ink-700 sm:text-base">{reason}.</p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <BigWaitPill minutes={wait} estimated={estimated} />
        <Link
          href={`#park-map`}
          className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-accent-700 transition hover:text-accent-900"
        >
          View on map
          <Chevron />
        </Link>
      </div>
    </article>
  );
}

function pickReason(popular: boolean, wait: number | null): string {
  if (typeof wait !== "number") return "Best pick right now";
  if (popular && wait <= LOW_WAIT_THRESHOLD_MIN) {
    return "Top ride with a short wait — ride before crowds shift";
  }
  if (popular && wait <= 30) return "Top ride, moderate wait — solid window";
  if (popular) return "Top ride right now";
  if (wait <= 10) return "Hidden gem — barely any wait";
  return "Short wait, quick win";
}

/* ─────────────────────────── Next best ─────────────────────────── */

function NextBestCard({
  attractions,
  parkSlug,
  loading,
}: {
  attractions: ApiAttraction[];
  parkSlug: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-3xl border border-ink-100 bg-white p-5 shadow-soft sm:p-6 lg:col-span-2">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
          Next best options
        </span>
        {!loading && attractions.length > 0 && (
          <span className="text-[11px] font-medium text-ink-400">
            {attractions.length} pick{attractions.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {loading ? (
        <div className="mt-4 space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-10 w-full animate-pulse rounded-xl bg-ink-100"
            />
          ))}
        </div>
      ) : attractions.length === 0 ? (
        <p className="mt-4 text-sm text-ink-500">
          The first pick covers it for now — open the map for the
          full ride list.
        </p>
      ) : (
        <ol className="mt-4 divide-y divide-ink-100">
          {attractions.map((a, i) => (
            <Row
              key={a.id}
              attraction={a}
              parkSlug={parkSlug}
              rank={i + 1}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

/* ─────────────────────────── Row ─────────────────────────── */

function Row({
  attraction,
  parkSlug,
  rank,
}: {
  attraction: ApiAttraction;
  parkSlug: string;
  rank?: number;
}) {
  const popular = isTopRide(parkSlug, attraction.slug);
  const wait = attraction.waitMinutes;
  const lowWait =
    typeof wait === "number" && wait <= LOW_WAIT_THRESHOLD_MIN;

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {typeof rank === "number" && (
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[11px] font-semibold tabular-nums text-ink-600">
            {rank}
          </span>
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
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
      </div>
      <WaitPill minutes={wait} />
    </li>
  );
}

/* ─────────────────────────── Pills + chrome ─────────────────────────── */

function Eyebrow({
  tone,
  text,
}: {
  tone: "live" | "muted";
  text: string;
}) {
  if (tone === "muted") {
    return (
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-ink-300" />
        <span className="text-[11px] font-semibold uppercase tracking-widest text-ink-500">
          {text}
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
      <span className="text-[11px] font-semibold uppercase tracking-widest text-accent-700">
        {text}
      </span>
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

function BigWaitPill({
  minutes,
  estimated,
}: {
  minutes: number | null;
  estimated: boolean;
}) {
  if (typeof minutes !== "number") {
    return (
      <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-ink-100 px-3.5 py-2 text-base font-semibold tabular-nums text-ink-500 ring-1 ring-ink-200">
        <span className="h-2 w-2 rounded-full bg-ink-300" />
        —
      </span>
    );
  }
  if (estimated) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-ink-100 px-3.5 py-2 text-base font-semibold tabular-nums text-ink-700 ring-1 ring-ink-200"
        title="Predicted from this ride's typical wait — live data unavailable right now"
      >
        <span className="h-2 w-2 rounded-full bg-ink-400" />
        {minutes} min
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
          est.
        </span>
      </span>
    );
  }
  const c = waitColorClasses(waitTier(minutes));
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-base font-semibold tabular-nums ring-1 ${c.bg} ${c.text} ${c.ring}`}
    >
      <span className={`h-2 w-2 rounded-full ${c.dot}`} />
      {minutes} min
    </span>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3" aria-hidden>
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

/**
 * Status indicator. When estimated, the badge stacks an "Estimated
 * waits" headline with a small "Predicted from park patterns" line
 * below it so guests understand exactly where the numbers come from.
 */
function StatusBadge({
  status,
  estimated,
}: {
  status: LoadStatus;
  estimated: boolean;
}) {
  if (status === "loading") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-50 px-3 py-1.5 text-[11px] font-medium text-ink-500 ring-1 ring-ink-200">
        <span className="h-1.5 w-1.5 rounded-full bg-ink-300" />
        Loading
      </span>
    );
  }
  if (estimated) {
    return (
      <span
        className="inline-flex items-start gap-2 rounded-2xl bg-ink-100 px-3 py-2 text-left ring-1 ring-ink-200"
        title="Live data unavailable — picks based on each ride's typical wait at this park"
      >
        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-ink-400" />
        <span className="flex flex-col leading-tight">
          <span className="text-[11px] font-semibold text-ink-700">
            Estimated waits
          </span>
          <span className="text-[10px] font-medium text-ink-500">
            Predicted from park patterns
          </span>
        </span>
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

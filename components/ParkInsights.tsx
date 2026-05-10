"use client";

import Link from "next/link";
import { useMemo } from "react";
import { RIDES } from "@/lib/data";
import { isTopRide } from "@/lib/popularity";
import type { ApiAttraction, Park } from "@/lib/types";
import { simulatedWait } from "@/lib/utils";
import { useParkLive } from "./ParkLiveDataProvider";

interface ParkInsightsProps {
  park: Park;
}

/**
 * "Park insights" panel rendered below Parkio Picks. Replaces the old
 * three-card layout (Longest waits / Temporarily down / Recently
 * updated) with ONE actionable strategy card that tells the guest
 * what to do given the current state of the park.
 *
 * The strategy is computed from the live data (or estimated data
 * when live is unavailable) using simple heuristics over the wait
 * distribution and headliner availability — NO weak "data
 * unavailable" copy ever renders.
 *
 * Same useParkLive data source as ParkMap and Parkio Picks. No new
 * fetches, no provider/contract changes.
 */
export function ParkInsights({ park }: ParkInsightsProps) {
  const { liveApi: live, status } = useParkLive();

  const hasRealLiveData = useMemo(
    () =>
      !!live?.attractions?.some(
        (a) => a.status === "OPERATING" && typeof a.waitMinutes === "number",
      ),
    [live],
  );
  const isEstimated = !hasRealLiveData;

  // Build the working attraction set. In live mode this is the real
  // operating attractions; in estimated mode this is the static RIDES
  // list with simulated waits. Either way, we have something to
  // reason over so the strategy card is always populated.
  const workingSet = useMemo<ApiAttraction[]>(() => {
    if (hasRealLiveData && live) {
      return live.attractions.filter(
        (a) => a.status === "OPERATING" && typeof a.waitMinutes === "number",
      );
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
    return RIDES.filter(
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
  }, [live, hasRealLiveData, park.id]);

  // Live-only signals — used for the strategy heuristic when we have
  // real data. In estimated mode these are skipped (we don't pretend
  // to know what's "down" right now).
  const downCount = useMemo(
    () =>
      live
        ? live.attractions.filter(
            (a) =>
              a.status === "DOWN" ||
              a.status === "CLOSED" ||
              a.status === "REFURBISHMENT",
          ).length
        : 0,
    [live],
  );

  const insight = useMemo(
    () => buildStrategy(workingSet, park, hasRealLiveData, downCount),
    [workingSet, park, hasRealLiveData, downCount],
  );

  return (
    <section className="border-t border-ink-100 bg-white">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-widest text-accent-600">
              Park insights
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              {park.name} at a glance
            </h2>
          </div>
          <StatusBadge status={status} estimated={isEstimated} />
        </div>

        <article className="mt-10 rounded-3xl border border-ink-100 bg-gradient-to-br from-accent-50/60 via-white to-emerald-50/30 p-6 shadow-lift sm:p-8">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-accent-700 ring-1 ring-accent-100">
              Strategy
            </span>
            {insight.tag && (
              <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-ink-600 ring-1 ring-ink-200">
                {insight.tag}
              </span>
            )}
          </div>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-ink-900 sm:text-[28px]">
            {insight.title}
          </h3>
          <p className="mt-2 text-base leading-relaxed text-ink-700 sm:text-lg">
            {insight.body}
          </p>
          {insight.cta && (
            <div className="mt-4">
              <Link
                href={insight.cta.href}
                className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ink-800"
              >
                {insight.cta.label}
                <Chevron />
              </Link>
            </div>
          )}
        </article>

        <div className="mt-10 text-center">
          <Link
            href="/parks"
            className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-5 py-3 text-sm font-medium text-ink-800 shadow-soft transition hover:border-ink-300 hover:bg-ink-50"
          >
            See all parks
            <Chevron />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Strategy builder ─────────────────────────── */

interface Strategy {
  /** Short label next to the "Strategy" pill (e.g. "Light crowds"). */
  tag: string | null;
  /** Headline: 5–9 words, action-forward. */
  title: string;
  /** Body: 1–2 sentences, concrete advice. */
  body: string;
  /** Optional primary CTA link to drive the action. */
  cta: { label: string; href: string } | null;
}

/**
 * Pick the single most actionable line for the current park state.
 *
 * Heuristic order (first match wins):
 *
 *   1. Multiple attractions are down → tell the reader to check the map.
 *   2. We have a headliner with a notably short wait → "Ride X now."
 *   3. Average wait is high (crowds heavy) → suggest a break or
 *      heading to a less popular ride.
 *   4. Average wait is low (light crowds) → suggest knocking out
 *      headliners while the park is light.
 *   5. Estimated mode default → generic "hit headliners early" advice
 *      grounded in real park-pattern knowledge.
 *
 * Each branch returns a Strategy with a concrete title + body.
 */
function buildStrategy(
  attractions: ApiAttraction[],
  park: Park,
  hasRealLive: boolean,
  downCount: number,
): Strategy {
  // 1. Several rides down (live-only signal).
  if (hasRealLive && downCount >= 3) {
    return {
      tag: "Heads up",
      title: `${downCount} attractions are down right now.`,
      body: "Reroute through what's running. The map shows live ride status — gray pins are out of service, colored pins are operating.",
      cta: { label: "Open the map", href: "#park-map" },
    };
  }

  // 2. Headliner with a short wait — strongest call-to-action.
  const shortHeadliner = pickShortHeadliner(park.id, attractions);
  if (shortHeadliner) {
    const wait = shortHeadliner.waitMinutes as number;
    return {
      tag: "Window open",
      title: `Ride ${shortHeadliner.name} now — ${wait} min for a headliner.`,
      body: hasRealLive
        ? "Headliner waits like this don't last long once the park fills in. Burn this window first, then circle back to gentler attractions."
        : "Headliner waits typically rise sharply through midday. The shortest window for a top ride is the first hour after gates open — start here.",
      cta: { label: "Plan it on the map", href: "#park-map" },
    };
  }

  // 3. Heavy crowds — average operating wait is high.
  const avg = averageWait(attractions);
  if (hasRealLive && avg !== null && avg >= 55) {
    return {
      tag: "Heavy crowds",
      title: "Most rides are over 50 minutes. Reset and ride later.",
      body: "Use this window for a meal, a show, or air-conditioning. Headliner waits typically dip 60–90 minutes before park close — that's the next clean window.",
      cta: { label: "Open the map", href: "#park-map" },
    };
  }

  // 4. Light crowds — average wait is low.
  if (hasRealLive && avg !== null && avg <= 25) {
    return {
      tag: "Light crowds",
      title: "Crowds are light — knock out headliners now.",
      body: `Average wait across operating rides is just ${avg} min. Hit your top picks at ${park.shortName ?? park.name} while the queues are friendly; come back for shows and food when crowds peak later.`,
      cta: { label: "Pick a headliner", href: "#park-map" },
    };
  }

  // 5. Estimated-mode default. Always actionable, grounded in real
  //    park knowledge — never says "data unavailable".
  if (!hasRealLive) {
    return {
      tag: "Game plan",
      title: "Hit your headliner first. Crowds peak after lunch.",
      body: `Top rides at ${park.shortName ?? park.name} have their shortest waits in the first hour after opening. Lock in your number-one pick before 11am, then work outward to the smaller rides as crowds build.`,
      cta: { label: "Open the map", href: "#park-map" },
    };
  }

  // 6. Mixed / moderate crowds — the catch-all when none of the
  //    sharper heuristics fired.
  return {
    tag: "Steady day",
    title: "Standard crowds — start with shorter waits and work up.",
    body: avg !== null
      ? `Average operating wait is around ${avg} min. Knock out a few short-queue rides first; revisit headliners when the lunch crowd thins out.`
      : "Knock out a few short-queue rides first; revisit headliners as crowds shift through the day.",
    cta: { label: "Open the map", href: "#park-map" },
  };
}

/**
 * Pick a curated headliner whose current wait is at least 25%
 * shorter than the park's running average — a real "ride this NOW"
 * window. Returns null when nothing qualifies.
 */
function pickShortHeadliner(
  parkSlug: string,
  attractions: ApiAttraction[],
): ApiAttraction | null {
  if (attractions.length < 3) return null;
  const avg = averageWait(attractions);
  if (avg == null) return null;
  const threshold = Math.min(35, Math.round(avg * 0.75));
  const headliners = attractions
    .filter(
      (a) =>
        isTopRide(parkSlug, a.slug) &&
        typeof a.waitMinutes === "number" &&
        (a.waitMinutes as number) <= threshold,
    )
    .sort((a, b) => (a.waitMinutes as number) - (b.waitMinutes as number));
  return headliners[0] ?? null;
}

function averageWait(attractions: ApiAttraction[]): number | null {
  const waits = attractions
    .map((a) => a.waitMinutes)
    .filter((w): w is number => typeof w === "number");
  if (waits.length === 0) return null;
  return Math.round(waits.reduce((s, w) => s + w, 0) / waits.length);
}

/* ─────────────────────────── Chrome ─────────────────────────── */

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden>
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
 * Estimated badge gains a "Predicted from park patterns" supporting
 * line so guests know exactly where the numbers come from. Same
 * two-line layout used in Parkio Picks for consistency.
 */
function StatusBadge({
  status,
  estimated,
}: {
  status: "loading" | "live" | "estimates";
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
        title="Live data unavailable — strategy based on each ride's typical wait at this park"
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

"use client";

import { useMemo } from "react";
import { RIDES } from "@/lib/data";
import { useAllLive } from "@/lib/useAllLive";
import type { ApiPark, ApiParkLive } from "@/lib/types";
import { simulatedWait } from "@/lib/utils";

/**
 * /parks page "Today's overview" tiles.
 *
 * Reads the shared `useAllLive` hook for live data, but does its OWN
 * computation of average / busiest / quietest with a baseWait-based
 * fallback. The fallback lives here (not in the hook) so we don't
 * change the shape of `useAllLive` — every other consumer of that
 * hook (LiveRightNow, BestRidesAllParksGrid, WaitsAllParks,
 * ResortCards) sees the exact same data it always has.
 *
 * Tile state matrix:
 *   - status === "loading"     → "Loading…"
 *   - we have a numeric value  → "{N} min" (with "(est.)" hint if any
 *                                 contributing park used baseWaits)
 *   - no data anywhere         → "Not available"
 */

interface OverviewSummary {
  averageWait: number | null;
  averageWaitEstimated: boolean;
  busiestPark: { slug: string; name: string; avg: number; estimated: boolean } | null;
  quietestPark: { slug: string; name: string; avg: number; estimated: boolean } | null;
  openParkCount: number;
}

function computeOverview(
  parks: ApiPark[],
  liveByPark: Map<string, ApiParkLive>,
): OverviewSummary {
  const perParkAvg: Array<{ slug: string; name: string; avg: number; estimated: boolean }> = [];

  let totalWait = 0;
  let totalCount = 0;
  let liveContributedAny = false;
  let estimatedContributedAny = false;

  for (const park of parks) {
    // Skip parks the API has explicitly flagged CLOSED — closed parks
    // don't have meaningful wait stats. UNKNOWN parks pass through.
    if (park.status === "CLOSED") continue;

    const live = liveByPark.get(park.slug);

    // Real-live path — exclude CLOSED / DOWN / REFURBISHMENT and rides
    // with null waitMinutes. Only OPERATING + numeric waits count.
    const liveOperating =
      live?.attractions.filter(
        (a) => a.status === "OPERATING" && typeof a.waitMinutes === "number",
      ) ?? [];

    if (liveOperating.length > 0) {
      const sum = liveOperating.reduce(
        (s, a) => s + (a.waitMinutes as number),
        0,
      );
      perParkAvg.push({
        slug: park.slug,
        name: park.name,
        avg: Math.round(sum / liveOperating.length),
        estimated: false,
      });
      totalWait += sum;
      totalCount += liveOperating.length;
      liveContributedAny = true;
      continue;
    }

    // Estimated path — no live operating attractions for this park.
    // Fall back to deterministic-ish simulated waits over the static
    // ride list, excluding any ride a partial live response marked as
    // not running (CLOSED / DOWN / REFURBISHMENT).
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

    const parkRides = RIDES.filter(
      (r) => r.parkId === park.slug && !blocked.has(r.id),
    );
    if (parkRides.length === 0) continue;

    const estWaits = parkRides.map((r) => simulatedWait(r));
    const sum = estWaits.reduce((s, w) => s + w, 0);
    perParkAvg.push({
      slug: park.slug,
      name: park.name,
      avg: Math.round(sum / parkRides.length),
      estimated: true,
    });
    totalWait += sum;
    totalCount += parkRides.length;
    estimatedContributedAny = true;
  }

  const averageWait = totalCount === 0 ? null : Math.round(totalWait / totalCount);
  const averageWaitEstimated =
    averageWait !== null && estimatedContributedAny && !liveContributedAny;

  let busiestPark: OverviewSummary["busiestPark"] = null;
  let quietestPark: OverviewSummary["quietestPark"] = null;
  for (const entry of perParkAvg) {
    if (!busiestPark || entry.avg > busiestPark.avg) busiestPark = entry;
    if (!quietestPark || entry.avg < quietestPark.avg) quietestPark = entry;
  }

  const openParkCount = parks.filter((p) => p.status === "OPEN").length;

  return {
    averageWait,
    averageWaitEstimated,
    busiestPark,
    quietestPark,
    openParkCount,
  };
}

export function ParksTodayOverview() {
  const { status, parks, liveByPark, lastUpdated } = useAllLive();

  const {
    averageWait,
    averageWaitEstimated,
    busiestPark,
    quietestPark,
    openParkCount,
  } = useMemo(() => computeOverview(parks, liveByPark), [parks, liveByPark]);

  const total = parks.length || 6;
  const isLoading = status === "loading";

  // Avg-wait tile: append "(est.)" only when the entire average came
  // from baseWait estimates rather than live data.
  const avgValue = isLoading
    ? "Loading…"
    : averageWait !== null
      ? `${averageWait} min${averageWaitEstimated ? " (est.)" : ""}`
      : "Not available";

  const busiestValue = isLoading
    ? "Loading…"
    : busiestPark
      ? busiestPark.name
      : "Not available";
  const busiestSub =
    !isLoading && busiestPark
      ? `${busiestPark.avg} min avg${busiestPark.estimated ? " (est.)" : ""}`
      : undefined;

  const quietestValue = isLoading
    ? "Loading…"
    : quietestPark
      ? quietestPark.name
      : "Not available";
  const quietestSub =
    !isLoading && quietestPark
      ? `${quietestPark.avg} min avg${quietestPark.estimated ? " (est.)" : ""}`
      : undefined;

  return (
    <div className="mt-10">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-medium uppercase tracking-widest text-accent-600">
          Today's overview
        </span>
        <span aria-hidden className="text-ink-300">
          ·
        </span>
        <LiveDot status={status} lastUpdated={lastUpdated} total={total} openCount={openParkCount} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          label="Parks open"
          value={isLoading ? "Loading…" : `${openParkCount} / ${total}`}
        />
        <Tile label="Avg wait" value={avgValue} />
        <Tile label="Busiest park" value={busiestValue} sub={busiestSub} />
        <Tile label="Quietest park" value={quietestValue} sub={quietestSub} />
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white px-4 py-3 shadow-soft">
      <div className="text-[10px] font-medium uppercase tracking-widest text-ink-500">
        {label}
      </div>
      <div className="mt-1 truncate text-base font-semibold tracking-tight text-ink-900">
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 truncate text-[11px] font-medium text-ink-500">
          {sub}
        </div>
      )}
    </div>
  );
}

function LiveDot({
  status,
  lastUpdated,
  total,
  openCount,
}: {
  status: "loading" | "live" | "estimates";
  lastUpdated: string | null;
  total: number;
  openCount: number;
}) {
  if (status === "loading") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ink-500">
        <span className="h-1.5 w-1.5 rounded-full bg-ink-300" />
        Checking…
      </span>
    );
  }
  if (status === "estimates") {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-ink-500"
        title="Live data unavailable — showing estimated waits"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-ink-400" />
        Estimated waits
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-600">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      Live · {openCount} of {total} parks open
      {lastUpdated && ` · updated ${formatAge(lastUpdated)}`}
    </span>
  );
}

function formatAge(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "just now";
  const ageS = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (ageS < 30) return "just now";
  if (ageS < 90) return "1m ago";
  if (ageS < 60 * 60) return `${Math.round(ageS / 60)}m ago`;
  if (ageS < 60 * 60 * 24) return `${Math.round(ageS / 3600)}h ago`;
  return new Date(ts).toLocaleString();
}

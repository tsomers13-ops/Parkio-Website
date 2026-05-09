"use client";

import { useEffect, useMemo, useState } from "react";
import { RIDES } from "./data";
import { fetchParkLive, fetchParksList } from "./parkioClient";
import type { ApiAttraction, ApiPark, ApiParkLive } from "./types";
import { simulatedWait } from "./utils";

export type AllLiveStatus = "loading" | "live" | "estimates";

export interface AggregatedRide {
  attraction: ApiAttraction;
  parkName: string;
}

/**
 * A per-park summary for the overview tiles. `estimated` is true when
 * the average was computed from static `baseWait` (because upstream
 * live data is unavailable or empty for this park) instead of from
 * real operating waits — the tile can render an "(est.)" hint in
 * that case so the number isn't misleading.
 */
export interface ParkWaitSummary {
  slug: string;
  name: string;
  avg: number;
  estimated: boolean;
}

export interface AllLiveData {
  status: AllLiveStatus;
  parks: ApiPark[];
  /** Per-park live response, keyed by park slug. */
  liveByPark: Map<string, ApiParkLive>;
  lastUpdated: string | null;

  /** OPERATING attractions across all parks, sorted by ascending waitMinutes. */
  shortestWaits: AggregatedRide[];
  /** OPERATING attractions across all parks, sorted by descending waitMinutes. */
  longestWaits: AggregatedRide[];

  /** Average wait across all parks (rounded to nearest min). May be estimated — see `averageWaitEstimated`. */
  averageWait: number | null;
  /** True when `averageWait` was derived entirely from `baseWait` estimates (no live data anywhere). */
  averageWaitEstimated: boolean;
  /** Park with the highest average wait. */
  busiestPark: ParkWaitSummary | null;
  /** Park with the lowest average wait. */
  quietestPark: ParkWaitSummary | null;
  /** Count of parks reporting OPEN today. */
  openParkCount: number;
}

/**
 * Fetches /api/parks + each park's /api/parks/{slug}/live in parallel.
 * Refreshes every 60 seconds. Used by both the home-page "Right now"
 * widget and the parks-listing "Today's overview" tiles.
 */
export function useAllLive(): AllLiveData {
  const [status, setStatus] = useState<AllLiveStatus>("loading");
  const [parks, setParks] = useState<ApiPark[]>([]);
  const [liveByPark, setLiveByPark] = useState<Map<string, ApiParkLive>>(
    () => new Map(),
  );
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    async function load() {
      try {
        const list = await fetchParksList(ctl.signal);
        const liveResponses = await Promise.all(
          list.parks.map((p) =>
            fetchParkLive(p.slug, ctl.signal).catch(() => null),
          ),
        );
        if (cancelled || ctl.signal.aborted) return;

        const map = new Map<string, ApiParkLive>();
        let anyLive = false;
        for (let i = 0; i < list.parks.length; i++) {
          const live = liveResponses[i];
          if (live) {
            map.set(list.parks[i].slug, live);
            if (live.live) anyLive = true;
          }
        }

        setParks(list.parks);
        setLiveByPark(map);
        setLastUpdated(list.lastUpdated);
        setStatus(anyLive ? "live" : "estimates");
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        if (cancelled) return;
        setStatus("estimates");
      } finally {
        if (cancelled || ctl.signal.aborted) return;
        // Only schedule the next poll while the tab is visible. Hidden
        // tabs sit idle until they come back into focus, saving battery
        // and avoiding pointless network calls.
        if (
          typeof document === "undefined" ||
          document.visibilityState === "visible"
        ) {
          timer = setTimeout(load, 60_000);
        }
      }
    }

    function onVisibilityChange() {
      if (cancelled) return;
      if (document.visibilityState === "visible") {
        // Tab is back — refresh immediately and resume polling.
        if (timer) clearTimeout(timer);
        load();
      } else if (timer) {
        // Tab went hidden — pause the schedule.
        clearTimeout(timer);
        timer = null;
      }
    }

    load();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    return () => {
      cancelled = true;
      ctl.abort();
      if (timer) clearTimeout(timer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
    };
  }, []);

  const derived = useMemo(() => {
    // `operating` is the LIVE-only set of rides — used for shortestWaits
    // and longestWaits (which only make sense with real data).
    const operating: AggregatedRide[] = [];

    // Each park contributes one summary row. When live data is present,
    // the row is computed from operating attractions with numeric waits;
    // when live data is missing OR empty, we fall back to a deterministic
    // estimate from each ride's static `baseWait`. This is what powers
    // the overview tiles (Avg / Busiest / Quietest), which previously
    // rendered "—" any time upstream went out — even though the page
    // still claimed "Estimated waits" in the status line.
    const perParkAvg: ParkWaitSummary[] = [];

    // Aggregate of all numeric waits (live + estimated) used to compute
    // the cross-park average. We average over rides, not over parks, so
    // a park with 30 rides isn't weighted the same as one with 5.
    let totalWait = 0;
    let totalCount = 0;
    let liveContributedAny = false;
    let estimatedContributedAny = false;

    for (const park of parks) {
      const live = liveByPark.get(park.slug);

      // Skip CLOSED parks entirely — closed parks don't have meaningful
      // wait stats. UNKNOWN parks still pass through (we assume they
      // might be open and just don't have schedule yet).
      if (park.status === "CLOSED") continue;

      // ── Real-live path ─────────────────────────────────────────────
      // Use live operating attractions when available. Excludes CLOSED,
      // DOWN, REFURBISHMENT, and rides with null waitMinutes — only
      // OPERATING + numeric waits count.
      const liveOperating =
        live?.attractions.filter(
          (a) => a.status === "OPERATING" && typeof a.waitMinutes === "number",
        ) ?? [];

      if (liveOperating.length > 0) {
        for (const a of liveOperating) {
          operating.push({ attraction: a, parkName: park.name });
          totalWait += a.waitMinutes as number;
          totalCount += 1;
        }
        const avg =
          liveOperating.reduce((s, a) => s + (a.waitMinutes as number), 0) /
          liveOperating.length;
        perParkAvg.push({
          slug: park.slug,
          name: park.name,
          avg: Math.round(avg),
          estimated: false,
        });
        liveContributedAny = true;
        continue;
      }

      // ── Estimated path ─────────────────────────────────────────────
      // No live operating data for this park. Build an average from the
      // static ride list using `simulatedWait` (deterministic-ish around
      // each ride's `baseWait`), so the tiles aren't blank. We still
      // exclude any ride that the partial live response explicitly
      // marked as not running (CLOSED / DOWN / REFURBISHMENT).
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

    const shortestWaits = [...operating]
      .sort((a, b) => a.attraction.waitMinutes! - b.attraction.waitMinutes!)
      .slice(0, 3);

    const longestWaits = [...operating]
      .sort((a, b) => b.attraction.waitMinutes! - a.attraction.waitMinutes!)
      .slice(0, 3);

    const averageWait = totalCount === 0 ? null : Math.round(totalWait / totalCount);
    // True when the cross-park average had no live contribution at all
    // — every park's row was estimated. The overview tile uses this to
    // append an "(est.)" hint so guests know the number isn't live.
    const averageWaitEstimated =
      averageWait !== null && estimatedContributedAny && !liveContributedAny;

    let busiestPark: ParkWaitSummary | null = null;
    let quietestPark: ParkWaitSummary | null = null;
    for (const entry of perParkAvg) {
      if (!busiestPark || entry.avg > busiestPark.avg) busiestPark = entry;
      if (!quietestPark || entry.avg < quietestPark.avg) quietestPark = entry;
    }

    const openParkCount = parks.filter((p) => p.status === "OPEN").length;

    return {
      shortestWaits,
      longestWaits,
      averageWait,
      averageWaitEstimated,
      busiestPark,
      quietestPark,
      openParkCount,
    };
  }, [parks, liveByPark]);

  return {
    status,
    parks,
    liveByPark,
    lastUpdated,
    ...derived,
  };
}

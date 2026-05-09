"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchParkLive, fetchParksList } from "./parkioClient";
import type { ApiAttraction, ApiPark, ApiParkLive } from "./types";

export type AllLiveStatus = "loading" | "live" | "estimates";

export interface AggregatedRide {
  attraction: ApiAttraction;
  parkName: string;
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

  /** Average operating wait across all parks (rounded to nearest min). */
  averageWait: number | null;
  /** Park with the highest average wait. */
  busiestPark: { slug: string; name: string; avg: number } | null;
  /** Park with the lowest average wait. */
  quietestPark: { slug: string; name: string; avg: number } | null;
  /** Count of parks reporting OPEN today. */
  openParkCount: number;
}

/**
 * Fetches /api/parks + each park's /api/parks/{slug}/live in parallel.
 * Refreshes every 60 seconds. Used by both the home-page "Right now"
 * widget and the parks-listing "Today's overview" tiles.
 *
 * IMPORTANT: this hook returns LIVE-derived stats only. `averageWait`,
 * `busiestPark`, and `quietestPark` are `null` when no operating
 * attractions with numeric waits are present anywhere — that's the
 * contract every consumer (LiveRightNow, ResortCards, WaitsAllParks,
 * BestRidesAllParksGrid, ParksTodayOverview) was written against.
 *
 * If a surface needs a fallback (e.g. baseWait estimates when upstream
 * is empty), it should compute that fallback locally over `parks` +
 * `liveByPark` rather than expanding this hook's shape — broadening
 * here is risky because every consumer reads the same fields.
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
    const operating: AggregatedRide[] = [];
    const perParkAvg: Array<{ slug: string; name: string; avg: number }> = [];

    for (const park of parks) {
      const live = liveByPark.get(park.slug);
      if (!live) continue;
      const opAttrs = live.attractions.filter(
        (a) => a.status === "OPERATING" && typeof a.waitMinutes === "number",
      );
      for (const a of opAttrs) {
        operating.push({ attraction: a, parkName: park.name });
      }
      if (opAttrs.length > 0) {
        const avg =
          opAttrs.reduce(
            (sum, a) => sum + (a.waitMinutes as number),
            0,
          ) / opAttrs.length;
        perParkAvg.push({
          slug: park.slug,
          name: park.name,
          avg: Math.round(avg),
        });
      }
    }

    const shortestWaits = [...operating]
      .sort((a, b) => (a.attraction.waitMinutes! - b.attraction.waitMinutes!))
      .slice(0, 3);

    const longestWaits = [...operating]
      .sort((a, b) => (b.attraction.waitMinutes! - a.attraction.waitMinutes!))
      .slice(0, 3);

    const averageWait =
      operating.length === 0
        ? null
        : Math.round(
            operating.reduce((s, r) => s + (r.attraction.waitMinutes as number), 0) /
              operating.length,
          );

    let busiestPark: AllLiveData["busiestPark"] = null;
    let quietestPark: AllLiveData["quietestPark"] = null;
    for (const entry of perParkAvg) {
      if (!busiestPark || entry.avg > busiestPark.avg) busiestPark = entry;
      if (!quietestPark || entry.avg < quietestPark.avg) quietestPark = entry;
    }

    const openParkCount = parks.filter((p) => p.status === "OPEN").length;

    return {
      shortestWaits,
      longestWaits,
      averageWait,
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

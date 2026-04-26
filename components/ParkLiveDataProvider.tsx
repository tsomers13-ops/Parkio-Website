"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchPark, fetchParkLive } from "@/lib/parkioClient";
import type { ApiPark, ApiParkLive } from "@/lib/types";

/**
 * Live-data context for an entire park page. ONE polling loop fetches
 * /api/parks/{slug} and /api/parks/{slug}/live every minute and shares
 * the result with ParkMap, ParkInsights, and ParkRecommendations via
 * `useParkLive()`.
 *
 * Behaviors:
 *  • Visible tab → polls every 60s
 *  • Hidden tab  → suspends polling (no fetches at all while hidden)
 *  • Tab returns to visible → fires an immediate refresh
 *  • Component unmount → aborts any in-flight fetch
 *
 * Each component on the page that needs live data calls `useParkLive()`
 * — they share the same fetch result, no duplicate requests.
 */

const VISIBLE_INTERVAL_MS = 60_000; // poll every minute when visible
const STALE_THRESHOLD_MS = 5 * 60_000; // "data may be delayed" after 5 min
const TICK_INTERVAL_MS = 30_000; // re-render relative timestamps

export type LiveStatus = "loading" | "live" | "estimates";

export interface ParkLiveContextValue {
  parkSlug: string;
  parkApi: ApiPark | null;
  liveApi: ApiParkLive | null;
  status: LiveStatus;
  /** ISO of when the live response was generated server-side. */
  lastUpdated: string | null;
  /** True when lastUpdated is older than 5 minutes. */
  isStale: boolean;
  /** Force an immediate refetch. */
  refresh: () => void;
}

const ParkLiveContext = createContext<ParkLiveContextValue | null>(null);

interface ProviderProps {
  parkSlug: string;
  children: React.ReactNode;
}

export function ParkLiveDataProvider({ parkSlug, children }: ProviderProps) {
  const [parkApi, setParkApi] = useState<ApiPark | null>(null);
  const [liveApi, setLiveApi] = useState<ApiParkLive | null>(null);
  const [status, setStatus] = useState<LiveStatus>("loading");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  // We keep the active controller + timer in refs so `refresh()` can
  // cancel an in-flight request and reschedule cleanly without
  // re-triggering the effect.
  const ctlRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  // Tick `now` so derived `isStale` re-evaluates over time even when
  // no new fetches land.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const fetchAll = useCallback(async (): Promise<void> => {
    // Abort any in-flight request before kicking off a new one.
    ctlRef.current?.abort();
    const ctl = new AbortController();
    ctlRef.current = ctl;

    try {
      const [parkRes, liveRes] = await Promise.all([
        fetchPark(parkSlug, ctl.signal),
        fetchParkLive(parkSlug, ctl.signal),
      ]);
      if (cancelledRef.current || ctl.signal.aborted) return;
      setParkApi(parkRes);
      setLiveApi(liveRes);
      setLastUpdated(liveRes.lastUpdated);
      setStatus(liveRes.live ? "live" : "estimates");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      if (cancelledRef.current) return;
      // Don't blow away cached data — just mark this fetch as failed.
      setStatus("estimates");
    }
  }, [parkSlug]);

  // Schedule the next poll only when the tab is visible. Hidden tabs
  // sit idle until they come back into focus.
  const scheduleNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (cancelledRef.current) return;
    if (
      typeof document !== "undefined" &&
      document.visibilityState !== "visible"
    ) {
      // Don't schedule anything; visibilitychange handler will refetch
      // when the tab is visible again.
      return;
    }
    timerRef.current = setTimeout(async () => {
      await fetchAll();
      scheduleNext();
    }, VISIBLE_INTERVAL_MS);
  }, [fetchAll]);

  const refresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    void fetchAll().finally(() => scheduleNext());
  }, [fetchAll, scheduleNext]);

  // Reset everything when the park slug changes.
  useEffect(() => {
    cancelledRef.current = false;
    setStatus("loading");
    setParkApi(null);
    setLiveApi(null);
    setLastUpdated(null);

    // Initial fetch + schedule
    void fetchAll().finally(() => scheduleNext());

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        // Tab returned — refetch immediately and resume polling.
        if (timerRef.current) clearTimeout(timerRef.current);
        void fetchAll().finally(() => scheduleNext());
      } else {
        // Tab hidden — pause the schedule. Any in-flight fetch can
        // still complete; we just don't queue another one.
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      ctlRef.current?.abort();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
    };
  }, [parkSlug, fetchAll, scheduleNext]);

  const isStale = useMemo(() => {
    if (!lastUpdated) return false;
    const ts = Date.parse(lastUpdated);
    if (Number.isNaN(ts)) return false;
    return now - ts > STALE_THRESHOLD_MS;
  }, [lastUpdated, now]);

  const value = useMemo<ParkLiveContextValue>(
    () => ({
      parkSlug,
      parkApi,
      liveApi,
      status,
      lastUpdated,
      isStale,
      refresh,
    }),
    [parkSlug, parkApi, liveApi, status, lastUpdated, isStale, refresh],
  );

  return (
    <ParkLiveContext.Provider value={value}>
      {children}
    </ParkLiveContext.Provider>
  );
}

export function useParkLive(): ParkLiveContextValue {
  const ctx = useContext(ParkLiveContext);
  if (!ctx) {
    throw new Error(
      "useParkLive must be used inside a <ParkLiveDataProvider>",
    );
  }
  return ctx;
}

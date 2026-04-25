"use client";

import type L from "leaflet";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Park, Ride } from "@/lib/types";
import { fetchLiveWaits, simulatedWait } from "@/lib/utils";
import { BottomSheet } from "./BottomSheet";
import { RideDetailPanel } from "./RideDetailPanel";

// Leaflet uses `window` and won't render server-side.
const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-ink-50" />,
});

interface ParkMapProps {
  park: Park;
  rides: Ride[];
}

export function ParkMap({ park, rides }: ParkMapProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [time, setTime] = useState<string>("--:--");
  const [liveWaits, setLiveWaits] = useState<Map<string, number>>(
    () => new Map(),
  );
  const [liveStatus, setLiveStatus] = useState<"loading" | "live" | "offline">(
    "loading",
  );
  const mapRef = useRef<L.Map | null>(null);

  // Tick simulated wait times every 30s (used as fallback when no live data)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Fetch live wait times from themeparks.wiki on mount + every 60s
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const live = await fetchLiveWaits(park);
      if (cancelled) return;
      setLiveWaits(live);
      setLiveStatus(live.size > 0 ? "live" : "offline");
    }
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [park]);

  // Live clock (client-side only to avoid hydration mismatch)
  useEffect(() => {
    function tick() {
      setTime(
        new Date().toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        }),
      );
    }
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  const waits = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rides) {
      const live = liveWaits.get(r.externalId);
      map.set(r.id, typeof live === "number" ? live : simulatedWait(r, now));
    }
    return map;
  }, [rides, liveWaits, now]);

  const selectedRide = useMemo(
    () => rides.find((r) => r.id === selectedId) ?? null,
    [rides, selectedId],
  );

  function zoomIn() {
    mapRef.current?.zoomIn();
  }
  function zoomOut() {
    mapRef.current?.zoomOut();
  }
  function recenter() {
    const map = mapRef.current;
    if (!map) return;
    if (rides.length > 0) {
      const lats = rides.map((r) => r.lat);
      const lngs = rides.map((r) => r.lng);
      map.fitBounds(
        [
          [Math.min(...lats), Math.min(...lngs)],
          [Math.max(...lats), Math.max(...lngs)],
        ],
        {
          padding: [80, 80],
          maxZoom: 18,
          animate: true,
          duration: 0.6,
        },
      );
    } else {
      map.flyTo([park.lat, park.lng], park.zoom, { duration: 0.6 });
    }
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-ink-50">
      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[800] px-4 pt-4 sm:px-6 sm:pt-6">
        <div className="pointer-events-auto mx-auto flex max-w-3xl items-center justify-between gap-3">
          <a
            href="/parks"
            className="surface-glass inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-ink-800 shadow-soft transition hover:text-ink-900"
            aria-label="Back to parks"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5"
              fill="none"
              aria-hidden
            >
              <path
                d="M10 3L5 8l5 5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Parks
          </a>

          <div className="surface-glass flex min-w-0 items-center gap-3 rounded-full px-4 py-2 shadow-soft">
            <span
              className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-white"
              style={{
                background: `linear-gradient(135deg, ${park.themeHex}, ${park.themeAccentHex})`,
              }}
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden>
                <path
                  d="M12 3l3 6 6 .9-4.5 4.4 1 6.2L12 17.8 6.5 20.5l1-6.2L3 9.9 9 9l3-6z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <div className="min-w-0">
              <div className="truncate text-[11px] font-medium uppercase tracking-widest text-ink-500">
                {park.hours}
              </div>
              <div className="truncate text-sm font-semibold text-ink-900">
                {park.name}
              </div>
            </div>
            <span
              className={`ml-2 hidden items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium ring-1 sm:inline-flex ${
                liveStatus === "live"
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : liveStatus === "offline"
                    ? "bg-ink-100 text-ink-600 ring-ink-200"
                    : "bg-ink-50 text-ink-500 ring-ink-200"
              }`}
              title={
                liveStatus === "live"
                  ? "Live wait times from themeparks.wiki"
                  : liveStatus === "offline"
                    ? "Live data unavailable — showing estimated waits"
                    : "Loading live wait times…"
              }
            >
              <span className="relative flex h-1.5 w-1.5">
                {liveStatus === "live" && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                    liveStatus === "live"
                      ? "bg-emerald-500"
                      : liveStatus === "offline"
                        ? "bg-ink-400"
                        : "bg-ink-300"
                  }`}
                />
              </span>
              {liveStatus === "live"
                ? "Live"
                : liveStatus === "offline"
                  ? "Estimates"
                  : "Loading"}
            </span>
          </div>

          <div className="surface-glass inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-ink-800 shadow-soft">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
              <circle
                cx="8"
                cy="8"
                r="6"
                stroke="currentColor"
                strokeWidth="1.4"
                fill="none"
              />
              <path
                d="M8 4.5V8l2.2 1.6"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            <span suppressHydrationWarning>{time}</span>
          </div>
        </div>
      </div>

      {/* The map */}
      <div className="absolute inset-0">
        <LeafletMap
          park={park}
          rides={rides}
          waits={waits}
          selectedId={selectedId}
          onSelect={(id) => setSelectedId(id)}
          mapRef={mapRef}
        />
      </div>

      {/* Custom map controls */}
      <div className="absolute right-4 top-1/2 z-[800] flex -translate-y-1/2 flex-col gap-2 sm:right-6">
        <button
          type="button"
          onClick={zoomIn}
          className="surface-glass inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-800 shadow-soft transition hover:text-ink-900"
          aria-label="Zoom in"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
            <path
              d="M8 3v10M3 8h10"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <button
          type="button"
          onClick={zoomOut}
          className="surface-glass inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-800 shadow-soft transition hover:text-ink-900"
          aria-label="Zoom out"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
            <path
              d="M3 8h10"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <button
          type="button"
          onClick={recenter}
          className="surface-glass inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-800 shadow-soft transition hover:text-ink-900"
          aria-label="Recenter"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
            <circle
              cx="8"
              cy="8"
              r="2"
              stroke="currentColor"
              strokeWidth="1.4"
              fill="none"
            />
            <path
              d="M8 2v2M8 12v2M2 8h2M12 8h2"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Legend */}
      <div className="surface-glass absolute bottom-6 left-4 z-[800] hidden items-center gap-3 rounded-full px-3 py-2 text-[11px] font-medium text-ink-700 shadow-soft sm:left-6 sm:inline-flex">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          ≤ 30m
        </span>
        <span className="text-ink-300">·</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          31–60m
        </span>
        <span className="text-ink-300">·</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rose-500" />
          60m+
        </span>
      </div>

      {/* Bottom sheet */}
      <BottomSheet
        open={!!selectedRide}
        onClose={() => setSelectedId(null)}
      >
        {selectedRide && (
          <RideDetailPanel
            ride={selectedRide}
            wait={waits.get(selectedRide.id) ?? selectedRide.baseWait}
            onClose={() => setSelectedId(null)}
          />
        )}
      </BottomSheet>
    </div>
  );
}

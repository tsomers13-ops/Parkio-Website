"use client";

import type L from "leaflet";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchPark,
  fetchParkLive,
} from "@/lib/parkioClient";
import type {
  ApiPark,
  ApiParkLive,
  ApiAttractionStatus,
  Park,
  Ride,
} from "@/lib/types";
import { simulatedWait } from "@/lib/utils";
import { BottomSheet } from "./BottomSheet";
import { RideDetailPanel } from "./RideDetailPanel";
import { RideList } from "./RideList";

// Leaflet uses `window` and won't render server-side.
const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-ink-50" />,
});

/**
 * What we render for each ride. Combines API data (when available)
 * with a deterministic simulated fallback so the map always feels alive.
 */
export interface RideDisplay {
  /** Wait minutes when known; null = no wait time available right now. */
  wait: number | null;
  /** Status: OPERATING / DOWN / CLOSED / REFURBISHMENT / UNKNOWN. */
  status: ApiAttractionStatus;
  /** True when the wait/status came from /api/parks/[slug]/live; false = simulated. */
  isLive: boolean;
}

export type LiveStatus =
  | "loading" // first fetch hasn't returned yet
  | "live" // most recent fetch returned real data
  | "estimates" // most recent fetch failed or upstream was down
  ;

interface ParkMapProps {
  park: Park;
  rides: Ride[];
}

export function ParkMap({ park, rides }: ParkMapProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());
  const [time, setTime] = useState<string>("--:--");
  const [parkApi, setParkApi] = useState<ApiPark | null>(null);
  const [liveApi, setLiveApi] = useState<ApiParkLive | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("loading");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Tick once a minute so the simulated fallback breathes when live data is
  // unavailable, and so the "last updated 2m ago" label refreshes.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Live clock for the top bar (client-only, avoids hydration mismatch).
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

  // Pull both park metadata + live attractions from Parkio's own API.
  useEffect(() => {
    const ctl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      try {
        const [parkRes, liveRes] = await Promise.all([
          fetchPark(park.id, ctl.signal),
          fetchParkLive(park.id, ctl.signal),
        ]);
        setParkApi(parkRes);
        setLiveApi(liveRes);
        setLastUpdated(liveRes.lastUpdated);
        setLiveStatus(liveRes.live ? "live" : "estimates");
      } catch (err) {
        // Network failure or aborted — keep showing simulated fallback.
        if ((err as Error).name !== "AbortError") {
          setLiveStatus("estimates");
        }
      } finally {
        if (!ctl.signal.aborted) {
          // Refresh every 60s even on success so the "Live" label stays honest.
          timer = setTimeout(load, 60_000);
        }
      }
    }

    setLiveStatus("loading");
    setLastUpdated(null);
    load();

    return () => {
      ctl.abort();
      if (timer) clearTimeout(timer);
    };
  }, [park]);

  // Fast lookup of live attractions by Parkio slug.
  const liveBySlug = useMemo(() => {
    const map = new Map<string, ApiParkLive["attractions"][number]>();
    for (const a of liveApi?.attractions ?? []) map.set(a.slug, a);
    return map;
  }, [liveApi]);

  /**
   * Per-ride display state. Resolves to one of:
   *
   *   - real wait (live, OPERATING + waitMinutes is a number)
   *   - status pill (live, status DOWN/CLOSED/REFURBISHMENT)
   *   - "no wait time" (live, OPERATING but waitMinutes is null)
   *   - simulated fallback (no live data yet OR live but UNKNOWN)
   */
  const displays = useMemo(() => {
    const map = new Map<string, RideDisplay>();
    for (const r of rides) {
      const live = liveBySlug.get(r.id);
      if (live) {
        if (live.status === "OPERATING") {
          if (typeof live.waitMinutes === "number") {
            map.set(r.id, {
              wait: live.waitMinutes,
              status: "OPERATING",
              isLive: true,
            });
          } else {
            // Operating but no standby data right now.
            map.set(r.id, { wait: null, status: "OPERATING", isLive: true });
          }
        } else if (live.status === "UNKNOWN") {
          // API admits it doesn't know — fall back to simulated so the
          // map still feels alive.
          map.set(r.id, {
            wait: simulatedWait(r, now),
            status: "OPERATING",
            isLive: false,
          });
        } else {
          // DOWN / CLOSED / REFURBISHMENT
          map.set(r.id, {
            wait: null,
            status: live.status,
            isLive: true,
          });
        }
      } else {
        // No row in the live response yet (still loading or attraction not in the upstream).
        map.set(r.id, {
          wait: simulatedWait(r, now),
          status: "OPERATING",
          isLive: false,
        });
      }
    }
    return map;
  }, [rides, liveBySlug, now]);

  const selectedRide = useMemo(
    () => rides.find((r) => r.id === selectedId) ?? null,
    [rides, selectedId],
  );

  // Park-level status. Prefer the API. Falls back to the static config.
  const parkStatus = parkApi?.status ?? "UNKNOWN";
  const isParkClosed = parkStatus === "CLOSED";

  // Display hours: live API window when available, else the static label.
  // Always format in the park's local timezone so a viewer in Tokyo sees
  // the Florida park's 9 AM open as "9 AM" — not "10 PM the next day".
  const hoursLabel = useMemo(() => {
    const w = parkApi?.todayHours;
    if (!w) return park.hours;
    try {
      const tz = parkApi?.timezone;
      const fmt = (iso: string) =>
        new Date(iso)
          .toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
            timeZone: tz,
          })
          .replace(":00", "");
      return `${fmt(w.open)} — ${fmt(w.close)}`.toUpperCase();
    } catch {
      return park.hours;
    }
  }, [parkApi, park.hours]);

  // Render a friendly "2m ago" / "just now" label for the lastUpdated stamp.
  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdated) return null;
    const ts = Date.parse(lastUpdated);
    if (Number.isNaN(ts)) return null;
    const ageS = Math.max(0, Math.round((now - ts) / 1000));
    if (ageS < 30) return "just now";
    if (ageS < 90) return "1m ago";
    if (ageS < 60 * 60) return `${Math.round(ageS / 60)}m ago`;
    if (ageS < 60 * 60 * 24) return `${Math.round(ageS / 3600)}h ago`;
    return new Date(ts).toLocaleString();
  }, [lastUpdated, now]);

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
        { padding: [80, 80], maxZoom: 18, animate: true, duration: 0.6 },
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
            className="surface-glass inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-ink-800 shadow-soft transition hover:text-ink-900"
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
            <span className="hidden sm:inline">Parks</span>
          </a>

          <div className="surface-glass flex min-w-0 flex-1 items-center gap-3 rounded-full px-4 py-2 shadow-soft sm:flex-none">
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
                {hoursLabel}
              </div>
              <div className="truncate text-sm font-semibold text-ink-900">
                {park.name}
              </div>
            </div>
            <LiveBadge status={liveStatus} />
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

        {/* Last updated + Park closed strip */}
        <div className="pointer-events-auto mx-auto mt-2 flex max-w-3xl items-center justify-center gap-2">
          {isParkClosed && (
            <div className="surface-glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold text-rose-700 shadow-soft ring-1 ring-rose-200">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              Park is closed today
            </div>
          )}
          {lastUpdatedLabel && (
            <div className="surface-glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-ink-600 shadow-soft">
              <span aria-hidden>·</span>
              <span>Updated {lastUpdatedLabel}</span>
            </div>
          )}
        </div>
      </div>

      {/* The map */}
      <div className="absolute inset-0">
        <LeafletMap
          park={park}
          rides={rides}
          displays={displays}
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
        <button
          type="button"
          onClick={() => setListOpen(true)}
          className="surface-glass inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-800 shadow-soft transition hover:text-ink-900"
          aria-label="Open attraction list"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
            <path
              d="M3 4h10M3 8h10M3 12h10"
              stroke="currentColor"
              strokeWidth="1.6"
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

      {/* List view side panel */}
      <RideList
        open={listOpen}
        parkName={park.name}
        rides={rides}
        displays={displays}
        onClose={() => setListOpen(false)}
        onSelect={(id) => {
          setListOpen(false);
          setSelectedId(id);
        }}
      />

      {/* Bottom sheet */}
      <BottomSheet
        open={!!selectedRide}
        onClose={() => setSelectedId(null)}
      >
        {selectedRide && (
          <RideDetailPanel
            ride={selectedRide}
            display={
              displays.get(selectedRide.id) ?? {
                wait: selectedRide.baseWait,
                status: "OPERATING",
                isLive: false,
              }
            }
            onClose={() => setSelectedId(null)}
          />
        )}
      </BottomSheet>
    </div>
  );
}

/* ─────────────────── Live badge ─────────────────── */

function LiveBadge({ status }: { status: LiveStatus }) {
  if (status === "loading") {
    return (
      <span
        className="ml-2 hidden items-center gap-1.5 rounded-full bg-ink-50 px-2 py-1 text-[11px] font-medium text-ink-500 ring-1 ring-ink-200 sm:inline-flex"
        title="Loading live wait times…"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-ink-300" />
        Loading
      </span>
    );
  }
  if (status === "estimates") {
    return (
      <span
        className="ml-2 hidden items-center gap-1.5 rounded-full bg-ink-100 px-2 py-1 text-[11px] font-medium text-ink-600 ring-1 ring-ink-200 sm:inline-flex"
        title="Live data unavailable — showing estimated waits"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-ink-400" />
        Estimated waits
      </span>
    );
  }
  return (
    <span
      className="ml-2 hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200 sm:inline-flex"
      title="Live wait times from the Parkio API"
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      Live
    </span>
  );
}

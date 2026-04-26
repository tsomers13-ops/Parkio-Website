"use client";

import type L from "leaflet";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ApiAttractionStatus,
  Park,
  Ride,
} from "@/lib/types";
import { simulatedWait } from "@/lib/utils";
import { BottomSheet } from "./BottomSheet";
import { useMapFocus } from "./MapFocusProvider";
import { useParkLive } from "./ParkLiveDataProvider";
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

interface ParkMapProps {
  park: Park;
  rides: Ride[];
}

export function ParkMap({ park, rides }: ParkMapProps) {
  // All live data now flows from the page-level provider — no per-component
  // fetching, no duplicate requests across ParkMap / ParkInsights /
  // ParkRecommendations.
  const { parkApi, liveApi, status: liveStatus, lastUpdated, isStale } =
    useParkLive();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());
  const [time, setTime] = useState<string>("--:--");
  const mapRef = useRef<L.Map | null>(null);

  // The "Right now" hero (and potentially other components) can ask
  // the map to focus on a specific ride. We respond by smooth-panning
  // the Leaflet map, briefly highlighting the pin, and auto-opening
  // the ride detail sheet. Lightweight — no routing, no data fetch.
  // We also push every selection up to the shared provider so that
  // sibling sections (e.g. "Near you") can use the last-selected ride
  // as a proxy for the user's current location.
  const { focusedRideSlug, focusToken, currentRideSlug, setCurrentRide } =
    useMapFocus();
  const [highlightId, setHighlightId] = useState<string | null>(null);
  // Path hint — a subtle curved/dashed line drawn ONLY when the user
  // arrives via the "Right now" hero's "View on map" button AND has
  // a previously selected ride to anchor the line. Auto-clears on
  // sheet close, on a different pin selection, or after 6s.
  const [pathHint, setPathHint] = useState<{
    from: Ride;
    to: Ride;
  } | null>(null);

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

  // ── Shared camera motion ────────────────────────────────────────
  // Smoothly pans and gently zooms the map so the ride sits ABOVE
  // the bottom sheet — Google-Maps-style. Used by both the selection
  // effect (pin tap) and the focus effect ("Right now" hero), so the
  // motion feels identical regardless of where the user came from.
  //
  // Vertical offset: shift the camera CENTER down in pixel space so
  // the pin lands in the upper-half of the visible viewport (the half
  // not covered by the sheet). Phones use a bigger offset since the
  // sheet covers more of the screen.
  //
  // Retries while Leaflet is still mounting (cap ~1.6s) so a fast
  // tap right after page load still wins.
  const flyToRide = useCallback((ride: Ride) => {
    let attempts = 0;
    function go() {
      const map = mapRef.current;
      if (!map) {
        if (attempts++ < 20) setTimeout(go, 80);
        return;
      }
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const targetZoom = Math.max(map.getZoom(), 17);
      const isMobile =
        typeof window !== "undefined" && window.innerWidth < 640;
      const offsetY =
        (typeof window !== "undefined" ? window.innerHeight : 800) *
        (isMobile ? 0.22 : 0.15);

      const pixelMarker = map.project([ride.lat, ride.lng], targetZoom);
      const adjustedLatLng = map.unproject(
        [pixelMarker.x, pixelMarker.y + offsetY],
        targetZoom,
      );

      if (reduced) {
        map.setView(adjustedLatLng, targetZoom, { animate: false });
      } else {
        map.flyTo(adjustedLatLng, targetZoom, {
          duration: 0.7,
          easeLinearity: 0.25,
        });
      }
    }
    go();
  }, []);

  // ── Selection → camera ──────────────────────────────────────────
  // Whenever the selected ride changes (from a direct pin tap, or
  // because the focus effect below set it), fly to the new ride.
  // Skips when nothing is selected so closing the sheet doesn't move
  // the map.
  useEffect(() => {
    if (!selectedId) return;
    const ride = rides.find((r) => r.id === selectedId);
    if (!ride) return;
    flyToRide(ride);
  }, [selectedId, rides, flyToRide]);

  // ── Selection → "Near you" location anchor ──────────────────────
  // Treat the most recently selected ride as the user's current
  // location. We only push UP to the provider (we don't clear it on
  // sheet close), so closing the sheet keeps the last known location.
  useEffect(() => {
    if (selectedId) setCurrentRide(selectedId);
  }, [selectedId, setCurrentRide]);

  // ── "Right now" hero focus ──────────────────────────────────────
  // The hero's "View on map" button calls focusRide(slug). We open
  // the sheet, briefly pulse the pin, AND explicitly call flyToRide
  // — explicit because the selection effect won't re-fire if the
  // ride is already the selected one (e.g. user re-taps the same
  // top pick). Re-runs on every focusRide() call thanks to focusToken.
  //
  // Path hint: when the user has a previously selected ride that's
  // different from the focus target, also draw a subtle curved line
  // between them. We capture currentRideSlug here BEFORE setSelectedId
  // updates it (the selection effect runs later), so the closure value
  // is the user's previous location. Excluded from deps so this effect
  // doesn't re-fire when the location updates.
  useEffect(() => {
    if (!focusedRideSlug) return;
    const ride = rides.find((r) => r.id === focusedRideSlug);
    if (!ride) return;

    const fromRide =
      currentRideSlug && currentRideSlug !== ride.id
        ? (rides.find((r) => r.id === currentRideSlug) ?? null)
        : null;

    setSelectedId(ride.id);
    setHighlightId(ride.id);
    flyToRide(ride);
    if (fromRide) setPathHint({ from: fromRide, to: ride });

    const highlightTimer = setTimeout(() => setHighlightId(null), 1600);
    // Path hint auto-clears after 6s — long enough to read, short
    // enough to not clutter the map for someone exploring further.
    const pathTimer = fromRide
      ? setTimeout(() => setPathHint(null), 6000)
      : null;
    return () => {
      clearTimeout(highlightTimer);
      if (pathTimer) clearTimeout(pathTimer);
    };
    // currentRideSlug is intentionally excluded — see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedRideSlug, focusToken, rides, flyToRide]);

  // Clear the path hint when the user navigates away from its target
  // (sheet closed, or a different pin selected). The hint is only
  // meaningful while the user is looking at the destination it points
  // to; afterwards, it's just clutter.
  useEffect(() => {
    if (!pathHint) return;
    if (!selectedId || selectedId !== pathHint.to.id) {
      setPathHint(null);
    }
  }, [selectedId, pathHint]);

  // Fast lookup of live attractions by Parkio slug.
  const liveBySlug = useMemo(() => {
    const map = new Map<string, NonNullable<typeof liveApi>["attractions"][number]>();
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
        <div className="pointer-events-auto mx-auto mt-2 flex max-w-3xl flex-wrap items-center justify-center gap-2">
          {isParkClosed && (
            <div className="surface-glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold text-rose-700 shadow-soft ring-1 ring-rose-200">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              Park is closed today
            </div>
          )}
          {lastUpdatedLabel && (
            <div
              className={`surface-glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium shadow-soft ${
                isStale ? "text-amber-700 ring-1 ring-amber-200" : "text-ink-600"
              }`}
              title={
                isStale
                  ? "This snapshot is more than 5 minutes old. Numbers may not reflect what's at the gate right now."
                  : "Last live refresh"
              }
            >
              <span aria-hidden>·</span>
              <span>
                Updated {lastUpdatedLabel}
                {isStale ? " · may be delayed" : ""}
              </span>
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
          highlightId={highlightId}
          pathHint={
            pathHint
              ? {
                  from: { lat: pathHint.from.lat, lng: pathHint.from.lng },
                  to: { lat: pathHint.to.lat, lng: pathHint.to.lng },
                }
              : null
          }
          onSelect={(id) => setSelectedId(id)}
          mapRef={mapRef}
        />
      </div>

      {/* Path-hint disclaimer chip — only visible when a hint is drawn */}
      {pathHint && (
        <div
          className="pointer-events-none absolute left-1/2 top-24 z-[800] -translate-x-1/2 sm:top-28"
          aria-live="polite"
        >
          <div className="surface-glass inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium text-ink-700 shadow-soft ring-1 ring-ink-200">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
            Path hint · approximate, not directions
          </div>
        </div>
      )}

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

function LiveBadge({ status }: { status: "loading" | "live" | "estimates" }) {
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

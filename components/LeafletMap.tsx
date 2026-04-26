"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import type { Park, Ride } from "@/lib/types";
import { statusLabel, waitTier } from "@/lib/utils";
import type { RideDisplay } from "./ParkMap";

interface LeafletMapProps {
  park: Park;
  rides: Ride[];
  displays: Map<string, RideDisplay>;
  selectedId: string | null;
  /**
   * Ride id that should pulse for ~1.6s. Set by <ParkMap> in response
   * to a focusRide() call from elsewhere on the page (e.g. the
   * "Right now" hero). Cleared automatically.
   */
  highlightId?: string | null;
  /**
   * Subtle curved/dashed path-hint line. Drawn from `from` to `to`
   * when set. Cleared automatically by <ParkMap>. Not a real route —
   * just a visual guide so the user can see roughly which way to go.
   */
  pathHint?: {
    from: { lat: number; lng: number };
    to: { lat: number; lng: number };
  } | null;
  onSelect: (rideId: string) => void;
  mapRef?: React.MutableRefObject<L.Map | null>;
}

export default function LeafletMap({
  park,
  rides,
  displays,
  selectedId,
  highlightId = null,
  pathHint = null,
  onSelect,
  mapRef,
}: LeafletMapProps) {
  const center = useMemo<[number, number]>(
    () => [park.lat, park.lng],
    [park.lat, park.lng],
  );

  return (
    <MapContainer
      center={center}
      zoom={park.zoom}
      minZoom={14}
      maxZoom={19}
      zoomControl={false}
      attributionControl={true}
      className="h-full w-full bg-ink-50"
      ref={(instance) => {
        if (mapRef) mapRef.current = instance;
      }}
    >
      <MapHandle parkId={park.id} center={center} zoom={park.zoom} rides={rides} />

      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
      />

      <ClusterMarkers
        rides={rides}
        displays={displays}
        selectedId={selectedId}
        highlightId={highlightId}
        onSelect={onSelect}
      />

      <PathHintLine pathHint={pathHint} />
    </MapContainer>
  );
}

/**
 * Renders a subtle, curved, dashed polyline from `from` → `to` when
 * `pathHint` is set. Pure visual aid; deliberately NOT a real walking
 * route. The curve is a quadratic Bezier with the control point
 * offset perpendicular to the chord, which gives it a guide-like
 * "swoosh" rather than a turn-by-turn-looking straight line.
 */
function PathHintLine({
  pathHint,
}: {
  pathHint: LeafletMapProps["pathHint"];
}) {
  const map = useMap();

  useEffect(() => {
    if (!pathHint) return;
    const pts = curvedPath(pathHint.from, pathHint.to);
    const line = L.polyline(pts, {
      color: "#6366f1", // accent-500
      weight: 2,
      opacity: 0.5,
      dashArray: "6 8",
      lineCap: "round",
      lineJoin: "round",
      interactive: false, // never blocks pin taps
      className: "parkio-path-hint",
      // Bury under marker pane so pins always read above the line
      pane: "overlayPane",
    });
    line.addTo(map);
    return () => {
      map.removeLayer(line);
    };
  }, [map, pathHint]);

  return null;
}

/**
 * Quadratic Bezier curve from `from` → `to` with the control point
 * offset perpendicular to the chord. Returns ~21 sample points along
 * the curve, suitable for an L.polyline. The bow is proportional to
 * chord length, so close rides get a gentle curve and far rides a
 * more pronounced arc.
 */
function curvedPath(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): [number, number][] {
  const dlat = to.lat - from.lat;
  const dlng = to.lng - from.lng;
  const mx = (from.lat + to.lat) / 2;
  const my = (from.lng + to.lng) / 2;
  // Perpendicular offset for the control point (rotate the chord 90°).
  // The 0.18 factor controls how much the curve bows — smaller = flatter.
  const bow = 0.18;
  const cx = mx - dlng * bow;
  const cy = my + dlat * bow;

  const pts: [number, number][] = [];
  const STEPS = 20;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const u = 1 - t;
    const px = u * u * from.lat + 2 * u * t * cx + t * t * to.lat;
    const py = u * u * from.lng + 2 * u * t * cy + t * t * to.lng;
    pts.push([px, py]);
  }
  return pts;
}

/**
 * On park change, fit the map to all the park's ride pins.
 * Falls back to the park's center/zoom if the park has no rides yet.
 */
function MapHandle({
  parkId,
  center,
  zoom,
  rides,
}: {
  parkId: string;
  center: [number, number];
  zoom: number;
  rides: Ride[];
}) {
  const map = useMap();
  useEffect(() => {
    if (rides.length > 0) {
      const bounds = L.latLngBounds(rides.map((r) => [r.lat, r.lng]));
      map.fitBounds(bounds, {
        padding: [80, 80],
        maxZoom: 18,
        animate: true,
        duration: 0.6,
      });
    } else {
      map.flyTo(center, zoom, { duration: 0.6 });
    }
    // Only run when the *park* changes, not on every ride update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parkId, map]);
  return null;
}

/**
 * Imperatively manages a markerClusterGroup on top of the map.
 * Markers are rebuilt whenever rides/waits/selection change.
 */
function ClusterMarkers({
  rides,
  displays,
  selectedId,
  highlightId,
  onSelect,
}: {
  rides: Ride[];
  displays: Map<string, RideDisplay>;
  selectedId: string | null;
  highlightId: string | null;
  onSelect: (rideId: string) => void;
}) {
  const map = useMap();
  const groupRef = useRef<L.MarkerClusterGroup | null>(null);

  // Create the cluster group once
  useEffect(() => {
    const group = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      // Inside a single park, every ride should be visible. Only cluster
      // when the user has zoomed way out (resort-wide view).
      disableClusteringAtZoom: 16,
      maxClusterRadius: 24,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `
            <div class="flex items-center justify-center rounded-full bg-white shadow-md ring-1 ring-ink-200" style="width: 40px; height: 40px;">
              <span class="text-xs font-semibold tracking-tight text-ink-900">${count}</span>
            </div>
          `,
          className: "parkio-cluster-icon",
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });
      },
    });
    groupRef.current = group;
    map.addLayer(group);
    return () => {
      map.removeLayer(group);
      groupRef.current = null;
    };
  }, [map]);

  // Sync markers whenever the inputs change
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();
    for (const ride of rides) {
      const display = displays.get(ride.id) ?? {
        wait: ride.baseWait,
        status: "OPERATING" as const,
        isLive: false,
      };
      const selected = ride.id === selectedId;
      const highlighted = ride.id === highlightId;
      const marker = L.marker([ride.lat, ride.lng], {
        icon: makeRideIcon(ride.name, display, selected, highlighted),
        // Highlighted pin floats above selected, which floats above
        // everything else.
        zIndexOffset: highlighted ? 2000 : selected ? 1000 : 0,
      });
      marker.on("click", () => onSelect(ride.id));
      group.addLayer(marker);
    }
  }, [rides, displays, selectedId, highlightId, onSelect]);

  return null;
}

function makeRideIcon(
  name: string,
  display: RideDisplay,
  selected: boolean,
  highlighted: boolean = false,
) {
  // Selected = the active "this is the one I'm looking at" state.
  // Larger scale, indigo ring, soft halo — reads like Google Maps'
  // active POI marker. Defaults are kept subtle for the resting state.
  const stateClass = selected
    ? "ring-2 ring-accent-500 scale-[1.18] shadow-[0_0_0_4px_rgba(99,102,241,0.18),0_8px_20px_rgba(99,102,241,0.28)]"
    : "ring-1 ring-ink-200 shadow-md";
  const highlightClass = highlighted ? "parkio-pin-pulse" : "";

  let pillContent: string;
  if (display.status !== "OPERATING" && display.status !== "UNKNOWN") {
    // Gray pill with status text — Down / Closed / Refurb
    pillContent = `
      <span class="inline-block h-2 w-2 rounded-full bg-ink-300"></span>
      <span class="text-[11px] font-semibold tracking-tight text-ink-500">${statusLabel(display.status)}</span>
    `;
  } else if (display.wait === null) {
    // Operating but no standby data right now — show an em-dash placeholder.
    pillContent = `
      <span class="inline-block h-2 w-2 rounded-full bg-ink-300"></span>
      <span class="text-[11px] font-semibold tracking-tight text-ink-500">—</span>
    `;
  } else {
    const tier = waitTier(display.wait);
    const dotClass =
      tier === "low"
        ? "bg-emerald-500"
        : tier === "mid"
          ? "bg-amber-500"
          : "bg-rose-500";
    pillContent = `
      <span class="inline-block h-2 w-2 rounded-full ${dotClass}"></span>
      <span class="text-[11px] font-semibold tracking-tight text-ink-900">${display.wait}m</span>
    `;
  }

  const labelTone =
    display.status === "OPERATING"
      ? selected
        ? "text-accent-900 ring-1 ring-accent-300"
        : "text-ink-700"
      : "text-ink-500";

  // The transition class still smooths in-place property changes
  // (ring color, shadow) when the icon is preserved — and is a no-op
  // on a freshly-created marker (which also looks fine because the
  // active pin appears at the END of the camera fly-in).
  const html = `
    <div class="parkio-pin flex flex-col items-center pointer-events-auto">
      <div class="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 transition duration-200 ${stateClass} ${highlightClass}">
        ${pillContent}
      </div>
      <div class="parkio-pin-label mt-1 max-w-[160px] truncate rounded-md bg-white/95 px-2 py-0.5 text-center text-[10px] font-semibold tracking-tight ${labelTone} shadow-sm">${escapeHtml(name)}</div>
    </div>
  `;

  return L.divIcon({
    html,
    className: "parkio-divicon",
    iconSize: [180, 48],
    iconAnchor: [90, 14],
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

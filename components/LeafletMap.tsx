"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import type { Park, Ride } from "@/lib/types";
import { waitTier } from "@/lib/utils";

interface LeafletMapProps {
  park: Park;
  rides: Ride[];
  waits: Map<string, number>;
  selectedId: string | null;
  onSelect: (rideId: string) => void;
  mapRef?: React.MutableRefObject<L.Map | null>;
}

export default function LeafletMap({
  park,
  rides,
  waits,
  selectedId,
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
        waits={waits}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </MapContainer>
  );
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
  waits,
  selectedId,
  onSelect,
}: {
  rides: Ride[];
  waits: Map<string, number>;
  selectedId: string | null;
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
      const wait = waits.get(ride.id) ?? ride.baseWait;
      const selected = ride.id === selectedId;
      const marker = L.marker([ride.lat, ride.lng], {
        icon: makeRideIcon(ride.name, wait, selected),
        zIndexOffset: selected ? 1000 : 0,
      });
      marker.on("click", () => onSelect(ride.id));
      group.addLayer(marker);
    }
  }, [rides, waits, selectedId, onSelect]);

  return null;
}

function makeRideIcon(name: string, wait: number, selected: boolean) {
  const tier = waitTier(wait);
  const dotClass =
    tier === "low"
      ? "bg-emerald-500"
      : tier === "mid"
        ? "bg-amber-500"
        : "bg-rose-500";

  const ringClass = selected
    ? "ring-2 ring-ink-900 scale-110"
    : "ring-1 ring-ink-200";

  const html = `
    <div class="parkio-pin flex flex-col items-center pointer-events-auto">
      <div class="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 shadow-md transition ${ringClass}">
        <span class="inline-block h-2 w-2 rounded-full ${dotClass}"></span>
        <span class="text-[11px] font-semibold tracking-tight text-ink-900">${wait}m</span>
      </div>
      <div class="parkio-pin-label mt-1 max-w-[160px] truncate rounded-md bg-white/95 px-2 py-0.5 text-center text-[10px] font-semibold tracking-tight ${
        selected ? "text-ink-900 ring-1 ring-ink-900" : "text-ink-700"
      } shadow-sm">${escapeHtml(name)}</div>
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

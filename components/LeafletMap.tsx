"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
} from "react-leaflet";
import type { Park, Ride } from "@/lib/types";
import { rideLatLng, waitColorClasses, waitTier } from "@/lib/utils";

interface LeafletMapProps {
  park: Park;
  rides: Ride[];
  waits: Map<string, number>;
  selectedId: string | null;
  onSelect: (rideId: string) => void;
  /** Internal map handle exposed so parent can do programmatic zoom/recenter. */
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
      minZoom={15}
      maxZoom={19}
      zoomControl={false}
      attributionControl={true}
      className="h-full w-full bg-ink-50"
      ref={(instance) => {
        if (mapRef) mapRef.current = instance;
      }}
    >
      <MapHandle parkId={park.id} center={center} zoom={park.zoom} />

      {/* CARTO Voyager — clean, low-contrast basemap that lets pins pop */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
      />

      {rides.map((ride) => {
        const pos = rideLatLng(park, ride);
        const wait = waits.get(ride.id) ?? ride.baseWait;
        const selected = ride.id === selectedId;
        const icon = makeRideIcon(ride.name, wait, selected);
        return (
          <Marker
            key={ride.id}
            position={pos}
            icon={icon}
            eventHandlers={{
              click: () => onSelect(ride.id),
            }}
          />
        );
      })}
    </MapContainer>
  );
}

/** Re-fly to the park whenever it changes (when navigating between parks). */
function MapHandle({
  parkId,
  center,
  zoom,
}: {
  parkId: string;
  center: [number, number];
  zoom: number;
}) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 0.6 });
  }, [parkId, center, zoom, map]);
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
    : "ring-1 ring-ink-200 hover:ring-ink-300";

  // We render the pin + label as a small flex column. CSS classes match the
  // Tailwind classes we already use elsewhere in the project so the JIT picks
  // them up.
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

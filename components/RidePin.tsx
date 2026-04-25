"use client";

import type { Ride } from "@/lib/types";
import { waitColorClasses, waitTier } from "@/lib/utils";

interface RidePinProps {
  ride: Ride;
  wait: number;
  selected: boolean;
  onSelect: (rideId: string) => void;
}

export function RidePin({ ride, wait, selected, onSelect }: RidePinProps) {
  const tier = waitTier(wait);
  const c = waitColorClasses(tier);

  return (
    <button
      type="button"
      onClick={() => onSelect(ride.id)}
      className="absolute -translate-x-1/2 -translate-y-1/2 transform-gpu transition-transform"
      style={{
        left: `${ride.x}%`,
        top: `${ride.y}%`,
        zIndex: selected ? 30 : 10,
      }}
      aria-label={`${ride.name} — ${wait} minute wait`}
    >
      <span className="relative flex flex-col items-center">
        {/* Pulse ring on selected */}
        {selected && (
          <span
            className={`absolute -inset-1 rounded-full ${c.pin} animate-pulse-ring opacity-40`}
          />
        )}

        {/* Pill */}
        <span
          className={`relative inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 shadow-soft ring-1 transition ${
            selected
              ? "ring-ink-900 scale-110 shadow-lift"
              : "ring-ink-200 hover:ring-ink-300 hover:scale-105"
          }`}
        >
          <span className={`relative inline-flex h-2 w-2 rounded-full ${c.pin}`}>
            <span
              className={`absolute inline-flex h-full w-full animate-pulse-ring rounded-full ${c.pin} opacity-50`}
            />
          </span>
          <span className="text-[11px] font-semibold text-ink-900">
            {wait}m
          </span>
        </span>

        {/* Ride name label, always visible */}
        <span
          className={`mt-1 max-w-[160px] truncate rounded-md bg-white/90 px-2 py-0.5 text-center text-[10px] font-semibold leading-tight tracking-tight shadow-soft backdrop-blur transition ${
            selected ? "text-ink-900 ring-1 ring-ink-900" : "text-ink-700"
          }`}
        >
          {ride.name}
        </span>
      </span>
    </button>
  );
}

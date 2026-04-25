"use client";

import type { Ride } from "@/lib/types";
import { statusLabel, waitColorClasses, waitTier } from "@/lib/utils";
import type { RideDisplay } from "./ParkMap";

interface RideDetailPanelProps {
  ride: Ride;
  display: RideDisplay;
  onClose: () => void;
}

export function RideDetailPanel({
  ride,
  display,
  onClose,
}: RideDetailPanelProps) {
  const wait = display.wait;
  const isOperating = display.status === "OPERATING";
  const tier = waitTier(wait);
  const c = waitColorClasses(tier);

  const trendLabel =
    ride.trend === "up"
      ? "Rising"
      : ride.trend === "down"
        ? "Falling"
        : "Steady";

  const trendIcon =
    ride.trend === "up" ? "↑" : ride.trend === "down" ? "↓" : "→";

  const trendTone =
    ride.trend === "up"
      ? "bg-rose-50 text-rose-700 ring-rose-200"
      : ride.trend === "down"
        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
        : "bg-ink-100 text-ink-700 ring-ink-200";

  return (
    <div className="px-5 pb-6 pt-1 sm:px-7">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-widest text-ink-500">
            {ride.land}
          </div>
          <h2 className="mt-1 truncate text-2xl font-semibold tracking-tight text-ink-900">
            {ride.name}
          </h2>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="-mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
          aria-label="Close ride details"
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            className="h-4 w-4"
            aria-hidden
          >
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {isOperating ? (
          <div className={`rounded-2xl px-3 py-3 ring-1 ${c.bg} ${c.ring}`}>
            <div className={`text-[10px] font-medium uppercase tracking-widest ${c.text} opacity-80`}>
              Wait
            </div>
            <div className={`mt-0.5 text-xl font-semibold ${c.text}`}>
              {wait} min
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-ink-100 px-3 py-3 ring-1 ring-ink-200">
            <div className="text-[10px] font-medium uppercase tracking-widest text-ink-600 opacity-80">
              Status
            </div>
            <div className="mt-0.5 text-xl font-semibold text-ink-700">
              {statusLabel(display.status)}
            </div>
          </div>
        )}

        <div className={`rounded-2xl px-3 py-3 ring-1 ${trendTone}`}>
          <div className="text-[10px] font-medium uppercase tracking-widest opacity-80">
            Trend
          </div>
          <div className="mt-0.5 text-xl font-semibold">
            {trendIcon} {trendLabel}
          </div>
        </div>

        <div
          className={`rounded-2xl px-3 py-3 ring-1 ${
            ride.lightningLane
              ? "bg-accent-50 text-accent-700 ring-accent-200"
              : "bg-ink-100 text-ink-600 ring-ink-200"
          }`}
        >
          <div className="text-[10px] font-medium uppercase tracking-widest opacity-80">
            Lightning Lane
          </div>
          <div className="mt-0.5 text-xl font-semibold">
            {ride.lightningLane ? "Available" : "—"}
          </div>
        </div>
      </div>

      {ride.height && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink-100 px-3 py-1.5 text-xs font-medium text-ink-700">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
            <path
              d="M3 14V2M5 4H3M5 7H3M5 10H3M5 13H3M9 14V2l4 6-4 6z"
              stroke="currentColor"
              strokeWidth="1.4"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {ride.height}
        </div>
      )}

      <p className="mt-5 text-sm leading-relaxed text-ink-600">
        {ride.description}
      </p>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-white shadow-soft transition hover:bg-ink-800 active:scale-[0.99]"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
            <path
              d="M8 3v10M3 8h10"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          Add to plan
        </button>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-ink-200 bg-white px-4 py-3 text-sm font-medium text-ink-800 shadow-soft transition hover:border-ink-300 hover:bg-ink-50"
        >
          Directions
        </button>
      </div>
    </div>
  );
}

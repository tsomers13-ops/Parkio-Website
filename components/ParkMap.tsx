"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Park, Ride } from "@/lib/types";
import { simulatedWait } from "@/lib/utils";
import { BottomSheet } from "./BottomSheet";
import { RideDetailPanel } from "./RideDetailPanel";
import { RidePin } from "./RidePin";

interface ParkMapProps {
  park: Park;
  rides: Ride[];
}

export function ParkMap({ park, rides }: ParkMapProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [time, setTime] = useState<string>("--:--");

  // Zoom & pan
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(
    null,
  );

  // Tick the simulated wait times every 30 seconds.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Live clock (rendered client-side to avoid hydration mismatches).
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
    for (const r of rides) map.set(r.id, simulatedWait(r, now));
    return map;
  }, [rides, now]);

  const selectedRide = useMemo(
    () => rides.find((r) => r.id === selectedId) ?? null,
    [rides, selectedId],
  );

  function clamp(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v));
  }

  function applyTransform(nextScale: number, nextTx: number, nextTy: number) {
    const s = clamp(nextScale, 1, 3);
    setScale(s);

    const surface = surfaceRef.current;
    if (!surface) {
      setTx(nextTx);
      setTy(nextTy);
      return;
    }
    const rect = surface.getBoundingClientRect();
    const maxX = ((s - 1) * rect.width) / 2;
    const maxY = ((s - 1) * rect.height) / 2;
    setTx(clamp(nextTx, -maxX, maxX));
    setTy(clamp(nextTy, -maxY, maxY));
  }

  function onWheel(e: React.WheelEvent) {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 6) return;
    e.preventDefault();
    const delta = -e.deltaY * 0.0025;
    applyTransform(scale + delta, tx, ty);
  }

  function onPointerDown(e: React.PointerEvent) {
    // Only grab on background, not on pin buttons.
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, tx, ty };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    applyTransform(scale, dragRef.current.tx + dx, dragRef.current.ty + dy);
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  function zoomIn() {
    applyTransform(scale + 0.4, tx, ty);
  }
  function zoomOut() {
    applyTransform(scale - 0.4, tx, ty);
  }
  function recenter() {
    applyTransform(1, 0, 0);
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-ink-50">
      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 px-4 pt-4 sm:px-6 sm:pt-6">
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
            <span className="ml-2 hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {park.status}
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

      {/* Map surface */}
      <div
        ref={surfaceRef}
        className="absolute inset-0 touch-none select-none"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          cursor: dragRef.current ? "grabbing" : "grab",
        }}
      >
        <div
          className="absolute inset-0 origin-center transition-transform duration-150 ease-out"
          style={{
            transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
            transitionDuration: dragRef.current ? "0ms" : "150ms",
          }}
        >
          <MapBackground theme={park.themeHex} accent={park.themeAccentHex} />

          {rides.map((ride) => (
            <RidePin
              key={ride.id}
              ride={ride}
              wait={waits.get(ride.id) ?? ride.baseWait}
              selected={ride.id === selectedId}
              onSelect={(id) => setSelectedId(id)}
            />
          ))}
        </div>
      </div>

      {/* Map controls */}
      <div className="absolute right-4 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2 sm:right-6">
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
      <div className="surface-glass absolute bottom-6 left-4 z-20 hidden items-center gap-3 rounded-full px-3 py-2 text-[11px] font-medium text-ink-700 shadow-soft sm:left-6 sm:inline-flex">
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

function MapBackground({
  theme,
  accent,
}: {
  theme: string;
  accent: string;
}) {
  return (
    <div className="absolute inset-0">
      {/* Soft themed gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(60% 50% at 30% 30%, ${accent}33 0%, transparent 60%), radial-gradient(60% 60% at 80% 70%, ${theme}26 0%, transparent 60%), linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)`,
        }}
      />
      {/* Dot grid */}
      <div className="bg-dots absolute inset-0 opacity-60" />
      {/* Decorative paths suggesting walkways */}
      <svg
        viewBox="0 0 1000 700"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <linearGradient id="walkway" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#cbd5e1" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#e2e8f0" stopOpacity="0.5" />
          </linearGradient>
          <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`${accent}80`} />
            <stop offset="100%" stopColor={`${accent}33`} />
          </linearGradient>
        </defs>

        {/* Lake */}
        <path
          d="M620 480 C 700 460, 780 500, 800 560 C 820 620, 720 640, 660 620 C 580 600, 560 510, 620 480 Z"
          fill="url(#water)"
          opacity="0.6"
        />

        {/* Main walkway loop */}
        <path
          d="M120 200 C 220 140, 360 140, 460 200 C 600 260, 700 220, 820 280 C 880 320, 880 460, 800 520 C 700 580, 540 580, 420 540 C 300 500, 200 460, 160 380 C 130 320, 120 260, 120 200 Z"
          stroke="url(#walkway)"
          strokeWidth="22"
          fill="none"
          strokeLinejoin="round"
        />
        {/* Inner connector */}
        <path
          d="M340 220 C 420 280, 500 320, 580 280 C 660 240, 700 320, 720 380"
          stroke="url(#walkway)"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M260 360 C 320 380, 380 380, 440 360"
          stroke="url(#walkway)"
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
        />

        {/* Trees */}
        {Array.from({ length: 36 }).map((_, i) => {
          const seed = (i * 9301 + 49297) % 233280;
          const rand = seed / 233280;
          const x = 80 + ((i * 71) % 880);
          const y = 80 + ((i * 53) % 560);
          const r = 6 + (rand * 8);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={r}
              fill="#10b981"
              opacity={0.18}
            />
          );
        })}
      </svg>
    </div>
  );
}

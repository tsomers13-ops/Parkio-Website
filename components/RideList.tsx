"use client";

import { useEffect, useMemo, useState } from "react";
import type { Ride } from "@/lib/types";
import { statusLabel, waitColorClasses, waitTier } from "@/lib/utils";
import type { RideDisplay } from "./ParkMap";

interface RideListProps {
  open: boolean;
  parkName: string;
  rides: Ride[];
  displays: Map<string, RideDisplay>;
  onClose: () => void;
  onSelect: (rideId: string) => void;
}

type SortMode = "shortest" | "longest" | "alpha";

/**
 * Slide-in side panel listing every attraction in the park, sorted
 * by wait time. A complement to the map — same data, scannable shape.
 *
 * Selecting a row closes the list and opens the existing bottom sheet.
 */
export function RideList({
  open,
  parkName,
  rides,
  displays,
  onClose,
  onSelect,
}: RideListProps) {
  const [sort, setSort] = useState<SortMode>("shortest");

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const sorted = useMemo(() => {
    const arr = [...rides];
    arr.sort((a, b) => {
      const da = displays.get(a.id);
      const db = displays.get(b.id);
      const operatingA = (da?.status ?? "OPERATING") === "OPERATING";
      const operatingB = (db?.status ?? "OPERATING") === "OPERATING";
      // Operating rides float to the top.
      if (operatingA !== operatingB) return operatingA ? -1 : 1;
      if (sort === "alpha") return a.name.localeCompare(b.name);
      const wa = da?.wait ?? Number.POSITIVE_INFINITY;
      const wb = db?.wait ?? Number.POSITIVE_INFINITY;
      return sort === "shortest" ? wa - wb : wb - wa;
    });
    return arr;
  }, [rides, displays, sort]);

  const operatingCount = useMemo(
    () =>
      rides.filter(
        (r) => (displays.get(r.id)?.status ?? "OPERATING") === "OPERATING",
      ).length,
    [rides, displays],
  );

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-[850] bg-ink-900/20 backdrop-blur-[1px] transition-opacity duration-300 ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`All attractions at ${parkName}`}
        className={`fixed bottom-0 right-0 top-0 z-[900] flex w-full max-w-md flex-col bg-white shadow-lift transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-widest text-ink-500">
              {parkName}
            </div>
            <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-ink-900">
              All attractions
            </h2>
            <div className="mt-1 text-xs text-ink-500">
              {operatingCount} of {rides.length} operating
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
            aria-label="Close attraction list"
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
        </header>

        {/* Sort chips */}
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-5 py-3">
          <span className="text-[11px] font-medium uppercase tracking-widest text-ink-500">
            Sort
          </span>
          <SortChip active={sort === "shortest"} onClick={() => setSort("shortest")}>
            Shortest wait
          </SortChip>
          <SortChip active={sort === "longest"} onClick={() => setSort("longest")}>
            Longest wait
          </SortChip>
          <SortChip active={sort === "alpha"} onClick={() => setSort("alpha")}>
            A–Z
          </SortChip>
        </div>

        <ul className="flex-1 divide-y divide-ink-100 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          {sorted.map((ride) => {
            const display = displays.get(ride.id);
            return (
              <li key={ride.id}>
                <button
                  type="button"
                  onClick={() => onSelect(ride.id)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left transition hover:bg-ink-50/60"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold tracking-tight text-ink-900">
                      {ride.name}
                    </div>
                    <div className="truncate text-[11px] font-medium uppercase tracking-widest text-ink-500">
                      {ride.land}
                    </div>
                  </div>
                  <RidePill display={display} />
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    </>
  );
}

function SortChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
        active
          ? "bg-ink-900 text-white"
          : "bg-ink-100 text-ink-700 hover:bg-ink-200"
      }`}
    >
      {children}
    </button>
  );
}

function RidePill({ display }: { display: RideDisplay | undefined }) {
  if (!display) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-semibold text-ink-500 ring-1 ring-ink-200">
        <span className="h-1.5 w-1.5 rounded-full bg-ink-300" />
        —
      </span>
    );
  }
  if (display.status !== "OPERATING") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-semibold text-ink-600 ring-1 ring-ink-200">
        <span className="h-1.5 w-1.5 rounded-full bg-ink-300" />
        {statusLabel(display.status)}
      </span>
    );
  }
  if (display.wait === null) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-50 px-2.5 py-1 text-[11px] font-semibold text-ink-500 ring-1 ring-ink-200">
        <span className="h-1.5 w-1.5 rounded-full bg-ink-300" />
        —
      </span>
    );
  }
  const tier = waitTier(display.wait);
  const c = waitColorClasses(tier);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${c.bg} ${c.text} ${c.ring}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {display.wait} min
    </span>
  );
}

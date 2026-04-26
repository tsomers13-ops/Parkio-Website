"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchParkLive } from "@/lib/parkioClient";
import { isTopRide, partitionAttractions } from "@/lib/popularity";
import type { ApiAttraction, ApiParkLive, Park } from "@/lib/types";
import { waitColorClasses, waitTier } from "@/lib/utils";

interface ParkRecommendationsProps {
  park: Park;
}

type LoadStatus = "loading" | "live" | "estimates";

/**
 * "What to ride next" decision layer. Three scannable cards built on
 * top of the same /api/parks/{slug}/live data the map uses:
 *
 *   - Best right now: short waits + popular headliners
 *   - Good options: moderate waits, not top-tier (strong B-list)
 *   - Skip for now: anything currently > 60-minute wait
 *
 * No real AI — just hand-curated popularity sets in lib/popularity.ts
 * combined with deterministic scoring. Designed to be readable in
 * under 5 seconds on a phone in line.
 */
export function ParkRecommendations({ park }: ParkRecommendationsProps) {
  const [live, setLive] = useState<ApiParkLive | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");

  useEffect(() => {
    const ctl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      try {
        const res = await fetchParkLive(park.id, ctl.signal);
        if (ctl.signal.aborted) return;
        setLive(res);
        setStatus(res.live ? "live" : "estimates");
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setStatus("estimates");
      } finally {
        if (!ctl.signal.aborted) timer = setTimeout(load, 60_000);
      }
    }
    load();
    return () => {
      ctl.abort();
      if (timer) clearTimeout(timer);
    };
  }, [park]);

  const { bestNow, goodOptions, skipForNow } = useMemo(() => {
    if (!live) return { bestNow: [], goodOptions: [], skipForNow: [] };
    return partitionAttractions(park.id, live.attractions);
  }, [live, park.id]);

  return (
    <section className="border-t border-ink-100 bg-ink-50/50">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-widest text-accent-600">
              What to ride next
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              Smart picks for{" "}
              <span className="bg-gradient-to-br from-accent-600 to-sky-500 bg-clip-text text-transparent">
                right now
              </span>
              .
            </h2>
            <p className="mt-3 text-base text-ink-600">
              Updated every minute from live wait times. Pick a card and
              go.
            </p>
          </div>
          <StatusBadge status={status} />
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card
            title="Best right now"
            tone="emerald"
            empty={
              status === "loading"
                ? "Loading…"
                : "Most rides have lines over an hour. Good time for a snack or a show."
            }
            attractions={bestNow}
            parkSlug={park.id}
            highlightTopRides
          />
          <Card
            title="Good options"
            tone="amber"
            empty={
              status === "loading"
                ? "Loading…"
                : "Try the headliners first — moderate-wait rides aren't reporting yet."
            }
            attractions={goodOptions}
            parkSlug={park.id}
          />
          <Card
            title="Skip for now"
            tone="rose"
            empty={
              status === "loading"
                ? "Loading…"
                : "No long lines right now. Take advantage."
            }
            attractions={skipForNow}
            parkSlug={park.id}
          />
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Card ─────────────────────────── */

function Card({
  title,
  tone,
  attractions,
  empty,
  parkSlug,
  highlightTopRides = false,
}: {
  title: string;
  tone: "emerald" | "amber" | "rose";
  attractions: ApiAttraction[];
  empty: string;
  parkSlug: string;
  highlightTopRides?: boolean;
}) {
  const tag =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : "bg-rose-50 text-rose-700 ring-rose-200";

  return (
    <div className="rounded-3xl border border-ink-100 bg-white p-5 shadow-soft sm:p-6">
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${tag}`}
        >
          {title}
        </span>
        {attractions.length > 0 && (
          <span className="text-[11px] font-medium text-ink-400">
            {attractions.length} pick{attractions.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {attractions.length === 0 ? (
        <div className="mt-4 px-1 py-6 text-center text-sm text-ink-500">
          {empty}
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-ink-100">
          {attractions.map((a) => (
            <Row
              key={a.id}
              attraction={a}
              parkSlug={parkSlug}
              showTopBadge={highlightTopRides}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  attraction,
  parkSlug,
  showTopBadge,
}: {
  attraction: ApiAttraction;
  parkSlug: string;
  showTopBadge: boolean;
}) {
  const popular = showTopBadge && isTopRide(parkSlug, attraction.slug);
  const wait = attraction.waitMinutes;

  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="truncate text-sm font-semibold tracking-tight text-ink-900"
            title={attraction.name}
          >
            {attraction.name}
          </span>
          {popular && (
            <span
              className="inline-flex shrink-0 items-center rounded-full bg-accent-50 px-1.5 py-0.5 text-[10px] font-semibold text-accent-700 ring-1 ring-accent-100"
              title="Top-tier headliner"
            >
              Headliner
            </span>
          )}
        </div>
      </div>
      <WaitPill minutes={wait} />
    </li>
  );
}

function WaitPill({ minutes }: { minutes: number | null }) {
  if (typeof minutes !== "number") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-semibold text-ink-500 ring-1 ring-ink-200">
        <span className="h-1.5 w-1.5 rounded-full bg-ink-300" />
        —
      </span>
    );
  }
  const tier = waitTier(minutes);
  const c = waitColorClasses(tier);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${c.bg} ${c.text} ${c.ring}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {minutes} min
    </span>
  );
}

function StatusBadge({ status }: { status: LoadStatus }) {
  if (status === "loading") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-50 px-3 py-1.5 text-[11px] font-medium text-ink-500 ring-1 ring-ink-200">
        <span className="h-1.5 w-1.5 rounded-full bg-ink-300" />
        Loading
      </span>
    );
  }
  if (status === "estimates") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-3 py-1.5 text-[11px] font-medium text-ink-600 ring-1 ring-ink-200"
        title="Live data unavailable — picks based on estimated waits"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-ink-400" />
        Estimated waits
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      Live · refreshes every minute
    </span>
  );
}

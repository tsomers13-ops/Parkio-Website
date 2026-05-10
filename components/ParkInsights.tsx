"use client";

import Link from "next/link";
import { useMemo } from "react";
import { RIDES } from "@/lib/data";
import type { ApiAttraction, Park } from "@/lib/types";
import {
  simulatedWait,
  statusLabel,
  waitColorClasses,
  waitTier,
} from "@/lib/utils";
import { useParkLive } from "./ParkLiveDataProvider";

interface ParkInsightsProps {
  park: Park;
}

/**
 * "Park insights" panel rendered below the full-screen map. Three
 * cards: Longest waits, Temporarily down, Recently updated. All three
 * read from the page-level `<ParkLiveDataProvider>` so the fetch is
 * shared with ParkMap and ParkRecommendations.
 *
 * Mode handling:
 *
 *   - "live" (at least one OPERATING + numeric attraction): real data
 *     drives all three cards as before.
 *   - "estimated" (upstream returned no usable live data, or the
 *     payload is all UNKNOWN/null): "Longest waits" falls back to
 *     `simulatedWait()` over the static RIDES list — same simulation
 *     ParkMap uses for UNKNOWN attractions, so the surfaces stay
 *     visually consistent. "Temporarily down" and "Recently updated"
 *     render honest empty states instead of claiming "Everything is
 *     operating" — we don't actually know that without live data.
 *   - "loading": every card shows "Loading…" — unchanged from before.
 *
 * The "Estimated waits" badge at the top of the section already
 * tells the reader the cards are using simulated values; no per-row
 * marker is needed.
 */
export function ParkInsights({ park }: ParkInsightsProps) {
  const { liveApi: live, status } = useParkLive();

  // Real-live = at least one attraction reporting OPERATING with a
  // numeric wait. Anything else (UNKNOWN/null payloads, empty
  // attractions, `live: true` with junk content) falls through to
  // estimated mode, mirroring WaitsAllParks's classification.
  const hasRealLiveData = useMemo(() => {
    return !!live?.attractions?.some(
      (a) => a.status === "OPERATING" && typeof a.waitMinutes === "number",
    );
  }, [live]);

  // Static rides for this park. Used by the estimated-mode fallback
  // for "Longest waits" so the card always has something useful to
  // show, instead of the misleading "No waits reported yet." that
  // previously rendered in estimated mode.
  const parkRides = useMemo(
    () => RIDES.filter((r) => r.parkId === park.id),
    [park.id],
  );

  // Slugs the partial live payload has explicitly flagged as not
  // running. Excluded from the simulated list so we don't promise
  // estimated waits for a ride that's actually CLOSED / DOWN /
  // REFURBISHMENT today.
  const blockedFromEstimate = useMemo(() => {
    const blocked = new Set<string>();
    for (const a of live?.attractions ?? []) {
      if (
        a.status === "CLOSED" ||
        a.status === "DOWN" ||
        a.status === "REFURBISHMENT"
      ) {
        blocked.add(a.slug);
      }
    }
    return blocked;
  }, [live]);

  const longestWaits = useMemo<ApiAttraction[]>(() => {
    // Initial load: stay empty so <Card> + <EmptyRow> render
    // "Loading…" via the `status` prop. Every other branch must
    // produce content — the estimated fallback runs even when
    // `live` is null (e.g. a failed initial fetch), because the
    // provider's catch path sets status="estimates" while leaving
    // `liveApi = null`.
    if (status === "loading") return [];

    if (live && hasRealLiveData) {
      return [...live.attractions]
        .filter(
          (a) => a.status === "OPERATING" && typeof a.waitMinutes === "number",
        )
        .sort((a, b) => (b.waitMinutes as number) - (a.waitMinutes as number))
        .slice(0, 5);
    }

    // Estimated fallback — runs whenever there's no usable live
    // data, INCLUDING the case where the provider failed to fetch
    // and `live === null`. Synthesizes ApiAttraction-shaped rows
    // from the static RIDES list using `simulatedWait` (same
    // simulation ParkMap uses for UNKNOWN attractions). Excludes
    // rides the partial payload explicitly marked as not running.
    const fallbackTimestamp = live?.lastUpdated ?? new Date().toISOString();
    return parkRides
      .filter((r) => !blockedFromEstimate.has(r.id))
      .map<ApiAttraction>((r) => ({
        id: r.externalId,
        slug: r.id,
        parkSlug: park.id,
        name: r.name,
        status: "OPERATING",
        waitMinutes: simulatedWait(r),
        coordinates: { lat: r.lat, lng: r.lng },
        lastUpdated: fallbackTimestamp,
      }))
      .sort((a, b) => (b.waitMinutes as number) - (a.waitMinutes as number))
      .slice(0, 5);
  }, [live, hasRealLiveData, parkRides, blockedFromEstimate, park.id, status]);

  const downAttractions = useMemo(() => {
    if (!live) return [];
    return live.attractions.filter(
      (a) =>
        a.status === "DOWN" ||
        a.status === "CLOSED" ||
        a.status === "REFURBISHMENT",
    );
  }, [live]);

  const recentlyUpdated = useMemo(() => {
    if (!live) return [];
    return [...live.attractions]
      .filter((a) => a.status === "OPERATING" && typeof a.waitMinutes === "number")
      .sort((a, b) => Date.parse(b.lastUpdated) - Date.parse(a.lastUpdated))
      .slice(0, 5);
  }, [live]);

  return (
    <section className="border-t border-ink-100 bg-white">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-widest text-accent-600">
              Park insights
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              {park.name} at a glance
            </h2>
          </div>
          <StatusBadge status={status} />
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card title="Longest waits" tone="rose" status={status}>
            {longestWaits.length === 0 ? (
              <EmptyRow status={status} fallback="No waits reported yet." />
            ) : (
              <ul className="divide-y divide-ink-100">
                {longestWaits.map((a) => (
                  <RideRow key={a.id} attraction={a} />
                ))}
              </ul>
            )}
          </Card>

          <Card title="Temporarily down" tone="ink" status={status}>
            {downAttractions.length === 0 ? (
              <div className="px-1 py-6 text-center text-sm text-ink-500">
                {status === "loading"
                  ? "Loading…"
                  : hasRealLiveData
                    ? "Everything is operating right now."
                    : "Live ride status unavailable — open the map for details."}
              </div>
            ) : (
              <ul className="divide-y divide-ink-100">
                {downAttractions.map((a) => (
                  <RideRow key={a.id} attraction={a} />
                ))}
              </ul>
            )}
          </Card>

          <Card title="Recently updated" tone="emerald" status={status}>
            {recentlyUpdated.length === 0 ? (
              <EmptyRow
                status={status}
                fallback={
                  hasRealLiveData
                    ? "No updates yet."
                    : "Updates resume when live data is back."
                }
              />
            ) : (
              <ul className="divide-y divide-ink-100">
                {recentlyUpdated.map((a) => (
                  <RideRow key={a.id} attraction={a} showUpdated />
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/parks"
            className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-5 py-3 text-sm font-medium text-ink-800 shadow-soft transition hover:border-ink-300 hover:bg-ink-50"
          >
            See all parks
            <svg
              viewBox="0 0 16 16"
              fill="none"
              className="h-3.5 w-3.5"
              aria-hidden
            >
              <path
                d="M6 3l5 5-5 5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}

function Card({
  title,
  tone,
  status,
  children,
}: {
  title: string;
  tone: "rose" | "emerald" | "ink";
  status: "loading" | "live" | "estimates";
  children: React.ReactNode;
}) {
  const tag =
    tone === "rose"
      ? "bg-rose-50 text-rose-700 ring-rose-200"
      : tone === "emerald"
        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
        : "bg-ink-100 text-ink-700 ring-ink-200";
  return (
    <div className="rounded-3xl border border-ink-100 bg-white p-5 shadow-soft sm:p-6">
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${tag}`}
        >
          {title}
        </span>
        {status === "loading" && (
          <span className="text-[11px] font-medium text-ink-400">Loading…</span>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function RideRow({
  attraction,
  showUpdated = false,
}: {
  attraction: ApiAttraction;
  showUpdated?: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <Link
          href={`/parks/${attraction.parkSlug}`}
          className="block truncate text-sm font-semibold tracking-tight text-ink-900 transition hover:text-accent-600"
          title={attraction.name}
        >
          {attraction.name}
        </Link>
        {showUpdated ? (
          <div className="mt-0.5 text-[11px] font-medium text-ink-500">
            Updated {formatAge(attraction.lastUpdated)}
          </div>
        ) : null}
      </div>
      <Pill attraction={attraction} />
    </li>
  );
}

function Pill({ attraction }: { attraction: ApiAttraction }) {
  if (attraction.status !== "OPERATING") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-semibold text-ink-600 ring-1 ring-ink-200">
        <span className="h-1.5 w-1.5 rounded-full bg-ink-300" />
        {statusLabel(attraction.status)}
      </span>
    );
  }
  if (typeof attraction.waitMinutes !== "number") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-50 px-2.5 py-1 text-[11px] font-semibold text-ink-500 ring-1 ring-ink-200">
        <span className="h-1.5 w-1.5 rounded-full bg-ink-300" />—
      </span>
    );
  }
  const tier = waitTier(attraction.waitMinutes);
  const c = waitColorClasses(tier);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${c.bg} ${c.text} ${c.ring}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {attraction.waitMinutes} min
    </span>
  );
}

function EmptyRow({
  status,
  fallback,
}: {
  status: "loading" | "live" | "estimates";
  fallback: string;
}) {
  return (
    <div className="px-1 py-6 text-center text-sm text-ink-500">
      {status === "loading" ? "Loading…" : fallback}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "loading" | "live" | "estimates";
}) {
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
        title="Live data unavailable — showing estimated waits"
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

function formatAge(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "just now";
  const ageS = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (ageS < 30) return "just now";
  if (ageS < 90) return "1m ago";
  if (ageS < 60 * 60) return `${Math.round(ageS / 60)}m ago`;
  if (ageS < 60 * 60 * 24) return `${Math.round(ageS / 3600)}h ago`;
  return new Date(ts).toLocaleString();
}

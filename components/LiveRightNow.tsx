"use client";

import Link from "next/link";
import { useAllLive, type AggregatedRide } from "@/lib/useAllLive";
import { waitColorClasses, waitTier } from "@/lib/utils";

export function LiveRightNow() {
  const { status, shortestWaits, longestWaits, averageWait, openParkCount } =
    useAllLive();

  const isLive = status === "live";

  return (
    <section className="relative border-t border-ink-100 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <p className="text-sm font-medium uppercase tracking-widest text-accent-600">
              Right now
            </p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
              {averageWait !== null ? (
                <>
                  Avg wait across{" "}
                  <span className="bg-gradient-to-br from-accent-600 to-sky-500 bg-clip-text text-transparent">
                    {openParkCount} parks
                  </span>{" "}
                  is{" "}
                  <span className="bg-gradient-to-br from-accent-600 to-sky-500 bg-clip-text text-transparent">
                    {averageWait} min
                  </span>
                  .
                </>
              ) : status === "loading" ? (
                "Checking the parks…"
              ) : (
                "Live data is catching up."
              )}
            </h2>
            <p className="mt-4 text-base text-ink-600 sm:text-lg">
              Pulled live from Parkio's API a moment ago. Refreshes every
              minute.
            </p>
          </div>

          <LiveBadge status={status} />
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Column
            label="Shortest waits"
            tone="emerald"
            rides={shortestWaits}
            empty={status === "loading" ? "Loading…" : "Nothing reporting yet."}
          />
          <Column
            label="Longest waits"
            tone="rose"
            rides={longestWaits}
            empty={status === "loading" ? "Loading…" : "Nothing reporting yet."}
          />
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/parks"
            className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-5 py-3 text-sm font-medium text-ink-800 shadow-soft transition hover:border-ink-300 hover:bg-ink-50"
          >
            Open a park map
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

function Column({
  label,
  tone,
  rides,
  empty,
}: {
  label: string;
  tone: "emerald" | "rose";
  rides: AggregatedRide[];
  empty: string;
}) {
  const headerTone =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : "bg-rose-50 text-rose-700 ring-rose-200";

  return (
    <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-soft sm:p-8">
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${headerTone}`}
        >
          {label}
        </span>
      </div>

      <ul className="mt-5 divide-y divide-ink-100">
        {rides.length === 0 ? (
          <li className="py-4 text-sm text-ink-500">{empty}</li>
        ) : (
          rides.map(({ attraction, parkName }) => (
            <RideRow
              key={attraction.id}
              name={attraction.name}
              park={parkName}
              wait={attraction.waitMinutes ?? 0}
            />
          ))
        )}
      </ul>
    </div>
  );
}

function RideRow({
  name,
  park,
  wait,
}: {
  name: string;
  park: string;
  wait: number;
}) {
  const tier = waitTier(wait);
  const c = waitColorClasses(tier);

  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold tracking-tight text-ink-900">
          {name}
        </div>
        <div className="truncate text-[11px] font-medium uppercase tracking-widest text-ink-500">
          {park}
        </div>
      </div>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${c.bg} ${c.text} ${c.ring}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
        {wait} min
      </span>
    </li>
  );
}

function LiveBadge({ status }: { status: "loading" | "live" | "estimates" }) {
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
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-3 py-1.5 text-[11px] font-medium text-ink-600 ring-1 ring-ink-200">
        <span className="h-1.5 w-1.5 rounded-full bg-ink-400" />
        Estimates only
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

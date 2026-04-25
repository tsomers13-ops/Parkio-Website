"use client";

import Link from "next/link";
import { useAllLive } from "@/lib/useAllLive";
import type { ApiAttraction, ApiPark } from "@/lib/types";
import { statusLabel, waitColorClasses, waitTier } from "@/lib/utils";

export function WaitsAllParks() {
  const { status, parks, liveByPark } = useAllLive();

  if (status === "loading" && parks.length === 0) {
    return (
      <section className="border-t border-ink-100 bg-white py-16">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="rounded-3xl border border-ink-100 bg-white p-12 text-center text-ink-500 shadow-soft">
            Loading live wait times…
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="border-t border-ink-100 bg-white">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {parks.map((park) => (
            <ParkBlock
              key={park.slug}
              park={park}
              attractions={liveByPark.get(park.slug)?.attractions ?? []}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function ParkBlock({
  park,
  attractions,
}: {
  park: ApiPark;
  attractions: ApiAttraction[];
}) {
  const operating = attractions.filter(
    (a) => a.status === "OPERATING" && typeof a.waitMinutes === "number",
  );
  const top = [...operating]
    .sort((a, b) => (b.waitMinutes as number) - (a.waitMinutes as number))
    .slice(0, 6);

  return (
    <article className="rounded-3xl border border-ink-100 bg-white p-6 shadow-soft sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/parks/${park.slug}`}
            className="block text-2xl font-semibold tracking-tight text-ink-900 transition hover:text-accent-600"
          >
            {park.name}
          </Link>
          <div className="mt-1 text-[12px] font-medium uppercase tracking-widest text-ink-500">
            {operating.length} of {attractions.length} operating
          </div>
        </div>
        <ParkStatusPill status={park.status} />
      </header>

      <ul className="mt-5 divide-y divide-ink-100">
        {top.length === 0 ? (
          <li className="py-6 text-center text-sm text-ink-500">
            No live waits reported yet today.
          </li>
        ) : (
          top.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-4 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold tracking-tight text-ink-900">
                  {a.name}
                </div>
              </div>
              <WaitPill minutes={a.waitMinutes as number} />
            </li>
          ))
        )}
      </ul>

      <div className="mt-5 flex items-center justify-end">
        <Link
          href={`/parks/${park.slug}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-900 transition hover:text-accent-600"
        >
          Open park map
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
    </article>
  );
}

function WaitPill({ minutes }: { minutes: number }) {
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

function ParkStatusPill({ status }: { status: ApiPark["status"] }) {
  if (status === "OPEN") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Open
      </span>
    );
  }
  if (status === "CLOSED") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        Closed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-semibold text-ink-600 ring-1 ring-ink-200">
      <span className="h-1.5 w-1.5 rounded-full bg-ink-300" />
      {statusLabel("UNKNOWN")}
    </span>
  );
}

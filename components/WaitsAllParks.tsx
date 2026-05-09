"use client";

import { useMemo } from "react";
import Link from "next/link";
import { RIDES } from "@/lib/data";
import { useAllLive } from "@/lib/useAllLive";
import type {
  ApiAttraction,
  ApiAttractionStatus,
  ApiPark,
  ApiParkLive,
} from "@/lib/types";
import type { Ride } from "@/lib/types";
import { simulatedWait, waitColorClasses, waitTier } from "@/lib/utils";

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
              live={liveByPark.get(park.slug) ?? null}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Per-park card with one of three display modes:
 *
 *   - "live"      — at least one attraction has status === "OPERATING"
 *                   AND a numeric waitMinutes. Shows the top-6 real
 *                   operating waits.
 *   - "estimated" — no real live data. Falls back to deterministic
 *                   `simulatedWait()` over the static RIDES list (the
 *                   same simulation `ParkMap` uses for UNKNOWN status
 *                   attractions), so the cards stay visually aligned
 *                   with what the map shows. Renders the top-6
 *                   simulated waits + an "Estimated" pill in the
 *                   header so we don't pretend the values are live.
 *   - "closed"    — park is CLOSED today. Never advertise estimated
 *                   waits for closed parks.
 *
 * The ONLY signal we trust to flip into "live" mode is the presence
 * of at least one OPERATING + numeric-wait attraction. `live.live`
 * alone is unreliable — upstream sometimes ships a payload flagged
 * live with all UNKNOWN content.
 */
type CardMode = "live" | "estimated" | "closed";

/**
 * A row in the wait list — works for both live and simulated rows.
 * `id` is React's key; `waitMinutes` is always a number; `isLive`
 * lets the row render differently if we ever want to (today both
 * paths render the same wait pill, the visual cue lives in the
 * card-level "Estimated" pill).
 */
interface WaitRow {
  id: string;
  name: string;
  waitMinutes: number;
  isLive: boolean;
}

function ParkBlock({
  park,
  live,
}: {
  park: ApiPark;
  live: ApiParkLive | null;
}) {
  const attractions: ApiAttraction[] = live?.attractions ?? [];

  // Real operating attractions with numeric waits — drives live mode.
  const operating = useMemo(
    () =>
      attractions.filter(
        (a) => a.status === "OPERATING" && typeof a.waitMinutes === "number",
      ),
    [attractions],
  );

  const hasRealLiveData = operating.length > 0;

  // The set of static RIDES the page knows about for this park.
  // Used to size the "X attractions tracked" header in estimated mode
  // and to drive the simulated wait list.
  const parkRides = useMemo<Ride[]>(
    () => RIDES.filter((r) => r.parkId === park.slug),
    [park.slug],
  );

  // Slugs the partial live payload has explicitly flagged as not
  // running. We exclude those from the simulated list so we don't
  // promise estimated waits for a ride that's actually CLOSED / DOWN
  // / REFURBISHMENT today.
  const blockedFromEstimate = useMemo<Set<string>>(() => {
    const blocked = new Set<string>();
    const blockedStatuses: ApiAttractionStatus[] = [
      "CLOSED",
      "DOWN",
      "REFURBISHMENT",
    ];
    for (const a of attractions) {
      if (blockedStatuses.includes(a.status)) blocked.add(a.slug);
    }
    return blocked;
  }, [attractions]);

  const mode: CardMode =
    park.status === "CLOSED"
      ? "closed"
      : hasRealLiveData
        ? "live"
        : "estimated";

  // Build the rows we'll render in the body. Live mode pulls from
  // real OPERATING attractions; estimated mode pulls from the static
  // RIDES list using `simulatedWait` — the same simulation ParkMap
  // uses for UNKNOWN-status attractions, so the two surfaces tell
  // the same visual story.
  const rows = useMemo<WaitRow[]>(() => {
    if (mode === "closed") return [];
    if (mode === "live") {
      return [...operating]
        .sort(
          (a, b) => (b.waitMinutes as number) - (a.waitMinutes as number),
        )
        .slice(0, 6)
        .map((a) => ({
          id: a.id,
          name: a.name,
          waitMinutes: a.waitMinutes as number,
          isLive: true,
        }));
    }
    // estimated
    return parkRides
      .filter((r) => !blockedFromEstimate.has(r.id))
      .map((r) => ({
        id: r.id,
        name: r.name,
        waitMinutes: simulatedWait(r),
        isLive: false,
      }))
      .sort((a, b) => b.waitMinutes - a.waitMinutes)
      .slice(0, 6);
  }, [mode, operating, parkRides, blockedFromEstimate]);

  // Header sub-line, just under the park name.
  const headerSub =
    mode === "closed"
      ? "Park is closed today"
      : mode === "live"
        ? `${operating.length} of ${attractions.length} operating`
        : parkRides.length > 0
          ? `${parkRides.length} attractions tracked`
          : "Not available";

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
            {headerSub}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ParkStatusPill status={park.status} />
          {mode === "estimated" && parkRides.length > 0 && <EstimatedPill />}
        </div>
      </header>

      {mode === "closed" ? (
        <p className="mt-5 rounded-2xl bg-ink-50/60 px-4 py-4 text-center text-sm text-ink-600">
          Closed today — check the park page for hours.
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-ink-50/60 px-4 py-4 text-center text-sm text-ink-600">
          Not available.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-ink-100">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-4 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold tracking-tight text-ink-900">
                  {row.name}
                </div>
              </div>
              <WaitPill minutes={row.waitMinutes} />
            </li>
          ))}
        </ul>
      )}

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

/**
 * Small "Estimated" pill shown next to the park status pill when the
 * card is rendering simulated waits. The card never pretends the
 * numbers are live — this pill is the transparency cue.
 */
function EstimatedPill() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-semibold text-ink-600 ring-1 ring-ink-200"
      title="Live waits unavailable — showing simulated values from each ride's typical wait"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-ink-400" />
      Estimated
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
  // UNKNOWN — we don't have park hours data. Don't say "Closed" — that
  // would mislead the guest. Be explicit instead.
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-semibold text-ink-600 ring-1 ring-ink-200"
      title="Park hours unavailable from the live data source"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-ink-300" />
      Hours unavailable
    </span>
  );
}

"use client";

import Link from "next/link";
import { RIDES } from "@/lib/data";
import { useAllLive } from "@/lib/useAllLive";
import type { ApiAttraction, ApiPark, ApiParkLive } from "@/lib/types";
import { waitColorClasses, waitTier } from "@/lib/utils";

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
 *                   AND a numeric waitMinutes. This is the ONLY signal
 *                   we trust for "live" — `live.live === true` alone
 *                   isn't enough, because upstream sometimes ships a
 *                   "live" payload whose attractions are entirely
 *                   UNKNOWN / null. Shows the top-6 waits list.
 *   - "estimated" — no real live data (everything is UNKNOWN or null,
 *                   or `live` itself is null/false). Shows
 *                   "X attractions tracked" + "Estimated waits available"
 *                   + a small "Estimated" pill so the card looks usable
 *                   instead of empty. This is the fallback for any
 *                   junk-live-data case.
 *   - "closed"    — park is CLOSED today. We never advertise estimated
 *                   waits for closed parks; show closed-state copy and
 *                   suppress the Estimated pill.
 *
 * Note: an explicit "preopen" mode (live.live === true but nothing yet
 * operating) was considered but dropped — it can't be distinguished
 * from a junk-data response by shape alone, and rendering "0 of N
 * operating" / "No live waits reported yet today" in that ambiguous
 * case is the exact bug we're fixing. Treating both as `estimated` is
 * the safer default per the conversion brief.
 */
type CardMode = "live" | "estimated" | "closed";

function ParkBlock({
  park,
  live,
}: {
  park: ApiPark;
  live: ApiParkLive | null;
}) {
  const attractions: ApiAttraction[] = live?.attractions ?? [];
  const operating = attractions.filter(
    (a) => a.status === "OPERATING" && typeof a.waitMinutes === "number",
  );
  const top = [...operating]
    .sort((a, b) => (b.waitMinutes as number) - (a.waitMinutes as number))
    .slice(0, 6);

  // The ONLY signal we trust for live data: at least one operating
  // attraction with a numeric wait. `live?.live === true` alone is
  // unreliable — upstream sometimes flags a payload as live while
  // every attraction is UNKNOWN / null.
  const hasRealLiveData = attractions.some(
    (a) => a.status === "OPERATING" && typeof a.waitMinutes === "number",
  );

  // Static fallback — how many attractions Parkio tracks for this park,
  // independent of any live response. Used to size the "X attractions
  // tracked" line in estimated mode.
  const trackedCount = RIDES.filter((r) => r.parkId === park.slug).length;

  const mode: CardMode =
    park.status === "CLOSED"
      ? "closed"
      : hasRealLiveData
        ? "live"
        : "estimated";

  // Header sub-line, just under the park name.
  const headerSub =
    mode === "closed"
      ? "Park is closed today"
      : mode === "live"
        ? `${operating.length} of ${attractions.length} operating`
        : trackedCount > 0
          ? `${trackedCount} attractions tracked`
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
          {mode === "estimated" && trackedCount > 0 && <EstimatedPill />}
        </div>
      </header>

      {mode === "live" ? (
        <ul className="mt-5 divide-y divide-ink-100">
          {top.map((a) => (
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
          ))}
        </ul>
      ) : (
        <p className="mt-5 rounded-2xl bg-ink-50/60 px-4 py-4 text-center text-sm text-ink-600">
          {mode === "closed"
            ? "Closed today — check the park page for hours."
            : trackedCount > 0
              ? "Estimated waits available — open the park map for individual times."
              : "Not available."}
        </p>
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
 * card is rendering an estimated-wait summary. Visually quiet so it
 * doesn't compete with the live status indicator.
 */
function EstimatedPill() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-semibold text-ink-600 ring-1 ring-ink-200"
      title="Live waits unavailable — showing an estimated summary"
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

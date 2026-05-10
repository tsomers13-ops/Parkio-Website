"use client";

import { useEffect, useMemo, useState } from "react";
import type { ApiEvent, Park } from "@/lib/types";
import { useParkLive } from "./ParkLiveDataProvider";

interface ParkHappeningSoonProps {
  park: Park;
}

/* ──────────────────── Tunables ──────────────────── */

/**
 * Rolling window: how far in the future an event must start to qualify
 * as "happening soon". 90 minutes captures the realistic planning
 * horizon (a guest can finish a ride and still walk over) without
 * cluttering the section with stuff hours away.
 */
const SOON_WINDOW_MIN = 90;

/** Max items rendered. Spec: 3–5 items. */
const MAX_ITEMS = 5;

/* ──────────────────── Helpers ──────────────────── */

/**
 * Find the single soonest start time for an event that falls inside
 * the "soon" window. Events past their last showtime, or whose next
 * showtime is more than SOON_WINDOW_MIN away, return null.
 */
function nextSoonStart(event: ApiEvent, now: number): number | null {
  for (const iso of event.showtimes) {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) continue;
    if (t < now) continue;
    if (t - now > SOON_WINDOW_MIN * 60_000) return null;
    return t;
  }
  return null;
}

function relativeMinutes(startTs: number, now: number): string {
  const minutes = Math.round((startTs - now) / 60_000);
  if (minutes <= 0) return "Starting now";
  if (minutes === 1) return "Starts in 1 min";
  return `Starts in ${minutes} min`;
}

function formatStart(startTs: number, timezone: string | undefined): string {
  try {
    return new Date(startTs)
      .toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        timeZone: timezone,
      })
      .replace(":00", "");
  } catch {
    return new Date(startTs).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }
}

/* ──────────────────── Component ──────────────────── */

/**
 * "Happening soon" — surfaces shows, parades, fireworks, and
 * character meet-and-greets starting in the next 90 minutes. Keeps
 * a parent from missing a 3:15 PM Cinderella appearance because
 * they were watching wait times.
 *
 * Reads the same shared live data the map and Parkio Picks already
 * use — no new fetch. Re-derives once per minute via a local clock
 * so "Starts in 23 min" stays accurate without forcing a poll.
 */
export function ParkHappeningSoon({ park }: ParkHappeningSoonProps) {
  const { liveApi: live, parkApi, status } = useParkLive();

  // Local "now" tick — refreshes every 60s so relative times stay
  // current between the upstream's 2-min polls. Uses requestIdle when
  // available to keep the work off the critical render path.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const upcoming = useMemo(() => {
    if (!live) return [];
    const items: Array<{ event: ApiEvent; startTs: number }> = [];
    for (const event of live.events ?? []) {
      const t = nextSoonStart(event, now);
      if (t == null) continue;
      items.push({ event, startTs: t });
    }
    items.sort((a, b) => a.startTs - b.startTs);
    return items.slice(0, MAX_ITEMS);
  }, [live, now]);

  const tz = parkApi?.timezone;
  // Skeleton is reserved for the TRUE initial-fetch state. When the
  // provider's catch path leaves `live` at null with status
  // "estimates", we fall through to the unavailable state below
  // rather than staying on a skeleton forever.
  const isLoading = status === "loading";

  return (
    <section
      className="border-y border-ink-100 bg-white"
      aria-label="Happening soon"
    >
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-500">
              Happening soon
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
              Don't miss the next show
            </h2>
            <p className="mt-1.5 text-sm text-ink-600">
              Shows, parades, and character meets starting in the next
              90 minutes at {park.name}.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-ink-100 bg-ink-50/40 p-2 sm:p-3">
          {isLoading ? (
            <LoadingState />
          ) : !live ? (
            // Failed-fetch case: provider's catch path left `live` at
            // null. Be honest instead of pretending nothing is on.
            <UnavailableState />
          ) : upcoming.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="divide-y divide-ink-100/70">
              {upcoming.map(({ event, startTs }) => (
                <li
                  key={event.id}
                  className="flex items-center gap-3 px-3 py-3 sm:px-4"
                >
                  <EventIcon type={event.type} />
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate text-sm font-semibold tracking-tight text-ink-900"
                      title={event.name}
                    >
                      {event.name}
                    </div>
                    <div className="mt-0.5 text-[12px] text-ink-500">
                      {relativeMinutes(startTs, now)} ·{" "}
                      <span className="tabular-nums">
                        {formatStart(startTs, tz)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────── Sub-views ──────────────────── */

function EventIcon({ type }: { type: ApiEvent["type"] }) {
  // Crown emoji for character meets, theatre masks for shows.
  // Wrapped in a small circular badge so the row reads like a list
  // with a leading affordance, not raw emoji floating in space.
  const tone =
    type === "meet"
      ? "bg-rose-50 text-rose-600 ring-rose-100"
      : "bg-accent-50 text-accent-700 ring-accent-100";
  return (
    <span
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ring-1 ${tone}`}
      aria-hidden
    >
      {type === "meet" ? "👑" : "🎭"}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="space-y-2 px-3 py-3 sm:px-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-ink-100" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3.5 w-3/4 animate-pulse rounded bg-ink-100" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-ink-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-4 py-8 text-center text-sm text-ink-500 sm:py-10">
      No shows or meet &amp; greets starting soon.
    </div>
  );
}

/**
 * Shown when the provider couldn't load live data for this park
 * (e.g. failed initial fetch, upstream outage). Honest about the
 * gap instead of pretending nothing is on.
 */
function UnavailableState() {
  return (
    <div className="px-4 py-8 text-center text-sm text-ink-500 sm:py-10">
      Live event data unavailable right now — open the park map for
      what's running.
    </div>
  );
}

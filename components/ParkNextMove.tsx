"use client";

import { useMemo } from "react";
import { RIDES } from "@/lib/data";
import {
  LOW_WAIT_THRESHOLD_MIN,
  isTopRide,
  partitionAttractions,
} from "@/lib/popularity";
import type { ApiAttraction, Park } from "@/lib/types";
import { simulatedWait, waitColorClasses, waitTier } from "@/lib/utils";
import { useMapFocus } from "./MapFocusProvider";
import { useParkLive } from "./ParkLiveDataProvider";

interface ParkNextMoveProps {
  park: Park;
}

/**
 * "Your next move" — the One-tap Strategy layer.
 *
 * Renders ABOVE Parkio Picks. Picks one ride and stakes a clear
 * recommendation behind it: a name, a wait, the right badges, a
 * one-line reason, and a single primary CTA ("Take me there") that
 * scrolls the page to the map, flies the map to the ride, and opens
 * its detail sheet — all via the existing MapFocusProvider contract
 * the rest of the surfaces already use.
 *
 * Below the primary recommendation, an "After that" mini-list of
 * 2–3 follow-up picks gives the guest a plan beyond the next move,
 * with each row tappable in the same way.
 *
 * The pick is computed via a 3-tier fallback chain identical to the
 * one in Parkio Picks / Park Insights:
 *
 *   Tier 1 — partitionAttractions(park.id, live.attractions).bestNow
 *            (curated headliners, walk-on gems, tiered wait scoring)
 *   Tier 2 — lowest-wait OPERATING + numeric attractions from live
 *            (real data, just not categorized — useful when nothing
 *            fits the curated tiers)
 *   Tier 3 — synthesized from static RIDES + simulatedWait, headliners
 *            first then by simulated wait ascending (used when live
 *            is null or all-UNKNOWN — failed fetch, pre-opening, etc.)
 *
 * The card always renders with a real recommendation unless the park
 * is genuinely CLOSED today; in that case the section returns null
 * (per the conversion brief: never render an empty state, but skip
 * the section when the park itself is closed).
 *
 * No new fetch, no Picks-logic change. The component is purely a
 * decision surface on top of existing data flows.
 */
export function ParkNextMove({ park }: ParkNextMoveProps) {
  const { liveApi: live, parkApi, status } = useParkLive();
  const { focusRide } = useMapFocus();

  // Real-live = at least one OPERATING + numeric attraction. Same
  // predicate every other surface uses; `isEstimated = !hasRealLiveData`.
  const hasRealLiveData = useMemo(
    () =>
      !!live?.attractions?.some(
        (a) => a.status === "OPERATING" && typeof a.waitMinutes === "number",
      ),
    [live],
  );
  const isEstimated = !hasRealLiveData;

  /**
   * Plan = { top, afterThat[] } via the 3-tier fallback chain.
   *
   * `top` is the One-tap recommendation; `afterThat` is the next 2–3
   * follow-up picks. Both are drawn from the same source so the plan
   * stays internally consistent.
   */
  const plan = useMemo<{ top: ApiAttraction | null; afterThat: ApiAttraction[] }>(() => {
    // ─── Tier 1: ideal picks from partitionAttractions ───
    if (live && hasRealLiveData) {
      const { bestNow, goodOptions } = partitionAttractions(
        park.id,
        live.attractions,
      );
      if (bestNow.length > 0) {
        const top = bestNow[0];
        // After-that: rest of bestNow, then goodOptions overflow,
        // deduped by slug. Cap at 3 — this is a quick plan, not a
        // full ride list.
        const seen = new Set<string>([top.slug]);
        const afterThat: ApiAttraction[] = [];
        for (const a of [...bestNow.slice(1), ...goodOptions]) {
          if (!seen.has(a.slug)) {
            seen.add(a.slug);
            afterThat.push(a);
            if (afterThat.length >= 3) break;
          }
        }
        return { top, afterThat };
      }
    }

    // ─── Tier 2: lowest-wait operating from live data ───
    if (live) {
      const operating = live.attractions
        .filter(
          (a) => a.status === "OPERATING" && typeof a.waitMinutes === "number",
        )
        .sort(
          (a, b) => (a.waitMinutes as number) - (b.waitMinutes as number),
        );
      if (operating.length > 0) {
        return {
          top: operating[0],
          afterThat: operating.slice(1, 4),
        };
      }
    }

    // ─── Tier 3: synthesized from static RIDES + simulatedWait ───
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
    const fallbackTimestamp = live?.lastUpdated ?? new Date().toISOString();
    const synthesized: ApiAttraction[] = RIDES.filter(
      (r) => r.parkId === park.id && !blocked.has(r.id),
    ).map((r) => ({
      id: r.externalId,
      slug: r.id,
      parkSlug: park.id,
      name: r.name,
      status: "OPERATING",
      waitMinutes: simulatedWait(r),
      coordinates: { lat: r.lat, lng: r.lng },
      lastUpdated: fallbackTimestamp,
    }));
    // Headliners first (so the One-tap recommendation surfaces a top
    // ride when nothing else differentiates picks), then by simulated
    // wait ascending so a guest can grab a quick win.
    synthesized.sort((a, b) => {
      const ah = isTopRide(park.id, a.slug) ? 1 : 0;
      const bh = isTopRide(park.id, b.slug) ? 1 : 0;
      if (ah !== bh) return bh - ah;
      return (a.waitMinutes as number) - (b.waitMinutes as number);
    });
    if (synthesized.length === 0) return { top: null, afterThat: [] };
    return {
      top: synthesized[0],
      afterThat: synthesized.slice(1, 4),
    };
  }, [live, hasRealLiveData, park.id]);

  // Park genuinely closed → hide the section. Per the conversion brief:
  // "Always provide a best available move unless the park is closed."
  if (parkApi?.status === "CLOSED") return null;

  // Initial fetch hasn't returned yet → render a brief skeleton so the
  // section doesn't pop in. The fallback chain produces content even
  // when `live === null`, but during the first render `parkApi` may
  // also be null and we'd rather wait a beat than commit to a pick.
  if (status === "loading" && !live) {
    return <Skeleton />;
  }

  if (!plan.top) {
    // Defensive — `synthesized.length === 0` (park has no static rides
    // OR every ride is blocked). Skip the section quietly.
    return null;
  }

  function handleTakeMeThere(slug: string) {
    focusRide(slug);
    if (typeof document !== "undefined") {
      const map = document.getElementById("park-map");
      if (map) map.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const top = plan.top;
  const popular = isTopRide(park.id, top.slug);
  const wait = top.waitMinutes;
  const lowWait = typeof wait === "number" && wait <= LOW_WAIT_THRESHOLD_MIN;
  const reason = pickReason({ popular, lowWait, wait });

  return (
    <section
      className="border-y border-ink-100 bg-gradient-to-b from-white via-accent-50/30 to-white"
      aria-label="Your next move"
    >
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-2xl">
            <Eyebrow estimated={isEstimated} />
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              Your next move
            </h2>
            <p className="mt-1.5 text-sm text-ink-600 sm:text-base">
              One pick, one tap. Below: a quick plan for after.
            </p>
          </div>
          {isEstimated && <EstimatedBadge />}
        </div>

        {/* Primary recommendation */}
        <article
          className={`mt-6 overflow-hidden rounded-3xl border p-6 shadow-lift sm:p-7 ${
            isEstimated
              ? "border-ink-100 bg-gradient-to-br from-ink-50/60 via-white to-ink-50/40"
              : "border-ink-100 bg-gradient-to-br from-accent-50 via-white to-emerald-50/40"
          }`}
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
            <div className="min-w-0 flex-1">
              <h3
                className="truncate text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl"
                title={top.name}
              >
                {top.name}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {popular && (
                  <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-700 ring-1 ring-accent-100">
                    Headliner
                  </span>
                )}
                {lowWait && (
                  <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                    Low wait
                  </span>
                )}
                {isEstimated && (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600 ring-1 ring-ink-200"
                    title="Live waits unavailable — wait time predicted from this ride's typical wait"
                  >
                    <span className="h-1 w-1 rounded-full bg-ink-400" />
                    Estimated
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm text-ink-700 sm:text-base">
                {reason}.
              </p>
            </div>
            <BigWaitPill minutes={wait} estimated={isEstimated} />
          </div>

          <div className="mt-5">
            <button
              type="button"
              onClick={() => handleTakeMeThere(top.slug)}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-base font-semibold text-white shadow-lift transition hover:bg-ink-800 active:scale-[0.99] sm:w-auto sm:px-6"
              aria-label={`Take me to ${top.name}`}
            >
              Take me there
              <svg
                viewBox="0 0 16 16"
                fill="none"
                className="h-4 w-4 transition group-hover:translate-x-0.5"
                aria-hidden
              >
                <path
                  d="M6 3l5 5-5 5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </article>

        {/* After that — mini ranked plan */}
        {plan.afterThat.length > 0 && (
          <div className="mt-6">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-500">
              After that
            </p>
            <ul className="mt-2 divide-y divide-ink-100 rounded-2xl border border-ink-100 bg-white shadow-soft">
              {plan.afterThat.map((a, i) => {
                const aPopular = isTopRide(park.id, a.slug);
                const aLow =
                  typeof a.waitMinutes === "number" &&
                  a.waitMinutes <= LOW_WAIT_THRESHOLD_MIN;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => handleTakeMeThere(a.slug)}
                      className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-ink-50 active:scale-[0.99]"
                      aria-label={`Take me to ${a.name}`}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[11px] font-semibold tabular-nums text-ink-600">
                          {i + 1}
                        </span>
                        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                          <span
                            className="min-w-0 truncate text-sm font-semibold tracking-tight text-ink-900"
                            title={a.name}
                          >
                            {a.name}
                          </span>
                          {aPopular && (
                            <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-accent-50 px-1.5 py-0.5 text-[10px] font-semibold text-accent-700 ring-1 ring-accent-100">
                              Headliner
                            </span>
                          )}
                          {aLow && (
                            <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                              Low wait
                            </span>
                          )}
                        </div>
                      </div>
                      <SmallWaitPill
                        minutes={a.waitMinutes}
                        estimated={isEstimated}
                      />
                      <svg
                        viewBox="0 0 16 16"
                        fill="none"
                        className="h-4 w-4 shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-ink-500"
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
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

/* ─────────────────────────── Reason copy ─────────────────────────── */

/**
 * Pick the one-line reason behind the recommendation. Matches the
 * exact phrasings the brief calls out, with light variations for
 * specific situations (low-wait headliner gets a sharper line than a
 * generic "best value" pick).
 */
function pickReason({
  popular,
  lowWait,
  wait,
}: {
  popular: boolean;
  lowWait: boolean;
  wait: number | null;
}): string {
  if (popular && lowWait) return "Short wait for a top ride";
  if (popular) return "Top ride right now";
  if (lowWait) return "Hidden gem — barely any wait";
  if (typeof wait === "number" && wait <= 25) return "Quick win — low wait";
  return "Best value right now";
}

/* ─────────────────────────── Chrome ─────────────────────────── */

function Eyebrow({ estimated }: { estimated: boolean }) {
  if (estimated) {
    return (
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-ink-300" />
        <span className="text-[11px] font-semibold uppercase tracking-widest text-ink-500">
          Your next move
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-500" />
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-widest text-accent-700">
        Your next move · live
      </span>
    </div>
  );
}

function EstimatedBadge() {
  return (
    <span
      className="inline-flex items-start gap-2 rounded-2xl bg-ink-100 px-3 py-2 text-left ring-1 ring-ink-200"
      title="Live data unavailable — pick is based on this ride's typical wait at this park"
    >
      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-ink-400" />
      <span className="flex flex-col leading-tight">
        <span className="text-[11px] font-semibold text-ink-700">
          Estimated waits
        </span>
        <span className="text-[10px] font-medium text-ink-500">
          Predicted from park patterns
        </span>
      </span>
    </span>
  );
}

function BigWaitPill({
  minutes,
  estimated,
}: {
  minutes: number | null;
  estimated: boolean;
}) {
  if (typeof minutes !== "number") {
    return (
      <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-ink-100 px-3.5 py-2 text-base font-semibold tabular-nums text-ink-500 ring-1 ring-ink-200">
        <span className="h-2 w-2 rounded-full bg-ink-300" />—
      </span>
    );
  }
  if (estimated) {
    return (
      <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-ink-100 px-3.5 py-2 text-base font-semibold tabular-nums text-ink-700 ring-1 ring-ink-200">
        <span className="h-2 w-2 rounded-full bg-ink-400" />
        {minutes} min
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
          est.
        </span>
      </span>
    );
  }
  const c = waitColorClasses(waitTier(minutes));
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-base font-semibold tabular-nums ring-1 ${c.bg} ${c.text} ${c.ring}`}
    >
      <span className={`h-2 w-2 rounded-full ${c.dot}`} />
      {minutes} min
    </span>
  );
}

function SmallWaitPill({
  minutes,
  estimated,
}: {
  minutes: number | null;
  estimated: boolean;
}) {
  if (typeof minutes !== "number") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-ink-500 ring-1 ring-ink-200">
        <span className="h-1.5 w-1.5 rounded-full bg-ink-300" />—
      </span>
    );
  }
  if (estimated) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-ink-700 ring-1 ring-ink-200">
        <span className="h-1.5 w-1.5 rounded-full bg-ink-400" />
        {minutes} min
      </span>
    );
  }
  const c = waitColorClasses(waitTier(minutes));
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ring-1 ${c.bg} ${c.text} ${c.ring}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {minutes} min
    </span>
  );
}

function Skeleton() {
  return (
    <section className="border-y border-ink-100 bg-gradient-to-b from-white via-accent-50/30 to-white">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="h-3 w-32 animate-pulse rounded-full bg-ink-100" />
        <div className="mt-3 h-8 w-2/3 animate-pulse rounded-md bg-ink-100" />
        <div className="mt-6 h-40 w-full animate-pulse rounded-3xl bg-ink-100" />
      </div>
    </section>
  );
}

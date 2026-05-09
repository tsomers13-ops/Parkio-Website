"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { RIDES } from "@/lib/data";
import { fetchParkLive } from "@/lib/parkioClient";
import { useAllLive } from "@/lib/useAllLive";
import type { ApiAttraction, ApiPark, ApiParkLive } from "@/lib/types";
import { waitColorClasses, waitTier } from "@/lib/utils";

/**
 * Shared "real live data" predicate. The single source of truth for
 * deciding whether a park has actually-usable live waits, used in
 * three places:
 *   - `ParkBlock` mode classifier
 *   - the backup-fetch effect (decides which parks need a re-pull)
 *   - the diagnostic logger
 *
 * Real live = at least one attraction with status === "OPERATING" AND
 * a numeric `waitMinutes`. Anything else (UNKNOWN/null entries, an
 * empty attractions array, or `live: true` with junk content) does
 * NOT count as real live data, regardless of the `live.live` flag.
 */
function hasRealLive(live: ApiParkLive | null | undefined): boolean {
  return !!live?.attractions.some(
    (a) => a.status === "OPERATING" && typeof a.waitMinutes === "number",
  );
}

function operatingNumericCount(
  live: ApiParkLive | null | undefined,
): number {
  return (live?.attractions ?? []).filter(
    (a) => a.status === "OPERATING" && typeof a.waitMinutes === "number",
  ).length;
}

/* ────────────────────────────────────────────────────────────────
 *
 * TEMPORARY DIAGNOSTICS — remove this block once the WaitsAllParks
 * vs. ParkMap data-source discrepancy is root-caused.
 *
 * What it logs (per park, per render and per backup-fetch event):
 *
 *   [WaitsAllParks] mk render
 *     park.id, park.status, endpoint
 *     liveByPark has entry?  shared.live, shared.attractions.length,
 *       shared OPERATING+numeric count, sample attraction (if any)
 *     backup attempted?  in-flight?  committed?
 *     backup.live, backup.attractions.length, backup OP+numeric count
 *     final selected mode (live | estimated | closed)
 *
 *   [WaitsAllParks] mk backup fetch START  → URL
 *   [WaitsAllParks] mk backup fetch RESOLVED  → counts + sample
 *   [WaitsAllParks] mk backup fetch FAILED  → error message
 *
 * To inspect: open DevTools → Console; filter by `[WaitsAllParks]`.
 * Network tab will also show the `/api/parks/{slug}/live` calls
 * with status, headers, and JSON body — copy those for any park
 * that misbehaves.
 *
 * ──────────────────────────────────────────────────────────────── */

const DEBUG_TAG = "[WaitsAllParks]";

function dbgRender(
  park: ApiPark,
  shared: ApiParkLive | null,
  backup: ApiParkLive | null,
  backupAttempted: boolean,
  inFlight: boolean,
  mode: string,
) {
  if (typeof window === "undefined") return;
  const sharedAttrs = shared?.attractions ?? [];
  const backupAttrs = backup?.attractions ?? [];
  const sample = [...sharedAttrs, ...backupAttrs].find(
    (a) => a.status === "OPERATING" && typeof a.waitMinutes === "number",
  );
  // eslint-disable-next-line no-console
  console.groupCollapsed(`${DEBUG_TAG} ${park.slug} render → mode=${mode}`);
  // eslint-disable-next-line no-console
  console.log("park.id          :", park.slug);
  // eslint-disable-next-line no-console
  console.log("park.status      :", park.status);
  // eslint-disable-next-line no-console
  console.log(
    "endpoint         :",
    `/api/parks/${park.slug}/live`,
  );
  // eslint-disable-next-line no-console
  console.log("shared present?  :", shared !== null);
  // eslint-disable-next-line no-console
  console.log("shared.live      :", shared?.live);
  // eslint-disable-next-line no-console
  console.log("shared attr len  :", sharedAttrs.length);
  // eslint-disable-next-line no-console
  console.log(
    "shared OP+number :",
    operatingNumericCount(shared),
  );
  // eslint-disable-next-line no-console
  console.log("backup attempted :", backupAttempted);
  // eslint-disable-next-line no-console
  console.log("backup in-flight :", inFlight);
  // eslint-disable-next-line no-console
  console.log("backup present?  :", backup !== null);
  // eslint-disable-next-line no-console
  console.log("backup.live      :", backup?.live);
  // eslint-disable-next-line no-console
  console.log("backup attr len  :", backupAttrs.length);
  // eslint-disable-next-line no-console
  console.log(
    "backup OP+number :",
    operatingNumericCount(backup),
  );
  if (sample) {
    // eslint-disable-next-line no-console
    console.log("real-live sample :", {
      slug: sample.slug,
      status: sample.status,
      waitMinutes: sample.waitMinutes,
    });
  }
  // eslint-disable-next-line no-console
  console.log("final mode       :", mode);
  // eslint-disable-next-line no-console
  console.groupEnd();
}

export function WaitsAllParks() {
  const { status, parks, liveByPark } = useAllLive();

  // Backup per-park fetch. The multi-park parallel fetch inside
  // `useAllLive` occasionally drops a park (transient network blip,
  // HTTP/1.1 connection cap, abort race in StrictMode). When that
  // happens, the shared `liveByPark` is missing that park's entry
  // even though a single follow-up fetch would succeed — which is
  // exactly the case where /parks/{slug} shows real waits while this
  // page is stuck on Estimated. We keep a local backup keyed by slug
  // and prefer it whenever `useAllLive`'s entry is unhealthy.
  const [backupBySlug, setBackupBySlug] = useState<Map<string, ApiParkLive>>(
    () => new Map(),
  );
  // Tracks slugs we've already attempted a backup fetch for, so we
  // don't re-fire on every render. Reset when slugs come back online
  // in the shared map.
  const inFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (parks.length === 0) return;

    let cancelled = false;
    const ctls: AbortController[] = [];

    for (const park of parks) {
      // Skip closed parks — we don't need real waits for them.
      if (park.status === "CLOSED") continue;

      const shared = liveByPark.get(park.slug) ?? null;
      // Already healthy in the shared map → drop any backup we kept.
      if (hasRealLive(shared)) {
        if (backupBySlug.has(park.slug)) {
          setBackupBySlug((prev) => {
            if (!prev.has(park.slug)) return prev;
            const next = new Map(prev);
            next.delete(park.slug);
            return next;
          });
        }
        inFlightRef.current.delete(park.slug);
        continue;
      }

      // Shared entry is missing OR present-but-junk. If the local
      // backup we already have is real-live, we're good — leave it.
      if (hasRealLive(backupBySlug.get(park.slug))) continue;

      // Skip if a backup fetch is already in-flight for this slug.
      if (inFlightRef.current.has(park.slug)) continue;

      inFlightRef.current.add(park.slug);
      const ctl = new AbortController();
      ctls.push(ctl);

      // [DIAGNOSTIC] backup fetch START
      // eslint-disable-next-line no-console
      console.log(
        `${DEBUG_TAG} ${park.slug} backup fetch START →`,
        `/api/parks/${park.slug}/live`,
      );

      fetchParkLive(park.slug, ctl.signal)
        .then((res) => {
          if (cancelled || ctl.signal.aborted) {
            // [DIAGNOSTIC] backup fetch ABORTED
            // eslint-disable-next-line no-console
            console.log(
              `${DEBUG_TAG} ${park.slug} backup fetch ABORTED (effect re-run before resolve)`,
            );
            return;
          }
          // [DIAGNOSTIC] backup fetch RESOLVED
          const opCount = operatingNumericCount(res);
          const sample = res.attractions.find(
            (a) =>
              a.status === "OPERATING" && typeof a.waitMinutes === "number",
          );
          // eslint-disable-next-line no-console
          console.log(`${DEBUG_TAG} ${park.slug} backup fetch RESOLVED`, {
            "live.live": res.live,
            "attractions.length": res.attractions.length,
            "OP+number count": opCount,
            "would commit?": opCount > 0,
            sample: sample
              ? {
                  slug: sample.slug,
                  status: sample.status,
                  waitMinutes: sample.waitMinutes,
                }
              : null,
          });
          // Only commit a backup that actually has real-live data —
          // otherwise we'd be replacing junk with more junk.
          if (hasRealLive(res)) {
            setBackupBySlug((prev) => {
              const next = new Map(prev);
              next.set(park.slug, res);
              return next;
            });
          }
        })
        .catch((err) => {
          // [DIAGNOSTIC] backup fetch FAILED
          // eslint-disable-next-line no-console
          console.warn(
            `${DEBUG_TAG} ${park.slug} backup fetch FAILED →`,
            (err as Error)?.message ?? err,
          );
        })
        .finally(() => {
          inFlightRef.current.delete(park.slug);
        });
    }

    return () => {
      cancelled = true;
      for (const ctl of ctls) ctl.abort();
    };
    // We intentionally exclude `backupBySlug` from deps — it's only
    // read for early-exit checks, not for triggering re-fetches.
    // Including it would cause a refetch storm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parks, liveByPark]);

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
          {parks.map((park) => {
            // Prefer the shared payload from `useAllLive` when it has
            // real-live data; otherwise prefer the per-park backup
            // (also gated on real-live); otherwise fall back to whatever
            // is non-null (so estimated rendering still has the
            // attractions list to look at if upstream returned junk).
            const shared = liveByPark.get(park.slug) ?? null;
            const backup = backupBySlug.get(park.slug) ?? null;
            const effective: ApiParkLive | null = hasRealLive(shared)
              ? shared
              : hasRealLive(backup)
                ? backup
                : (shared ?? backup);

            // [DIAGNOSTIC] resolve final mode the same way ParkBlock will,
            // so the render log matches exactly what the user sees on
            // the card.
            const effOps = operatingNumericCount(effective);
            const finalMode =
              park.status === "CLOSED"
                ? "closed"
                : effOps > 0
                  ? "live"
                  : "estimated";
            const backupAttempted =
              inFlightRef.current.has(park.slug) ||
              backupBySlug.has(park.slug);
            const inFlight = inFlightRef.current.has(park.slug);
            dbgRender(
              park,
              shared,
              backup,
              backupAttempted,
              inFlight,
              finalMode,
            );

            return (
              <ParkBlock
                key={park.slug}
                park={park}
                live={effective}
              />
            );
          })}
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
 *                   instead of empty.
 *   - "closed"    — park is CLOSED today. We never advertise estimated
 *                   waits for closed parks; show closed-state copy and
 *                   suppress the Estimated pill.
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
  const operating = useMemo(
    () =>
      attractions.filter(
        (a) =>
          a.status === "OPERATING" && typeof a.waitMinutes === "number",
      ),
    [attractions],
  );
  const top = useMemo(
    () =>
      [...operating]
        .sort((a, b) => (b.waitMinutes as number) - (a.waitMinutes as number))
        .slice(0, 6),
    [operating],
  );

  // Same predicate as `hasRealLive` above — inlined so React/tooling
  // can see the dep cleanly.
  const hasRealLiveData = operating.length > 0;

  // Static fallback — how many attractions Parkio tracks for this park,
  // independent of any live response. Used to size the "X attractions
  // tracked" line in estimated mode.
  const trackedCount = useMemo(
    () => RIDES.filter((r) => r.parkId === park.slug).length,
    [park.slug],
  );

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

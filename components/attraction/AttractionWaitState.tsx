"use client";

import { useEffect, useState } from "react";
import { fetchAttraction } from "@/lib/parkioClient";
import type { Ride } from "@/lib/types";
import { deriveWaitState, waitStateLabel, type WaitState } from "@/lib/waitState";

/**
 * The page's only client island.
 *
 * It asks Parkio's own /api/attractions/[slug] route (never themeparks.wiki
 * directly) for one attraction, and hands the answer to the shared Slice 1
 * state model. No wait-state rules are re-implemented here.
 *
 * A failed or slow request is not an error condition for the page: the
 * component simply falls back to `deriveWaitState(ride, null)`, which is
 * the deterministic Parkio estimate. Everything else on the page is
 * server-rendered and unaffected.
 */
export function AttractionWaitState({ ride }: { ride: Ride }) {
  // Start from the evergreen estimate so the first paint is already
  // honest and useful rather than a spinner.
  const [state, setState] = useState<WaitState>(() =>
    deriveWaitState(ride, null),
  );

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    fetchAttraction(ride.id, controller.signal)
      .then((attraction) => {
        if (cancelled) return;
        setState(deriveWaitState(ride, attraction));
      })
      .catch(() => {
        // Upstream unavailable — hold the deterministic estimate.
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [ride]);

  const isLive = state.kind === "live";
  const isTypical = state.kind === "typical";

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold tracking-tight text-ink-900">
        Right now
      </h2>

      <div
        className={`mt-3 rounded-2xl border px-4 py-4 ${
          isLive
            ? "border-ink-200 bg-white shadow-soft"
            : "border-dashed border-ink-200 bg-ink-50"
        }`}
      >
        <div className="flex items-center gap-2">
          {/* Shape as well as colour: a filled dot is a posted wait, a
              hollow one is a Parkio estimate. The wording below repeats
              the distinction so it never rests on colour alone. */}
          <span
            aria-hidden
            className={`h-2 w-2 rounded-full ${
              isLive ? "bg-emerald-500" : "border border-ink-300 bg-white"
            }`}
          />
          <span className="text-xl font-semibold text-ink-900">
            {waitStateLabel(state)}
          </span>
        </div>

        <p className="mt-2 text-sm text-ink-600">
          {isLive
            ? "Standby wait posted by the park."
            : isTypical
              ? "Parkio estimate — the park has not posted a standby wait right now."
              : "No standby wait is posted for this attraction right now."}
        </p>
      </div>
    </section>
  );
}

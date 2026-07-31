/**
 * Wait-time pills shared across the live surfaces.
 *
 * Every card/list/hero that shows a wait renders the same pill: tier
 * colour from `waitColorClasses`, a dot, and "<n> min" — with a
 * neutral ink treatment when the number is missing or estimated.
 * Call sites only vary layout, which they pass through `className`.
 */

import { waitColorClasses, waitTier } from "@/lib/utils";

const BASE =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1";

export function WaitPill({
  minutes,
  className = "",
}: {
  minutes: number | null;
  className?: string;
}) {
  if (typeof minutes !== "number") {
    return (
      <span
        className={`${BASE} bg-ink-100 text-ink-500 ring-ink-200 ${className}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-ink-300" />—
      </span>
    );
  }
  const c = waitColorClasses(waitTier(minutes));
  return (
    <span className={`${BASE} ${c.bg} ${c.text} ${c.ring} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {minutes} min
    </span>
  );
}

const BIG_BASE =
  "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-base font-semibold tabular-nums ring-1";

/**
 * Hero-sized variant used by the single-recommendation surfaces.
 *
 * Estimated waits render in the neutral ink palette with an "est."
 * suffix so a predicted number never visually competes with a live
 * one elsewhere on the page.
 */
export function BigWaitPill({
  minutes,
  estimated = false,
}: {
  minutes: number | null;
  estimated?: boolean;
}) {
  if (typeof minutes !== "number") {
    return (
      <span className={`${BIG_BASE} bg-ink-100 text-ink-500 ring-ink-200`}>
        <span className="h-2 w-2 rounded-full bg-ink-300" />—
      </span>
    );
  }
  if (estimated) {
    return (
      <span
        className={`${BIG_BASE} bg-ink-100 text-ink-700 ring-ink-200`}
        title="Estimated from this ride's typical wait — live data unavailable right now"
      >
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
    <span className={`${BIG_BASE} ${c.bg} ${c.text} ${c.ring}`}>
      <span className={`h-2 w-2 rounded-full ${c.dot}`} />
      {minutes} min
    </span>
  );
}

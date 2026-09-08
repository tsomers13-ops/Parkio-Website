"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Secondary "in the park right now" section.
 *
 * Native <details>/<summary>, so keyboard operation, screen-reader
 * semantics and no-JS behaviour all come for free — no custom
 * fake-button disclosure.
 *
 * Two small pieces of client behaviour justify the boundary:
 *
 *   1. `/parks/{id}/#in-park` should arrive with the section already
 *      open, while a normal visit keeps it closed.
 *   2. Leaflet measures its container on mount. Mounted inside a closed
 *      <details> it measures zero, and would paint blank or partial when
 *      revealed. Dispatching a resize on open makes Leaflet re-measure
 *      (its `trackResize` handler calls invalidateSize), which is the
 *      narrowest possible fix — no change to ParkMap or LeafletMap.
 */
export function InParkDisclosure({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  // Tell any map inside to re-measure once it actually has a size.
  function remeasure() {
    if (typeof window === "undefined") return;
    // Two frames: one for <details> to lay out, one for Leaflet to read it.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    });
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function openIfHashTargetsUs() {
      if (window.location.hash !== "#in-park") return;
      const el = ref.current;
      if (!el || el.open) return;
      el.open = true;
      remeasure();
      // The browser already tried to scroll before we opened it, so bring
      // the section back into view. Guarded: opening must never depend on
      // scrollIntoView being available.
      el.scrollIntoView?.({ block: "start" });
    }

    openIfHashTargetsUs();
    window.addEventListener("hashchange", openIfHashTargetsUs);
    return () => window.removeEventListener("hashchange", openIfHashTargetsUs);
  }, []);

  return (
    <details
      id="in-park"
      ref={ref}
      onToggle={(event) => {
        if (event.currentTarget.open) remeasure();
      }}
      className="mx-auto mt-14 max-w-5xl scroll-mt-4 px-5 sm:mt-16 sm:px-8"
    >
      <summary className="cursor-pointer list-none rounded-3xl border border-ink-200 bg-white px-5 py-5 shadow-soft transition hover:border-ink-300 hover:bg-ink-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500">
        <span className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-lg font-semibold tracking-tight text-ink-900">
              In the park now?
            </span>
            <span className="mt-1 block text-sm text-ink-600">
              Open the live map, current waits and what to ride next.
            </span>
          </span>
          <span
            aria-hidden
            className="shrink-0 rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-700"
          >
            Open
          </span>
        </span>
      </summary>

      <div className="mt-6">{children}</div>
    </details>
  );
}

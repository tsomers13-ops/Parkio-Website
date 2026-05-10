"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  APP_DOWNLOAD_CTA_ATTR,
  APP_STORE_LIVE,
  APP_STORE_URL,
} from "@/lib/appStore";

/**
 * Floating top-of-viewport navigation strip for map pages.
 *
 * The /parks/[parkId] map page deliberately omits the global Navbar
 * to give the map maximum vertical room — but that left users with no
 * way to escape back to /parks. This overlay restores that without
 * disturbing the map's own internal controls (which all sit at
 * top-center, right-mid, and bottom-left of the map container).
 *
 *   ┌────────────────────────────────────────────────┐
 *   │ [← Parks]                       [Open Parkio]  │  ← this overlay
 *   │                                                │
 *   │            (map's center info pill)            │  ← untouched
 *   │                                  ┌──┐          │
 *   │                                  │+ │          │
 *   │                                  └──┘          │
 *   │                                                │
 *   └────────────────────────────────────────────────┘
 *
 * Implementation notes:
 *  • `position: fixed` keeps the buttons reachable regardless of scroll.
 *  • The wrapper has `pointer-events: none` so the gap between the two
 *    buttons doesn't capture clicks meant for the map. Each button
 *    re-enables pointer events on itself.
 *  • z-[1000] sits above the map's own internal z-[800] top bar AND
 *    above Leaflet's panes (which max out at z-700 for popups). The
 *    overlay's geographic position (corners) doesn't overlap the
 *    map's center info pill or right-mid controls anyway, so the
 *    elevated z-index only matters for tile/marker coverage at
 *    certain zoom levels — without it, Leaflet content over the
 *    top-left corner can hide the "← Parks" button.
 *  • The "← Parks" button prefers `router.back()` when there's any
 *    in-tab history; otherwise it pushes /parks. Cold-load (fresh
 *    tab) → /parks. Within-app navigation → back.
 *  • The "Open Parkio" button reads from `lib/appStore` so the URL
 *    + `data-cta="app-download"` tracking attr stay in lockstep with
 *    every other download CTA across the site.
 */
export function MapNavOverlay() {
  const router = useRouter();

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/parks");
    }
  }

  const externalProps = APP_STORE_LIVE
    ? { target: "_blank" as const, rel: "noopener" as const }
    : {};

  return (
    <div
      aria-label="Map navigation"
      className="pointer-events-none fixed inset-x-0 top-0 z-[1000] flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5"
    >
      <button
        type="button"
        onClick={handleBack}
        aria-label="Back to parks"
        className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-ink-900 shadow-soft ring-1 ring-ink-200 backdrop-blur transition hover:bg-white active:scale-[0.98]"
      >
        <BackArrow />
        Parks
      </button>

      <Link
        href={APP_STORE_URL}
        data-cta={APP_DOWNLOAD_CTA_ATTR}
        {...externalProps}
        className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-ink-800 active:scale-[0.98]"
      >
        Open Parkio
      </Link>
    </div>
  );
}

function BackArrow() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <path
        d="M10 3L5 8l5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

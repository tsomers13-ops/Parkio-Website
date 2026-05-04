/**
 * App Store single source of truth.
 *
 * Every "Download Parkio" CTA across the site reads `APP_STORE_URL`
 * from this module — so flipping the URL (or A/B-ing storefronts) is
 * a one-line change and there's never a stale link in any component.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_APP_STORE_URL (build-time, public)
 *   2. APP_STORE_URL (build-time, server-side)
 *   3. The hard-coded production URL — guarantees CTAs are always live,
 *      even on a fresh env without configured vars.
 *
 * `APP_STORE_LIVE` indicates the URL is an external https:// link
 * (vs. an internal fallback path), which lets components decide
 * whether to render `target="_blank" rel="noopener"` and the Apple
 * glyph.
 */
export const APP_STORE_URL: string =
  process.env.NEXT_PUBLIC_APP_STORE_URL ??
  process.env.APP_STORE_URL ??
  "https://apps.apple.com/us/app/parkio-guide/id6762892374";

export const APP_STORE_LIVE: boolean = APP_STORE_URL.startsWith("http");

/**
 * Tracking attribute attached to every primary "Download Parkio"
 * button so we can wire click analytics later (e.g., a single
 * `[data-cta="app-download"]` event listener).
 */
export const APP_DOWNLOAD_CTA_ATTR = "app-download" as const;

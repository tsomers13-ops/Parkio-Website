/**
 * CARTO Voyager basemap configuration.
 *
 * ── Why this file exists ─────────────────────────────────────────────
 *
 * Around late August 2026 CARTO began requiring an API key for its raster
 * basemaps. Unauthenticated requests do NOT fail — they return HTTP 200
 * with a valid PNG that has "API KEY REQUIRED" composited into the
 * imagery. Verified directly: the tile is a real 256x256 PNG, and an
 * absent, empty, or invalid `key` all return byte-identical bytes even on
 * a cache miss. So there is no error to catch; the only signal is visual.
 *
 * Authentication is a `key` query parameter — NOT `api_key`. Probing with
 * `api_key`, `apikey` and `access_token` returned the identical etag,
 * because CARTO simply ignores unrecognised parameters.
 *
 * ── Credential classification ────────────────────────────────────────
 *
 * This is a PUBLIC browser credential, equivalent to a Mapbox public
 * token or a Google Maps browser key: CARTO documents it in client-side
 * Leaflet examples, it is free with no account, and it grants nothing
 * beyond reading basemap tiles. Hence `NEXT_PUBLIC_`. It is scoped to a
 * project, not secret — CARTO's "do not share or reuse across unrelated
 * projects" is a scoping rule, not a secrecy requirement.
 *
 * ── Missing key ──────────────────────────────────────────────────────
 *
 * We deliberately do NOT fall back to the unauthenticated URL. That URL
 * "works", which is exactly the problem: it would ship a watermarked map
 * that looks broken while every health check passes. `basemapConfig()`
 * returns null instead, and the map renders without a tile layer plus an
 * explicit notice. Markers, interaction and the rest of the page are
 * unaffected.
 */

/** Raster tile template. `{s}` subdomain, `{r}` retina, `key` appended. */
const CARTO_VOYAGER_RASTER =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

/** CARTO requires both CARTO and OpenStreetMap to be credited. */
export const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

/** Subdomains CARTO documents for raster tiles. */
export const BASEMAP_SUBDOMAINS = "abcd";

export interface BasemapConfig {
  url: string;
  attribution: string;
  subdomains: string;
}

/**
 * The configured basemap, or null when no key is present.
 *
 * Reads `NEXT_PUBLIC_CARTO_API_KEY` — CARTO's own terminology is "API
 * key", so the name matches the product rather than inventing one.
 */
export function basemapConfig(
  key: string | undefined = process.env.NEXT_PUBLIC_CARTO_API_KEY,
): BasemapConfig | null {
  const trimmed = key?.trim();
  if (!trimmed) return null;

  return {
    url: `${CARTO_VOYAGER_RASTER}?key=${encodeURIComponent(trimmed)}`,
    attribution: BASEMAP_ATTRIBUTION,
    subdomains: BASEMAP_SUBDOMAINS,
  };
}

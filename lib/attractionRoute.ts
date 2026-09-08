/**
 * Route contract for /parks/[parkId]/attractions/[slug].
 *
 * Everything here is pure and framework-free so the page, its metadata,
 * and the tests all validate identity the same way. Two rules matter:
 *
 *   1. `Ride.id` is the canonical public slug. It never changes when an
 *      attraction is renamed — that is why the URL survives a rebrand.
 *   2. A URL is only valid when the attraction actually belongs to the
 *      park named in the path. `/parks/epcot/attractions/hs-rise` is a
 *      malformed URL, not an alias, and must 404 rather than quietly
 *      render a Hollywood Studios ride under EPCOT.
 */

import { PARKS, RIDES, getPark, getRide } from "./data";
import type { Park, Ride } from "./types";

export interface AttractionRouteParams {
  parkId: string;
  slug: string;
}

export interface ResolvedAttraction {
  park: Park;
  ride: Ride;
}

/**
 * One tuple per canonical ride. Derived from RIDES — never hardcoded, so
 * adding a ride adds a page automatically.
 */
export function attractionStaticParams(): AttractionRouteParams[] {
  return RIDES.map((ride) => ({ parkId: ride.parkId, slug: ride.id }));
}

/**
 * Resolve a park/slug pair, or null when the pair is not a real
 * attraction in that park. Callers turn null into notFound().
 */
export function resolveAttraction(
  parkId: string,
  slug: string,
): ResolvedAttraction | null {
  const park = getPark(parkId);
  if (!park) return null;

  const ride = getRide(slug);
  if (!ride) return null;

  // Ownership check — the whole point of the nested route.
  if (ride.parkId !== park.id) return null;

  return { park, ride };
}

/** Canonical path, with the trailing slash this app serves (trailingSlash: true). */
export function attractionCanonicalPath(parkId: string, slug: string): string {
  return `/parks/${parkId}/attractions/${slug}/`;
}

/**
 * Title and description built only from facts already in the dataset —
 * the attraction's own editorial line plus its land and park. No
 * generated marketing copy.
 *
 * The root layout appends " · Parkio" via its title template.
 */
export function attractionTitle(park: Park, ride: Ride): string {
  return `${ride.name} — ${park.name} ride guide`;
}

export function attractionDescription(park: Park, ride: Ride): string {
  return `${ride.description} Find it in ${ride.land} at ${park.name}.`;
}

/** Every park slug that currently has at least one attraction page. */
export function parksWithAttractions(): string[] {
  return PARKS.filter((p) => RIDES.some((r) => r.parkId === p.id)).map(
    (p) => p.id,
  );
}

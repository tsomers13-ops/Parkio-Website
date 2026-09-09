/**
 * Route contract for the Dining experience.
 *
 * Mirrors lib/attractionRoute.ts deliberately: same ownership guard, same
 * canonical-path shape, same purity so page, metadata and tests all validate
 * identity identically. Dining semantics stay in lib/dining.ts.
 *
 * Two rules:
 *   1. The Website-owned slug is the public identifier. It never moves when a
 *      venue is renamed in iOS.
 *   2. A URL is only valid when the venue belongs to the park named in the
 *      path — /parks/epcot/dining/hs-brown-derby is malformed, not an alias.
 */

import { getPark } from "./data";
import {
  DINING_PARK_IDS,
  type PermanentDiningVenue,
} from "./diningTypes";
import { getAllPermanentDining, getPermanentDiningBySlug } from "./dining";
import type { Park } from "./types";

export interface DiningRouteParams {
  parkId: string;
  slug: string;
}

export interface ResolvedDiningVenue {
  park: Park;
  venue: PermanentDiningVenue;
}

/** Parks that get a Dining discovery page. Derived, never hardcoded in a page. */
export function diningParkStaticParams(): { parkId: string }[] {
  return DINING_PARK_IDS.map((parkId) => ({ parkId }));
}

/** One tuple per permanent venue — all 62 are routable per Gate 3 policy. */
export function diningStaticParams(): DiningRouteParams[] {
  return getAllPermanentDining().map((venue) => ({
    parkId: venue.parkId,
    slug: venue.slug,
  }));
}

/** Resolve a park/slug pair, or null. Callers turn null into notFound(). */
export function resolveDiningVenue(
  parkId: string,
  slug: string,
): ResolvedDiningVenue | null {
  const park = getPark(parkId);
  if (!park) return null;
  const venue = getPermanentDiningBySlug(parkId, slug);
  if (!venue) return null;
  return { park, venue };
}

/** Canonical paths, with the trailing slash this app serves. */
export function parkDiningPath(parkId: string): string {
  return `/parks/${parkId}/dining/`;
}

export function diningCanonicalPath(parkId: string, slug: string): string {
  return `/parks/${parkId}/dining/${slug}/`;
}

export function parkDiningTitle(park: Park): string {
  return `${park.name} dining guide`;
}

export function parkDiningDescription(park: Park, venueCount: number): string {
  return `Every dining location at ${park.name} — ${venueCount} restaurants, quick service spots, snack kiosks and lounges, grouped by area so you can plan where to eat.`;
}

export function diningVenueTitle(park: Park, venue: PermanentDiningVenue): string {
  return `${venue.name} — ${park.name} dining`;
}

/**
 * Description built only from fields the venue actually has. A factual-only
 * venue gets a factual sentence; nothing is invented to pad it out.
 */
export function diningVenueDescription(
  park: Park,
  venue: PermanentDiningVenue,
  typeLabel: string,
): string {
  const base = `${venue.name} is a ${typeLabel.toLowerCase()} dining location in ${venue.land} at ${park.name}.`;
  const verdict = venue.editorial?.shortVerdict?.trim();
  return verdict ? `${base} ${verdict}` : base;
}

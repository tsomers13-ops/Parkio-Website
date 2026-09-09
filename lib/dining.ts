/**
 * Permanent Dining domain + the combined Dining surface.
 *
 * Permanent Dining's source of truth is the iOS repo, reaching the Website as
 * the generated `lib/generated/dining.json`. Nothing here mutates it.
 *
 * The content-floor policy lives here because it is a property of the data,
 * not of any page: it answers "does this venue have enough evergreen substance
 * to deserve an indexable page?" — deliberately separate from whether a URL
 * exists at all.
 */

import permanentSource from "./generated/dining.json";
import { DINING_VENUE_KEYS } from "./diningVenueKeys";
import type {
  DiningItem,
  DiningParkId,
  DiningType,
  PermanentDiningVenue,
} from "./diningTypes";
import { DINING_PARK_IDS } from "./diningTypes";
import { planningLand } from "./lands";
import {
  getActiveFestivalDiningForPark,
  getSeasonalDiningForPark,
} from "./seasonalDining";

interface PermanentDocument {
  schemaVersion: number;
  sourceRepository: string;
  sourceCommit: string;
  sourceDirty: boolean;
  entityCount: number;
  venues: Omit<PermanentDiningVenue, "kind">[];
}

const DOC = permanentSource as unknown as PermanentDocument;

/**
 * Attach the Website-owned immutable key to every venue.
 *
 * Fails closed at module load: a venue with no minted venueKey is a coverage
 * gap, and shipping it would mean ratings filed against an identity we do not
 * control. There is deliberately no fallback to slug or canonicalId.
 */
const VENUES: PermanentDiningVenue[] = DOC.venues.map((venue) => {
  const venueKey = DINING_VENUE_KEYS[venue.canonicalId];
  if (!venueKey) {
    throw new Error(
      `Dining venue "${venue.canonicalId}" has no minted venueKey. ` +
        "Add one to lib/diningVenueKeys.ts — never derive it from the slug.",
    );
  }
  return {
    ...venue,
    kind: "permanent" as const,
    venueKey,
    parkId: venue.parkId as DiningParkId,
    type: venue.type as DiningType,
  };
});

export function isDiningParkId(parkId: string): parkId is DiningParkId {
  return (DINING_PARK_IDS as readonly string[]).includes(parkId);
}

export function getAllPermanentDining(): PermanentDiningVenue[] {
  return VENUES;
}

export function getPermanentDiningProvenance() {
  return {
    schemaVersion: DOC.schemaVersion,
    sourceRepository: DOC.sourceRepository,
    sourceCommit: DOC.sourceCommit,
    sourceDirty: DOC.sourceDirty,
    entityCount: DOC.entityCount,
  };
}

/**
 * Default permanent ordering: land, then name. Park is already fixed by the
 * caller. No popularity rank is invented — the dataset has no such signal.
 */
function byLandThenName(a: PermanentDiningVenue, b: PermanentDiningVenue): number {
  if (a.land !== b.land) return a.land < b.land ? -1 : 1;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

export function getPermanentDiningForPark(parkId: string): PermanentDiningVenue[] {
  if (!isDiningParkId(parkId)) return [];
  return VENUES.filter((venue) => venue.parkId === parkId).sort(byLandThenName);
}

/**
 * Slug lookup with the same ownership guard the attraction route uses:
 * a venue only resolves under the park it actually belongs to, so
 * /parks/epcot/dining/hs-... must 404 rather than render cross-park.
 */
export function getPermanentDiningBySlug(
  parkId: string,
  slug: string,
): PermanentDiningVenue | null {
  if (!isDiningParkId(parkId)) return null;
  const venue = VENUES.find((v) => v.slug === slug);
  if (!venue) return null;
  return venue.parkId === parkId ? venue : null;
}

/** A planning area and the venues in it. */
export interface DiningAreaGroup {
  name: string;
  venues: PermanentDiningVenue[];
}

/**
 * Group a park's venues by planning area, reusing the same normalisation the
 * attraction list uses so EPCOT's "World Showcase — Japan" collapses to
 * "World Showcase" for grouping while the card still shows the pavilion.
 * Groups appear in first-seen order (venues are already land-then-name sorted).
 */
export function groupPermanentDiningByArea(
  venues: readonly PermanentDiningVenue[],
): DiningAreaGroup[] {
  const groups = new Map<string, PermanentDiningVenue[]>();
  for (const venue of venues) {
    const area = planningLand(venue.land);
    const bucket = groups.get(area);
    if (bucket) bucket.push(venue);
    else groups.set(area, [venue]);
  }
  return [...groups.entries()].map(([name, list]) => ({ name, venues: list }));
}

// ── Immutable identity lookups ──────────────────────────────────────────────

const BY_VENUE_KEY = new Map(VENUES.map((venue) => [venue.venueKey, venue]));

/**
 * Resolve a venue by its immutable key.
 *
 * Strict by design: only a minted venueKey resolves. A canonicalId, slug,
 * externalId, festival booth id or attraction id returns null rather than
 * quietly falling through to another identity space — a rating must never be
 * filed against something we did not intend.
 */
export function getPermanentDiningByVenueKey(
  venueKey: string,
): PermanentDiningVenue | null {
  return BY_VENUE_KEY.get(venueKey) ?? null;
}

export function isKnownDiningVenueKey(venueKey: unknown): venueKey is string {
  return typeof venueKey === "string" && BY_VENUE_KEY.has(venueKey);
}

/** The immutable key for a current canonicalId, or null when unknown. */
export function getVenueKeyForCanonicalId(canonicalId: string): string | null {
  return DINING_VENUE_KEYS[canonicalId] ?? null;
}

/** Every minted key. Ratings validation checks membership against this set. */
export function allDiningVenueKeys(): string[] {
  return VENUES.map((venue) => venue.venueKey);
}

// ── Content floor ───────────────────────────────────────────────────────────

/**
 * Evergreen planning facts a venue actually carries.
 *
 * Name, park, land and type are excluded on purpose: all 62 venues have them,
 * so they cannot distinguish a useful page from a directory entry. Only facts
 * that vary across the catalog count.
 *
 * Live operational status is deliberately NOT a signal — it is not evergreen,
 * so it cannot justify indexing a page.
 */
export interface DiningContentSignals {
  hasVerdict: boolean;
  hasSignatureItems: boolean;
  hasPriceTier: boolean;
  hasAmenityFacts: boolean;
  hasDietaryFlags: boolean;
  hasMappedLocation: boolean;
  hasOperationalSource: boolean;
}

/** A venue needs this many evergreen signals to earn an indexable page. */
export const DINING_CONTENT_FLOOR = 3;

export function diningContentSignals(venue: PermanentDiningVenue): DiningContentSignals {
  const e = venue.editorial;
  return {
    hasVerdict: Boolean(e?.shortVerdict?.trim()),
    hasSignatureItems: (e?.signatureItems?.length ?? 0) > 0,
    hasPriceTier: typeof e?.priceTier === "number",
    hasAmenityFacts:
      typeof e?.mobileOrderAvailable === "boolean" &&
      typeof e?.indoorSeating === "boolean" &&
      typeof e?.kidFriendly === "boolean",
    hasDietaryFlags: (e?.dietaryFlags?.length ?? 0) > 0,
    hasMappedLocation: venue.latitude !== undefined && venue.longitude !== undefined,
    hasOperationalSource: Boolean(venue.externalId),
  };
}

export function diningContentScore(venue: PermanentDiningVenue): number {
  return Object.values(diningContentSignals(venue)).filter(Boolean).length;
}

export function meetsDiningContentFloor(venue: PermanentDiningVenue): boolean {
  return diningContentScore(venue) >= DINING_CONTENT_FLOOR;
}

/**
 * Three separate questions, deliberately not collapsed into one:
 *
 *   discoverable — appears in the park's Dining list. Always true: a real
 *                  venue is useful to see even with thin data.
 *   routable     — has a detail URL. Always true: internal links need a
 *                  destination, and 404ing a real venue is worse than an
 *                  honest thin page.
 *   indexable    — search engines may index it. Only above the content floor,
 *                  so 49 near-identical directory entries never compete with
 *                  the park page or each other.
 */
export interface DiningVisibility {
  discoverable: boolean;
  routable: boolean;
  indexable: boolean;
  score: number;
}

export function diningVisibility(venue: PermanentDiningVenue): DiningVisibility {
  const score = diningContentScore(venue);
  return {
    discoverable: true,
    routable: true,
    indexable: score >= DINING_CONTENT_FLOOR,
    score,
  };
}

/** Venues that may be indexed. Sitemap membership derives from this and only this. */
export function getIndexablePermanentDining(parkId?: string): PermanentDiningVenue[] {
  const pool = parkId ? getPermanentDiningForPark(parkId) : VENUES;
  return pool.filter(meetsDiningContentFloor);
}

// ── Combined surface ────────────────────────────────────────────────────────

export interface ParkDining {
  permanent: PermanentDiningVenue[];
  /** Festival booths active on `date`. Empty outside a festival window. */
  festival: ReturnType<typeof getActiveFestivalDiningForPark>;
}

/**
 * Everything edible in a park on a date. Permanent and seasonal stay in
 * separate buckets: a festival booth is never presented as a restaurant, and
 * a permanent venue hosting a festival menu still appears exactly once in
 * `permanent` — its booth appears in `festival` and links back by
 * `venueCanonicalId`.
 */
export function getAllDiningForPark(parkId: string, date: string): ParkDining {
  return {
    permanent: getPermanentDiningForPark(parkId),
    festival: getActiveFestivalDiningForPark(parkId, date),
  };
}

/** All seasonal records for a park regardless of lifecycle, for internal views. */
export { getSeasonalDiningForPark };

export function isDiningItemPermanent(item: DiningItem): item is PermanentDiningVenue {
  return item.kind === "permanent";
}

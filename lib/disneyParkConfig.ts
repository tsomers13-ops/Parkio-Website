/**
 * Single source of truth for which Disney parks Parkio supports.
 *
 * Parkio currently ships ONLY the U.S. Disney parks:
 *   - Walt Disney World: Magic Kingdom, EPCOT, Hollywood Studios, Animal Kingdom
 *   - Disneyland Resort: Disneyland Park, Disney California Adventure
 *
 * The `externalId` fields are themeparks.wiki entity UUIDs. Replace these
 * if a park's UUID changes — the iOS app and the website both look up
 * everything else by slug, so slugs MUST stay stable.
 *
 * iOS side: never call themeparks.wiki directly. Always go through
 * Parkio API routes (see app/api/*).
 */

export interface DisneyResortConfig {
  slug: string;
  name: string;
  /** IANA timezone */
  timezone: string;
  /** themeparks.wiki destination UUID */
  externalId: string;
  /** Slugs of parks that belong to this resort, in display order. */
  parkSlugs: string[];
}

export interface DisneyParkConfig {
  /** Stable Parkio slug — also used as the iOS-side identifier. */
  slug: string;
  /** Display name. */
  name: string;
  /** Slug of the parent resort. */
  resortSlug: string;
  /** IANA timezone (matches the resort). */
  timezone: string;
  /** themeparks.wiki entity UUID — replace if the upstream changes it. */
  externalId: string;
  /** Park center coordinates (used by the map and as a fallback for SEO). */
  lat: number;
  lng: number;
}

export const DISNEY_RESORTS: DisneyResortConfig[] = [
  {
    slug: "walt-disney-world",
    name: "Walt Disney World",
    timezone: "America/New_York",
    // themeparks.wiki destination UUID for Walt Disney World Resort.
    externalId: "e957da41-3552-4cf6-b636-5babc5cbc4e5",
    parkSlugs: [
      "magic-kingdom",
      "epcot",
      "hollywood-studios",
      "animal-kingdom",
    ],
  },
  {
    slug: "disneyland-resort",
    name: "Disneyland Resort",
    timezone: "America/Los_Angeles",
    // themeparks.wiki destination UUID for Disneyland Resort.
    externalId: "bfc89fd6-314d-44b4-b89e-df1a89cf991e",
    parkSlugs: ["disneyland", "california-adventure"],
  },
];

export const DISNEY_PARKS: DisneyParkConfig[] = [
  {
    slug: "magic-kingdom",
    name: "Magic Kingdom",
    resortSlug: "walt-disney-world",
    timezone: "America/New_York",
    // themeparks.wiki entity UUID — Magic Kingdom Park
    externalId: "75ea578a-adc8-4116-a54d-dccb60765ef9",
    lat: 28.4177,
    lng: -81.5812,
  },
  {
    slug: "epcot",
    name: "EPCOT",
    resortSlug: "walt-disney-world",
    timezone: "America/New_York",
    // themeparks.wiki entity UUID — EPCOT
    externalId: "47f90d2c-e191-4239-a466-5892ef59a88b",
    lat: 28.3747,
    lng: -81.5494,
  },
  {
    slug: "hollywood-studios",
    name: "Disney's Hollywood Studios",
    resortSlug: "walt-disney-world",
    timezone: "America/New_York",
    // themeparks.wiki entity UUID — Disney's Hollywood Studios
    externalId: "288747d1-8b4f-4a64-867e-ea7c9b27bad8",
    lat: 28.3575,
    lng: -81.5582,
  },
  {
    slug: "animal-kingdom",
    name: "Disney's Animal Kingdom",
    resortSlug: "walt-disney-world",
    timezone: "America/New_York",
    // themeparks.wiki entity UUID — Disney's Animal Kingdom Theme Park
    externalId: "1c84a229-8862-4648-9c71-378ddd2c7693",
    lat: 28.3553,
    lng: -81.5901,
  },
  {
    slug: "disneyland",
    name: "Disneyland Park",
    resortSlug: "disneyland-resort",
    timezone: "America/Los_Angeles",
    // themeparks.wiki entity UUID — Disneyland Park
    externalId: "7340550b-c14d-4def-80bb-acdb51d49a66",
    lat: 33.8121,
    lng: -117.919,
  },
  {
    slug: "california-adventure",
    name: "Disney California Adventure",
    resortSlug: "disneyland-resort",
    timezone: "America/Los_Angeles",
    // themeparks.wiki entity UUID — Disney California Adventure Park
    externalId: "832fcd51-ea19-4e77-85c7-75d5843b127c",
    lat: 33.8067,
    lng: -117.9209,
  },
];

/* ─────────────────────────── Lookups ─────────────────────────── */

export function getParkConfig(slug: string): DisneyParkConfig | undefined {
  return DISNEY_PARKS.find((p) => p.slug === slug);
}

export function getResortConfig(slug: string): DisneyResortConfig | undefined {
  return DISNEY_RESORTS.find((r) => r.slug === slug);
}

export function getResortForPark(
  parkSlug: string,
): DisneyResortConfig | undefined {
  const park = getParkConfig(parkSlug);
  if (!park) return undefined;
  return getResortConfig(park.resortSlug);
}

export function listSupportedParkSlugs(): string[] {
  return DISNEY_PARKS.map((p) => p.slug);
}

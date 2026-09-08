import { describe, expect, it } from "vitest";

import { RIDES } from "@/lib/data";
import {
  DINING_PILOT_PARK_IDS,
  DINING_SLUGS,
  DINING_SLUG_PATTERN,
  DINING_SLUG_VALUES,
  diningSlugFor,
} from "@/lib/diningSlugs";
import dataset from "@/lib/generated/dining.json";
import { reservedRouteSegments } from "@/scripts/diningPipeline";

const entries = Object.entries(DINING_SLUGS);
const bySlugPrefix = (prefix: string) => entries.filter(([, slug]) => slug.startsWith(prefix));

describe("dining slug manifest", () => {
  it("publishes exactly the 62-venue Priority 8 pilot", () => {
    expect(entries).toHaveLength(62);
  });

  it("covers EPCOT 42 and Hollywood Studios 20", () => {
    expect(bySlugPrefix("ep-")).toHaveLength(42);
    expect(bySlugPrefix("hs-")).toHaveLength(20);
  });

  it("assigns a unique slug to every venue", () => {
    expect(new Set(DINING_SLUG_VALUES).size).toBe(entries.length);
  });

  it("assigns a unique canonicalId to every slug", () => {
    expect(new Set(Object.keys(DINING_SLUGS)).size).toBe(entries.length);
  });

  it("uses park-prefixed, lowercase, URL-safe slugs", () => {
    for (const [, slug] of entries) {
      expect(slug, slug).toMatch(DINING_SLUG_PATTERN);
      expect(slug, slug).toBe(slug.toLowerCase());
      expect(slug, slug).toBe(encodeURIComponent(slug));
    }
  });

  it("never collides with an attraction slug", () => {
    const attractionSlugs = new Set(RIDES.map((ride) => ride.id));
    expect(RIDES).toHaveLength(84);
    for (const [, slug] of entries) {
      expect(attractionSlugs.has(slug), `${slug} collides with an attraction`).toBe(false);
    }
  });

  it("never collides with a reserved route segment", () => {
    const reserved = new Set(reservedRouteSegments(process.cwd()));
    for (const [, slug] of entries) {
      expect(reserved.has(slug), `${slug} collides with a route`).toBe(false);
    }
  });

  it("resolves every canonicalId against a generated record", () => {
    const canonicalIds = new Set(dataset.venues.map((venue) => venue.canonicalId));
    for (const [canonicalId] of entries) {
      expect(canonicalIds.has(canonicalId), canonicalId).toBe(true);
    }
  });

  it("keys on the internal stableID shape without publishing it", () => {
    for (const [canonicalId, slug] of entries) {
      expect(canonicalId.split("|")).toHaveLength(3);
      expect(slug).not.toContain("|");
      expect(diningSlugFor(canonicalId)).toBe(slug);
    }
  });

  it("returns undefined for an unpublished venue", () => {
    expect(diningSlugFor("Magic Kingdom|Fantasyland|Be Our Guest Restaurant")).toBeUndefined();
  });

  it("declares the two pilot parks", () => {
    expect([...DINING_PILOT_PARK_IDS]).toEqual(["epcot", "hollywood-studios"]);
  });
});

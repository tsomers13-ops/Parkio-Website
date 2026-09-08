import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { DINING_SLUGS } from "@/lib/diningSlugs";
import dataset from "@/lib/generated/dining.json";
import { SUPPORTED_TYPES, serialize } from "@/scripts/diningPipeline";

const venues = dataset.venues;
const inPark = (parkId: string) => venues.filter((venue) => venue.parkId === parkId);

describe("generated dining dataset", () => {
  it("parses with the expected provenance shape", () => {
    expect(dataset.schemaVersion).toBe(1);
    expect(dataset.sourceRepository).toBe("tsomers13-ops/parkio");
    expect(dataset.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(dataset.sourceDirty).toBe(false);
    expect(dataset.entityCount).toBe(venues.length);
  });

  it("carries no wall-clock timestamp", () => {
    expect(Object.keys(dataset)).not.toContain("generatedAt");
    expect(Object.keys(dataset).some((key) => /time|date|at$/i.test(key))).toBe(false);
  });

  it("holds the 62-venue pilot: EPCOT 42, Hollywood Studios 20", () => {
    expect(venues).toHaveLength(62);
    expect(inPark("epcot")).toHaveLength(42);
    expect(inPark("hollywood-studios")).toHaveLength(20);
  });

  it("contains no park outside the pilot", () => {
    const parks = new Set(venues.map((venue) => venue.parkId));
    expect([...parks].sort()).toEqual(["epcot", "hollywood-studios"]);
  });

  it("uses only supported venue types", () => {
    for (const venue of venues) {
      expect(SUPPORTED_TYPES as readonly string[], venue.slug).toContain(venue.type);
    }
  });

  it("agrees with the Website slug manifest record for record", () => {
    for (const venue of venues) {
      expect(DINING_SLUGS[venue.canonicalId], venue.canonicalId).toBe(venue.slug);
    }
    expect(new Set(venues.map((v) => v.slug)).size).toBe(venues.length);
    expect(new Set(venues.map((v) => v.canonicalId)).size).toBe(venues.length);
  });

  it("treats editorial as optional and never emits an empty shell", () => {
    const withEditorial = venues.filter((venue) => "editorial" in venue);
    expect(withEditorial).toHaveLength(13);
    expect(venues.length - withEditorial.length).toBe(49);

    for (const venue of venues) {
      if (!("editorial" in venue)) continue;
      const editorial = venue.editorial!;
      expect(editorial).not.toBeNull();
      expect(editorial.priceTier).toBeGreaterThanOrEqual(1);
      expect(editorial.priceTier).toBeLessThanOrEqual(4);
      expect(editorial.parkioScore).toBeGreaterThanOrEqual(1);
      expect(editorial.parkioScore).toBeLessThanOrEqual(10);
      expect(editorial.shortVerdict.trim()).not.toBe("");
      expect([...editorial.dietaryFlags].sort()).toEqual(editorial.dietaryFlags);
    }
  });

  it("keeps factual-only venues as complete, usable records", () => {
    for (const venue of venues) {
      if ("editorial" in venue) continue;
      expect(venue.canonicalId).toBeTruthy();
      expect(venue.slug).toBeTruthy();
      expect(venue.name.trim()).not.toBe("");
      expect(venue.land.trim()).not.toBe("");
      expect(venue.parkId).toBeTruthy();
      expect(venue.type).toBeTruthy();
    }
  });

  it("carries valid coordinates where present, and pairs them", () => {
    const located = venues.filter((venue) => "latitude" in venue);
    expect(located).toHaveLength(56);
    expect(venues.length - located.length).toBe(6);

    for (const venue of venues) {
      expect("latitude" in venue).toBe("longitude" in venue);
      if (!("latitude" in venue)) continue;
      expect(Number.isFinite(venue.latitude!)).toBe(true);
      expect(Number.isFinite(venue.longitude!)).toBe(true);
      expect(Math.abs(venue.latitude!)).toBeLessThanOrEqual(90);
      expect(Math.abs(venue.longitude!)).toBeLessThanOrEqual(180);
      expect(venue.latitude === 0 && venue.longitude === 0).toBe(false);
    }
  });

  it("carries external IDs where present, never in a slug", () => {
    const identified = venues.filter((venue) => "externalId" in venue);
    expect(identified).toHaveLength(57);
    expect(venues.length - identified.length).toBe(5);
    for (const venue of identified) {
      expect(venue.externalId).toMatch(/^[0-9a-f-]{36}$/);
      expect(venue.slug).not.toContain(venue.externalId!);
    }
  });

  it("is ordered deterministically by parkId then slug", () => {
    const keys = venues.map((venue) => `${venue.parkId}|${venue.slug}`);
    expect(keys).toEqual([...keys].sort());
  });

  it("is committed as its own canonical serialization", () => {
    const committed = readFileSync("lib/generated/dining.json", "utf8");
    expect(serialize(dataset as never)).toBe(committed);
    expect(committed.endsWith("\n")).toBe(true);
    expect(committed).not.toContain("\r\n");
  });
});

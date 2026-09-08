import { describe, expect, it } from "vitest";

import { RIDES, getRide } from "@/lib/data";
import {
  RELATED_ATTRACTION_LIMIT,
  relatedAttractions,
} from "@/lib/relatedAttractions";

describe("relatedAttractions", () => {
  it("never includes the current attraction", () => {
    for (const ride of RIDES) {
      const related = relatedAttractions(ride);
      expect(related.some((r) => r.ride.id === ride.id), ride.id).toBe(false);
    }
  });

  it("never crosses parks", () => {
    for (const ride of RIDES) {
      for (const entry of relatedAttractions(ride)) {
        expect(entry.ride.parkId, `${ride.id} → ${entry.ride.id}`).toBe(
          ride.parkId,
        );
      }
    }
  });

  it("prioritises the same land before anything further away", () => {
    const rise = getRide("hs-rise")!; // Galaxy's Edge
    const related = relatedAttractions(rise);
    expect(related[0].ride.id).toBe("hs-millennium");
    expect(related[0].sameLand).toBe(true);

    // Once same-land entries are exhausted, the rest must not be same-land.
    const firstOtherLand = related.findIndex((r) => !r.sameLand);
    if (firstOtherLand !== -1) {
      for (const entry of related.slice(firstOtherLand)) {
        expect(entry.sameLand).toBe(false);
      }
    }
  });

  it("groups EPCOT World Showcase pavilions by their own land", () => {
    const frozen = getRide("ep-frozen")!; // World Showcase — Norway (only ride there)
    const related = relatedAttractions(frozen);
    expect(related.every((r) => r.ride.parkId === "epcot")).toBe(true);
    // Norway has no second attraction, so nothing should claim sameLand.
    expect(related.some((r) => r.sameLand)).toBe(false);
  });

  it("is deterministic — repeated calls return the identical order", () => {
    for (const ride of RIDES) {
      const a = relatedAttractions(ride).map((r) => r.ride.id);
      const b = relatedAttractions(ride).map((r) => r.ride.id);
      expect(b, ride.id).toEqual(a);
    }
  });

  it("caps the visible set", () => {
    for (const ride of RIDES) {
      expect(relatedAttractions(ride).length, ride.id).toBeLessThanOrEqual(
        RELATED_ATTRACTION_LIMIT,
      );
    }
    expect(relatedAttractions(getRide("ep-guardians")!, 2)).toHaveLength(2);
    expect(relatedAttractions(getRide("ep-guardians")!, 0)).toHaveLength(0);
  });

  it("returns no duplicates", () => {
    for (const ride of RIDES) {
      const ids = relatedAttractions(ride).map((r) => r.ride.id);
      expect(new Set(ids).size, ride.id).toBe(ids.length);
    }
  });

  it("handles a park with only a handful of attractions", () => {
    // Animal Kingdom has 5 rides, so any one of them has 4 candidates.
    const safari = RIDES.find((r) => r.parkId === "animal-kingdom")!;
    expect(relatedAttractions(safari).length).toBe(4);
  });
});

import { describe, expect, it } from "vitest";

import { planningNotes } from "@/components/attraction/AttractionPlanningNotes";
import { RIDES, getPark, getRide } from "@/lib/data";
import { isTopRide } from "@/lib/popularity";
import type { Park, Ride } from "@/lib/types";

function pair(parkId: string, slug: string): { park: Park; ride: Ride } {
  return { park: getPark(parkId)!, ride: getRide(slug)! };
}

describe("planningNotes", () => {
  it("flags a curated headline attraction", () => {
    const { park, ride } = pair("epcot", "ep-guardians");
    const notes = planningNotes(park, ride);
    expect(notes.some((n) => n.includes("headline attractions"))).toBe(true);
    expect(notes.some((n) => n.includes("EPCOT"))).toBe(true);
  });

  it("does not flag a non-curated attraction as a headliner", () => {
    const { park, ride } = pair("epcot", "ep-gran-fiesta");
    expect(isTopRide("epcot", "ep-gran-fiesta")).toBe(false);
    expect(
      planningNotes(park, ride).some((n) => n.includes("headline")),
    ).toBe(false);
  });

  it("adds a height note when a restriction exists", () => {
    const { park, ride } = pair("hollywood-studios", "hs-rocknroller");
    const notes = planningNotes(park, ride);
    expect(notes.some((n) => n.includes('48" (122 cm) minimum'))).toBe(true);
  });

  it("quotes the height phrase without repeating its wording", () => {
    for (const ride of RIDES) {
      const park = getPark(ride.parkId)!;
      for (const note of planningNotes(park, ride)) {
        // e.g. never "minimum height of 42\" (107 cm) minimum"
        expect(note.match(/minimum/gi)?.length ?? 0, note).toBeLessThanOrEqual(1);
      }
    }
  });

  it("adds no height note when the attraction has no restriction", () => {
    const { park, ride } = pair("epcot", "ep-spaceship-earth");
    expect(ride.height).toBeUndefined();
    expect(
      planningNotes(park, ride).some((n) => n.includes("Height requirement")),
    ).toBe(false);
  });

  it("renders nothing rather than inventing a note", () => {
    const { park, ride } = pair("epcot", "ep-spaceship-earth");
    // Not curated, no height restriction — so there is nothing to say.
    expect(isTopRide("epcot", "ep-spaceship-earth")).toBe(false);
    expect(planningNotes(park, ride)).toHaveLength(0);
  });

  it("never makes a claim the dataset cannot support", () => {
    const forbidden =
      /rope drop|motion sick|must-do|scary|sells out|toddler|skip if|best time/i;
    for (const ride of RIDES) {
      const park = getPark(ride.parkId)!;
      for (const note of planningNotes(park, ride)) {
        expect(note, `${ride.id}: ${note}`).not.toMatch(forbidden);
      }
    }
  });

  it("emits at most one note per supported source", () => {
    for (const ride of RIDES) {
      const park = getPark(ride.parkId)!;
      expect(planningNotes(park, ride).length, ride.id).toBeLessThanOrEqual(2);
    }
  });
});

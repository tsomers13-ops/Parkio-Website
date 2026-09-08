import { describe, expect, it } from "vitest";

import { PARKS, RIDES, getRidesForPark } from "@/lib/data";
import {
  groupRidesByLand,
  hasPavilionDetail,
  pavilionName,
  planningLand,
} from "@/lib/lands";
import type { ParkId } from "@/lib/types";

const epcotRides = getRidesForPark("epcot");
const dhsRides = getRidesForPark("hollywood-studios");

describe("the separator assumption this module rests on", () => {
  it("is only used by World Showcase today", () => {
    // If this ever fails, a new "{X} — {Y}" convention has appeared and
    // the grouping rule needs re-examining rather than blind reuse.
    const dashed = [...new Set(RIDES.map((r) => r.land))].filter((l) =>
      l.includes("—"),
    );
    expect(dashed.sort()).toEqual([
      "World Showcase — France",
      "World Showcase — Mexico",
      "World Showcase — Norway",
    ]);
  });

  it("finds no other dash convention in any land value", () => {
    for (const land of new Set(RIDES.map((r) => r.land))) {
      if (land.includes("—")) continue;
      expect(land, land).not.toMatch(/[-–]/);
    }
  });
});

describe("planningLand", () => {
  it("collapses World Showcase pavilions to the neighbourhood", () => {
    expect(planningLand("World Showcase — Norway")).toBe("World Showcase");
    expect(planningLand("World Showcase — France")).toBe("World Showcase");
    expect(planningLand("World Showcase — Mexico")).toBe("World Showcase");
  });

  it("leaves an ordinary land untouched", () => {
    expect(planningLand("Toy Story Land")).toBe("Toy Story Land");
    expect(planningLand("World Discovery")).toBe("World Discovery");
    expect(planningLand("Galaxy's Edge")).toBe("Galaxy's Edge");
  });

  it("never mutates the canonical ride data", () => {
    const before = RIDES.map((r) => r.land);
    groupRidesByLand(RIDES);
    expect(RIDES.map((r) => r.land)).toEqual(before);
    // The pavilion is still on the ride itself, for the attraction page.
    expect(RIDES.find((r) => r.id === "ep-frozen")!.land).toBe(
      "World Showcase — Norway",
    );
  });
});

describe("pavilionName / hasPavilionDetail", () => {
  it("extracts the pavilion when there is one", () => {
    expect(pavilionName("World Showcase — Norway")).toBe("Norway");
    expect(hasPavilionDetail("World Showcase — Norway")).toBe(true);
  });

  it("returns null for a plain land", () => {
    expect(pavilionName("Toy Story Land")).toBeNull();
    expect(hasPavilionDetail("Toy Story Land")).toBe(false);
  });
});

describe("EPCOT grouping", () => {
  it("has 11 attractions across 6 raw lands", () => {
    expect(epcotRides).toHaveLength(11);
    expect(new Set(epcotRides.map((r) => r.land)).size).toBe(6);
  });

  it("collapses to 4 planning groups", () => {
    const groups = groupRidesByLand(epcotRides);
    expect(groups).toHaveLength(4);
    expect(groups.map((g) => g.name).sort()).toEqual([
      "World Celebration",
      "World Discovery",
      "World Nature",
      "World Showcase",
    ]);
  });

  it("puts Norway, France and Mexico together under World Showcase", () => {
    const groups = groupRidesByLand(epcotRides);
    const showcase = groups.find((g) => g.name === "World Showcase")!;
    expect(showcase.rides.map((r) => r.id).sort()).toEqual([
      "ep-frozen",
      "ep-gran-fiesta",
      "ep-remy",
    ]);
  });
});

describe("Hollywood Studios grouping", () => {
  it("has 9 attractions and needs no normalization", () => {
    expect(dhsRides).toHaveLength(9);
    const groups = groupRidesByLand(dhsRides);
    expect(groups).toHaveLength(5);
    expect(groups.map((g) => g.name).sort()).toEqual([
      "Echo Lake",
      "Galaxy's Edge",
      "Hollywood Boulevard",
      "Sunset Boulevard",
      "Toy Story Land",
    ]);
  });

  it("keeps every canonical land identical to its planning group", () => {
    for (const ride of dhsRides) {
      expect(planningLand(ride.land), ride.id).toBe(ride.land);
    }
  });
});

describe("grouping completeness for every park", () => {
  it("represents every ride exactly once, with no duplicates or losses", () => {
    for (const park of PARKS) {
      const rides = getRidesForPark(park.id as ParkId);
      const grouped = groupRidesByLand(rides).flatMap((g) => g.rides);
      expect(grouped, park.id).toHaveLength(rides.length);
      expect(new Set(grouped.map((r) => r.id)).size, park.id).toBe(
        rides.length,
      );
      for (const ride of rides) {
        expect(
          grouped.filter((r) => r.id === ride.id),
          `${park.id}/${ride.id}`,
        ).toHaveLength(1);
      }
    }
  });

  it("never mixes parks inside a group", () => {
    for (const park of PARKS) {
      for (const group of groupRidesByLand(getRidesForPark(park.id as ParkId))) {
        for (const ride of group.rides) {
          expect(ride.parkId, `${park.id}/${group.name}`).toBe(park.id);
        }
      }
    }
  });

  it("is deterministic", () => {
    for (const park of PARKS) {
      const rides = getRidesForPark(park.id as ParkId);
      const a = groupRidesByLand(rides).map(
        (g) => `${g.name}:${g.rides.map((r) => r.id).join(",")}`,
      );
      const b = groupRidesByLand(rides).map(
        (g) => `${g.name}:${g.rides.map((r) => r.id).join(",")}`,
      );
      expect(b, park.id).toEqual(a);
    }
  });
});

import { describe, expect, it } from "vitest";

import { PARKS, RIDES, getPark, getRide, getRidesForPark } from "@/lib/data";
import { getParkConfig, listSupportedParkSlugs } from "@/lib/disneyParkConfig";

describe("getPark", () => {
  it("finds a park by id", () => {
    expect(getPark("epcot")?.name).toBe(PARKS.find((p) => p.id === "epcot")!.name);
  });

  it("returns undefined for an unknown id", () => {
    expect(getPark("tokyo-disneyland")).toBeUndefined();
  });
});

describe("getRidesForPark", () => {
  it("returns only that park's rides", () => {
    const rides = getRidesForPark("animal-kingdom");
    expect(rides.length).toBeGreaterThan(0);
    expect(rides.every((r) => r.parkId === "animal-kingdom")).toBe(true);
  });

  it("covers every supported park", () => {
    for (const slug of listSupportedParkSlugs()) {
      expect(
        getRidesForPark(slug as Parameters<typeof getRidesForPark>[0]).length,
        slug,
      ).toBeGreaterThan(0);
    }
  });
});

describe("getRide", () => {
  it("finds a ride by id", () => {
    expect(getRide("mk-pirates")?.parkId).toBe("magic-kingdom");
  });

  it("returns undefined for an unknown id", () => {
    expect(getRide("mk-nope")).toBeUndefined();
  });
});

describe("dataset integrity", () => {
  it("has unique park and ride ids", () => {
    expect(new Set(PARKS.map((p) => p.id)).size).toBe(PARKS.length);
    expect(new Set(RIDES.map((r) => r.id)).size).toBe(RIDES.length);
  });

  it("has unique themeparks.wiki external ids per ride", () => {
    expect(new Set(RIDES.map((r) => r.externalId)).size).toBe(RIDES.length);
  });

  it("points every ride at a supported park", () => {
    for (const ride of RIDES) {
      expect(getParkConfig(ride.parkId), ride.id).toBeDefined();
      expect(getPark(ride.parkId), ride.id).toBeDefined();
    }
  });

  it("gives every ride plausible coordinates and a positive base wait", () => {
    for (const ride of RIDES) {
      expect(Math.abs(ride.lat), ride.id).toBeLessThanOrEqual(90);
      expect(Math.abs(ride.lng), ride.id).toBeLessThanOrEqual(180);
      expect(ride.baseWait, ride.id).toBeGreaterThan(0);
    }
  });

  it("prefixes ride ids consistently per park", () => {
    const prefixes: Record<string, string> = {
      "magic-kingdom": "mk-",
      epcot: "ep-",
      "hollywood-studios": "hs-",
      "animal-kingdom": "ak-",
      disneyland: "dl-",
      "california-adventure": "dca-",
    };
    for (const ride of RIDES) {
      expect(ride.id.startsWith(prefixes[ride.parkId]!), ride.id).toBe(true);
    }
  });
});

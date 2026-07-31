import { describe, expect, it } from "vitest";

import {
  DISNEY_PARKS,
  DISNEY_RESORTS,
  getParkConfig,
  getResortConfig,
  getResortForPark,
  listSupportedParkSlugs,
} from "@/lib/disneyParkConfig";

describe("config integrity", () => {
  it("ships the six supported U.S. Disney parks", () => {
    expect(listSupportedParkSlugs()).toEqual([
      "magic-kingdom",
      "epcot",
      "hollywood-studios",
      "animal-kingdom",
      "disneyland",
      "california-adventure",
    ]);
  });

  it("has unique slugs and external ids", () => {
    expect(new Set(DISNEY_PARKS.map((p) => p.slug)).size).toBe(
      DISNEY_PARKS.length,
    );
    expect(new Set(DISNEY_PARKS.map((p) => p.externalId)).size).toBe(
      DISNEY_PARKS.length,
    );
  });

  it("points every park at an existing resort with a matching timezone", () => {
    for (const park of DISNEY_PARKS) {
      const resort = getResortConfig(park.resortSlug);
      expect(resort, park.slug).toBeDefined();
      expect(resort?.timezone).toBe(park.timezone);
      expect(resort?.parkSlugs).toContain(park.slug);
    }
  });

  it("lists only known park slugs on each resort", () => {
    const known = new Set(listSupportedParkSlugs());
    for (const resort of DISNEY_RESORTS) {
      for (const slug of resort.parkSlugs) {
        expect(known.has(slug), slug).toBe(true);
      }
    }
  });
});

describe("getParkConfig", () => {
  it("looks a park up by slug", () => {
    expect(getParkConfig("epcot")?.name).toBe("EPCOT");
  });

  it("returns undefined for an unsupported slug", () => {
    expect(getParkConfig("tokyo-disneyland")).toBeUndefined();
  });
});

describe("getResortConfig", () => {
  it("looks a resort up by slug", () => {
    expect(getResortConfig("disneyland-resort")?.name).toBe(
      "Disneyland Resort",
    );
  });

  it("returns undefined for an unknown resort", () => {
    expect(getResortConfig("universal")).toBeUndefined();
  });
});

describe("getResortForPark", () => {
  it("resolves a park to its parent resort", () => {
    expect(getResortForPark("animal-kingdom")?.slug).toBe("walt-disney-world");
    expect(getResortForPark("california-adventure")?.slug).toBe(
      "disneyland-resort",
    );
  });

  it("returns undefined for an unknown park", () => {
    expect(getResortForPark("nowhere")).toBeUndefined();
  });
});

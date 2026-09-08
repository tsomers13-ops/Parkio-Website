import { describe, expect, it } from "vitest";

import { PARKS, RIDES } from "@/lib/data";
import {
  attractionCanonicalPath,
  attractionDescription,
  attractionStaticParams,
  attractionTitle,
  resolveAttraction,
} from "@/lib/attractionRoute";

/** Current canonical Website attraction count. */
const CANONICAL_RIDE_COUNT = 84;

describe("attractionStaticParams", () => {
  const params = attractionStaticParams();

  it("generates one tuple per canonical ride", () => {
    expect(params).toHaveLength(CANONICAL_RIDE_COUNT);
    expect(params).toHaveLength(RIDES.length);
  });

  it("emits no duplicate tuples", () => {
    const keys = params.map((p) => `${p.parkId}/${p.slug}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("represents every ride exactly once", () => {
    for (const ride of RIDES) {
      const matches = params.filter((p) => p.slug === ride.id);
      expect(matches, ride.id).toHaveLength(1);
    }
  });

  it("pairs every slug with the ride's own park — never a cross-park tuple", () => {
    for (const p of params) {
      const ride = RIDES.find((r) => r.id === p.slug);
      expect(ride, p.slug).toBeDefined();
      expect(ride!.parkId, p.slug).toBe(p.parkId);
    }
  });

  it("only names parks that exist", () => {
    const parkIds = new Set<string>(PARKS.map((p) => p.id));
    for (const p of params) {
      expect(parkIds.has(p.parkId), p.parkId).toBe(true);
    }
  });

  it("produces URL-safe slugs", () => {
    for (const p of params) {
      expect(encodeURIComponent(p.slug), p.slug).toBe(p.slug);
      expect(encodeURIComponent(p.parkId), p.parkId).toBe(p.parkId);
    }
  });

  it("resolves every generated tuple", () => {
    for (const p of params) {
      expect(resolveAttraction(p.parkId, p.slug), `${p.parkId}/${p.slug}`)
        .not.toBeNull();
    }
  });
});

describe("resolveAttraction — valid routes", () => {
  it("resolves an EPCOT attraction", () => {
    const r = resolveAttraction("epcot", "ep-guardians");
    expect(r).not.toBeNull();
    expect(r!.park.id).toBe("epcot");
    expect(r!.ride.name).toBe("Guardians of the Galaxy: Cosmic Rewind");
  });

  it("resolves a second EPCOT attraction", () => {
    const r = resolveAttraction("epcot", "ep-test-track");
    expect(r).not.toBeNull();
    expect(r!.ride.land).toBe("World Discovery");
  });

  it("resolves a Hollywood Studios attraction", () => {
    const r = resolveAttraction("hollywood-studios", "hs-rise");
    expect(r).not.toBeNull();
    expect(r!.park.id).toBe("hollywood-studios");
    expect(r!.ride.name).toBe("Rise of the Resistance");
  });

  it("resolves an attraction from another park", () => {
    const r = resolveAttraction("magic-kingdom", "mk-pirates");
    expect(r).not.toBeNull();
    expect(r!.park.id).toBe("magic-kingdom");
  });
});

describe("resolveAttraction — invalid routes must fail, not guess", () => {
  it("rejects an unknown park", () => {
    expect(resolveAttraction("tokyo-disneyland", "ep-guardians")).toBeNull();
  });

  it("rejects an unknown attraction", () => {
    expect(resolveAttraction("epcot", "ep-does-not-exist")).toBeNull();
  });

  it("rejects a Hollywood Studios attraction under EPCOT", () => {
    expect(resolveAttraction("epcot", "hs-rise")).toBeNull();
    expect(resolveAttraction("epcot", "hs-rocknroller")).toBeNull();
  });

  it("rejects an EPCOT attraction under Hollywood Studios", () => {
    expect(resolveAttraction("hollywood-studios", "ep-guardians")).toBeNull();
  });

  it("rejects every cross-park pairing across the whole dataset", () => {
    for (const ride of RIDES) {
      for (const park of PARKS) {
        if (park.id === ride.parkId) continue;
        expect(
          resolveAttraction(park.id, ride.id),
          `${park.id}/${ride.id}`,
        ).toBeNull();
      }
    }
  });

  it("rejects empty identifiers", () => {
    expect(resolveAttraction("", "ep-guardians")).toBeNull();
    expect(resolveAttraction("epcot", "")).toBeNull();
  });
});

describe("stable slug across a rename", () => {
  it("keeps hs-rocknroller as the route slug despite the display-name change", () => {
    const r = resolveAttraction("hollywood-studios", "hs-rocknroller");
    expect(r).not.toBeNull();
    expect(r!.ride.name).toBe("Rock 'n' Roller Coaster Starring The Muppets");
    expect(r!.ride.id).toBe("hs-rocknroller");
    expect(attractionCanonicalPath("hollywood-studios", "hs-rocknroller")).toBe(
      "/parks/hollywood-studios/attractions/hs-rocknroller/",
    );
  });

  it("does not expose the display name in the URL", () => {
    const params = attractionStaticParams();
    expect(params.some((p) => p.slug.includes("muppet"))).toBe(false);
  });
});

describe("metadata helpers", () => {
  const { park, ride } = resolveAttraction("epcot", "ep-guardians")!;

  it("builds the title from park and attraction facts", () => {
    expect(attractionTitle(park, ride)).toBe(
      "Guardians of the Galaxy: Cosmic Rewind — EPCOT ride guide",
    );
  });

  it("builds the description from existing editorial content only", () => {
    const description = attractionDescription(park, ride);
    expect(description.startsWith(ride.description)).toBe(true);
    expect(description).toContain(ride.land);
    expect(description).toContain(park.name);
  });

  it("emits a canonical path with the trailing slash the app serves", () => {
    for (const p of attractionStaticParams()) {
      const path = attractionCanonicalPath(p.parkId, p.slug);
      expect(path.endsWith("/"), path).toBe(true);
      expect(path, path).toBe(
        `/parks/${p.parkId}/attractions/${p.slug}/`,
      );
    }
  });

  it("produces a non-empty title and description for every attraction", () => {
    for (const p of attractionStaticParams()) {
      const resolved = resolveAttraction(p.parkId, p.slug)!;
      expect(attractionTitle(resolved.park, resolved.ride).length, p.slug)
        .toBeGreaterThan(0);
      expect(
        attractionDescription(resolved.park, resolved.ride).length,
        p.slug,
      ).toBeGreaterThan(0);
    }
  });
});

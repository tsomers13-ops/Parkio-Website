import { describe, expect, it } from "vitest";

import {
  categoryLabel,
  heightLabel,
  lightningLaneLabel,
} from "@/components/attraction/AttractionFacts";
import { RIDES } from "@/lib/data";
import type { RideCategory } from "@/lib/types";

describe("heightLabel", () => {
  it("shows a real restriction verbatim", () => {
    expect(heightLabel('48" (122 cm) minimum')).toBe('48" (122 cm) minimum');
  });

  it("states plainly that there is no restriction — never 'unknown'", () => {
    expect(heightLabel(undefined)).toBe("No height requirement");
    expect(heightLabel(undefined)).not.toMatch(/unknown|n\/a|tbd/i);
  });

  it("produces a non-empty label for every canonical ride", () => {
    for (const ride of RIDES) {
      expect(heightLabel(ride.height).length, ride.id).toBeGreaterThan(0);
    }
  });
});

describe("lightningLaneLabel", () => {
  it("uses only the two answers the boolean supports", () => {
    expect(lightningLaneLabel(true)).toBe("Available");
    expect(lightningLaneLabel(false)).toBe("Not offered");
  });

  it("never implies a tier, price, or today's availability", () => {
    for (const value of [true, false]) {
      const label = lightningLaneLabel(value);
      expect(label).not.toMatch(
        /multi pass|single pass|\$|price|tier|today|sold out/i,
      );
    }
  });
});

describe("categoryLabel", () => {
  it("renders each existing category in guest-readable form", () => {
    expect(categoryLabel("thrill")).toBe("Thrill ride");
    expect(categoryLabel("family")).toBe("Family ride");
    expect(categoryLabel("kids")).toBe("Kids ride");
    expect(categoryLabel("show")).toBe("Show");
    expect(categoryLabel("water")).toBe("Water ride");
  });

  it("covers every category present in the dataset", () => {
    const used = new Set<RideCategory>(RIDES.map((r) => r.category));
    for (const category of used) {
      expect(categoryLabel(category).length, category).toBeGreaterThan(0);
    }
  });

  it("does not invent age guidance", () => {
    for (const category of [
      "thrill",
      "family",
      "kids",
      "show",
      "water",
    ] as const) {
      expect(categoryLabel(category)).not.toMatch(
        /toddler|ages?\s?\d|years old|suitable for/i,
      );
    }
  });
});

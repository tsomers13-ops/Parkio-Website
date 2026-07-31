import { describe, expect, it } from "vitest";

import type { ApiAttraction } from "@/lib/types";
import {
  GEM_MAX_WAIT_MIN,
  HIGH_WAIT_CUTOFF_MIN,
  bestNowScore,
  isTopRide,
  partitionAttractions,
} from "@/lib/popularity";

function attraction(
  slug: string,
  waitMinutes: number | null,
  status: ApiAttraction["status"] = "OPERATING",
): ApiAttraction {
  return {
    id: `ext-${slug}`,
    slug,
    parkSlug: "magic-kingdom",
    name: slug,
    status,
    waitMinutes,
    coordinates: null,
    lastUpdated: "2026-05-04T12:00:00.000Z",
  };
}

describe("isTopRide", () => {
  it("recognizes headliners in each park", () => {
    expect(isTopRide("magic-kingdom", "mk-seven-dwarfs")).toBe(true);
    expect(isTopRide("epcot", "ep-guardians")).toBe(true);
    expect(isTopRide("hollywood-studios", "hs-rise")).toBe(true);
    expect(isTopRide("animal-kingdom", "ak-everest")).toBe(true);
    expect(isTopRide("disneyland", "dl-indy")).toBe(true);
    expect(isTopRide("california-adventure", "dca-soarin")).toBe(true);
  });

  it("is false for non-headliners and unknown parks", () => {
    expect(isTopRide("magic-kingdom", "mk-carousel")).toBe(false);
    expect(isTopRide("tokyo-disneysea", "ts-journey")).toBe(false);
  });

  it("does not leak headliners across parks", () => {
    expect(isTopRide("epcot", "mk-seven-dwarfs")).toBe(false);
  });
});

describe("bestNowScore", () => {
  it("excludes rides that are not operating", () => {
    expect(bestNowScore("magic-kingdom", attraction("mk-tron", 20, "DOWN")))
      .toBe(-Infinity);
    expect(
      bestNowScore("magic-kingdom", attraction("mk-tron", 20, "CLOSED")),
    ).toBe(-Infinity);
  });

  it("excludes rides with no reported wait", () => {
    expect(bestNowScore("magic-kingdom", attraction("mk-tron", null))).toBe(
      -Infinity,
    );
  });

  it("excludes anything above the high-wait cutoff", () => {
    expect(
      bestNowScore(
        "magic-kingdom",
        attraction("mk-tron", HIGH_WAIT_CUTOFF_MIN + 1),
      ),
    ).toBe(-Infinity);
  });

  it("scores headliners in the 940..1000 band, ascending by wait", () => {
    expect(bestNowScore("magic-kingdom", attraction("mk-tron", 0))).toBe(1000);
    expect(bestNowScore("magic-kingdom", attraction("mk-tron", 60))).toBe(940);
    expect(
      bestNowScore("magic-kingdom", attraction("mk-tron", 20)),
    ).toBeGreaterThan(bestNowScore("magic-kingdom", attraction("mk-tron", 30)));
  });

  it("lifts walk-on gems between the 30-min and 36-min headliners", () => {
    const gem = bestNowScore("magic-kingdom", attraction("mk-carousel", 5));
    expect(gem).toBe(960);
    expect(gem).toBeLessThan(
      bestNowScore("magic-kingdom", attraction("mk-tron", 30)),
    );
    expect(gem).toBeGreaterThan(
      bestNowScore("magic-kingdom", attraction("mk-tron", 45)),
    );
  });

  it("scores regular gems far below every headliner", () => {
    expect(bestNowScore("magic-kingdom", attraction("mk-carousel", 25))).toBe(
      75,
    );
    expect(
      bestNowScore("magic-kingdom", attraction("mk-carousel", 25)),
    ).toBeLessThan(bestNowScore("magic-kingdom", attraction("mk-tron", 60)));
  });

  it("drops mid-wait non-headliners out of best-now entirely", () => {
    expect(
      bestNowScore(
        "magic-kingdom",
        attraction("mk-carousel", GEM_MAX_WAIT_MIN + 1),
      ),
    ).toBe(-Infinity);
  });
});

describe("partitionAttractions", () => {
  it("returns empty buckets for an empty list", () => {
    expect(partitionAttractions("magic-kingdom", [])).toEqual({
      bestNow: [],
      goodOptions: [],
      skipForNow: [],
    });
  });

  it("orders best-now by score and never repeats a ride in good options", () => {
    const attractions = [
      attraction("mk-tron", 45),
      attraction("mk-carousel", 5),
      attraction("mk-seven-dwarfs", 20),
    ];
    const { bestNow, goodOptions } = partitionAttractions(
      "magic-kingdom",
      attractions,
    );
    expect(bestNow.map((a) => a.slug)).toEqual([
      "mk-seven-dwarfs",
      "mk-carousel",
      "mk-tron",
    ]);
    expect(goodOptions).toEqual([]);
  });

  it("caps each bucket at five entries", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      attraction(`mk-ride-${i}`, 5),
    );
    const longWaits = Array.from({ length: 9 }, (_, i) =>
      attraction(`mk-long-${i}`, 70 + i),
    );
    const result = partitionAttractions("magic-kingdom", [
      ...many,
      ...longWaits,
    ]);
    expect(result.bestNow).toHaveLength(5);
    expect(result.goodOptions).toHaveLength(5);
    expect(result.skipForNow).toHaveLength(5);
  });

  it("prioritizes overflow headliners, then mid-wait backups, then gems", () => {
    const bestNowFillers = Array.from({ length: 5 }, (_, i) =>
      attraction(`mk-filler-${i}`, i),
    );
    const result = partitionAttractions("magic-kingdom", [
      ...bestNowFillers,
      attraction("mk-pirates", 55), // overflow headliner
      attraction("mk-backup", 40), // mid-wait non-headliner
      attraction("mk-gem", 12), // overflow gem
    ]);
    expect(result.bestNow).toHaveLength(5);
    expect(result.goodOptions.map((a) => a.slug)).toEqual([
      "mk-pirates",
      "mk-backup",
      "mk-gem",
    ]);
  });

  it("sorts skip-for-now by descending wait and excludes closed rides", () => {
    const result = partitionAttractions("magic-kingdom", [
      attraction("mk-a", 75),
      attraction("mk-b", 120),
      attraction("mk-c", 90),
      attraction("mk-down", 200, "DOWN"),
      attraction("mk-nowait", null),
    ]);
    expect(result.skipForNow.map((a) => a.slug)).toEqual([
      "mk-b",
      "mk-c",
      "mk-a",
    ]);
    expect(result.bestNow).toEqual([]);
    expect(result.goodOptions).toEqual([]);
  });

  it("keeps every operating ride with a valid wait in at least one bucket", () => {
    const attractions = [
      attraction("mk-seven-dwarfs", 55),
      attraction("mk-carousel", 30),
      attraction("mk-gem", 8),
      attraction("mk-long", 95),
    ];
    const { bestNow, goodOptions, skipForNow } = partitionAttractions(
      "magic-kingdom",
      attractions,
    );
    const covered = new Set(
      [...bestNow, ...goodOptions, ...skipForNow].map((a) => a.slug),
    );
    for (const a of attractions) {
      expect(covered.has(a.slug), a.slug).toBe(true);
    }
  });
});

import { describe, expect, it } from "vitest";

import type { Ride } from "@/lib/types";
import {
  crowdColor,
  formatTime,
  simulatedWait,
  statusLabel,
  waitColorClasses,
  waitTier,
} from "@/lib/utils";

function ride(overrides: Partial<Ride> = {}): Ride {
  return {
    id: "mk-pirates",
    parkId: "magic-kingdom",
    name: "Pirates of the Caribbean",
    land: "Adventureland",
    category: "family",
    description: "Yo ho.",
    lat: 28.4183,
    lng: -81.5849,
    baseWait: 35,
    trend: "flat",
    lightningLane: true,
    externalId: "ext-pirates",
    ...overrides,
  };
}

describe("waitTier", () => {
  it("buckets at the tier boundaries", () => {
    expect(waitTier(0)).toBe("low");
    expect(waitTier(30)).toBe("low");
    expect(waitTier(31)).toBe("mid");
    expect(waitTier(60)).toBe("mid");
    expect(waitTier(61)).toBe("high");
  });
});

describe("waitColorClasses", () => {
  it("returns a distinct palette per tier", () => {
    expect(waitColorClasses("low").dot).toBe("bg-emerald-500");
    expect(waitColorClasses("mid").dot).toBe("bg-amber-500");
    expect(waitColorClasses("high").dot).toBe("bg-rose-500");
  });

  it("keeps pin and dot in sync for every tier", () => {
    for (const tier of ["low", "mid", "high"] as const) {
      const classes = waitColorClasses(tier);
      expect(classes.pin).toBe(classes.dot);
    }
  });
});

describe("crowdColor", () => {
  it("maps each crowd level to its palette", () => {
    expect(crowdColor("Low").text).toBe("text-emerald-700");
    expect(crowdColor("Moderate").text).toBe("text-amber-700");
    expect(crowdColor("High").text).toBe("text-rose-700");
  });
});

describe("simulatedWait", () => {
  it("is deterministic for the same ride and 30s time slice", () => {
    const r = ride();
    const sliceStart = 1_699_999_980_000; // exact multiple of 30_000
    expect(simulatedWait(r, sliceStart)).toBe(
      simulatedWait(r, sliceStart + 29_999),
    );
    expect(simulatedWait(r, sliceStart)).not.toBe(
      simulatedWait(r, sliceStart + 30_000),
    );
  });

  it("varies across rides", () => {
    const now = 1_700_000_000_000;
    const waits = new Set(
      ["a", "b", "c", "d", "e", "f"].map((id) =>
        simulatedWait(ride({ id }), now),
      ),
    );
    expect(waits.size).toBeGreaterThan(1);
  });

  it("always returns a multiple of 5 that is at least 5", () => {
    for (let i = 0; i < 200; i++) {
      const value = simulatedWait(ride({ id: `ride-${i}` }), i * 30_000);
      expect(value % 5).toBe(0);
      expect(value).toBeGreaterThanOrEqual(5);
    }
  });

  it("clamps a tiny base wait to the 5-minute floor", () => {
    for (let i = 0; i < 50; i++) {
      expect(
        simulatedWait(ride({ id: `low-${i}`, baseWait: 0 }), i * 30_000),
      ).toBeGreaterThanOrEqual(5);
    }
  });

  it("stays within the swing window of the base wait", () => {
    for (let i = 0; i < 100; i++) {
      const value = simulatedWait(ride({ id: `swing-${i}` }), i * 30_000);
      expect(value).toBeGreaterThanOrEqual(35 - 20);
      expect(value).toBeLessThanOrEqual(35 + 20);
    }
  });
});

describe("formatTime", () => {
  it("formats hours and minutes", () => {
    const formatted = formatTime(new Date("2026-05-04T15:07:00Z"));
    expect(formatted).toMatch(/\d{1,2}:\d{2}/);
  });

  it("defaults to now", () => {
    expect(formatTime()).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe("statusLabel", () => {
  it("uses guest-friendly wording", () => {
    expect(statusLabel("DOWN")).toBe("Down");
    expect(statusLabel("CLOSED")).toBe("Closed");
    expect(statusLabel("REFURBISHMENT")).toBe("In refurb");
    expect(statusLabel("UNKNOWN")).toBe("No data");
    expect(statusLabel("OPERATING")).toBe("Open");
  });
});

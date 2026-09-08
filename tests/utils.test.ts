import { describe, expect, it } from "vitest";

import {
  crowdColor,
  crowdLabel,
  formatTime,
  statusLabel,
  waitColorClasses,
  waitTier,
} from "@/lib/utils";

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

describe("crowdLabel", () => {
  it("frames static crowd data as typical, never as a live reading", () => {
    expect(crowdLabel("Low")).toBe("Typically quiet");
    expect(crowdLabel("Moderate")).toBe("Typically moderate");
    expect(crowdLabel("High")).toBe("Typically busy");
  });

  it("never implies a current measurement", () => {
    for (const level of ["Low", "Moderate", "High"] as const) {
      const label = crowdLabel(level);
      expect(label.startsWith("Typically")).toBe(true);
      expect(label).not.toMatch(/right now|current|live|today/i);
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

import { describe, expect, it } from "vitest";

import { getTodayLandingDate } from "@/lib/seoLandingDate";

describe("getTodayLandingDate", () => {
  it("formats both representations in Eastern time", () => {
    expect(getTodayLandingDate(new Date("2026-05-04T16:00:00Z"))).toEqual({
      iso: "2026-05-04",
      long: "Monday, May 4, 2026",
    });
  });

  it("still reports the previous Eastern day just after UTC midnight", () => {
    // 2026-05-05T02:00Z is 2026-05-04 22:00 in New York.
    expect(getTodayLandingDate(new Date("2026-05-05T02:00:00Z")).iso).toBe(
      "2026-05-04",
    );
  });

  it("rolls over at Eastern midnight", () => {
    expect(getTodayLandingDate(new Date("2026-05-05T04:00:00Z")).iso).toBe(
      "2026-05-05",
    );
  });

  it("handles standard time (UTC-5) in winter", () => {
    expect(getTodayLandingDate(new Date("2026-01-15T04:30:00Z"))).toEqual({
      iso: "2026-01-14",
      long: "Wednesday, January 14, 2026",
    });
  });

  it("defaults to the current time", () => {
    expect(getTodayLandingDate().iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

import { describe, expect, it } from "vitest";
import { getEasternWallClock, isTargetEasternMinute, easternDateKey } from "../src/easternTime";

// US DST in 2026: starts Sun Mar 8 2026 (second Sunday in March), ends
// Sun Nov 1 2026 (first Sunday in November). These exact dates are what
// every test below is anchored to, rather than assuming a fixed offset.

describe("getEasternWallClock — EDT (summer, UTC-4)", () => {
  it("computes the correct Eastern hour/minute from a known UTC instant", () => {
    // 2026-07-15T14:30:00Z -> 10:30 AM EDT
    const clock = getEasternWallClock(new Date("2026-07-15T14:30:00Z"));
    expect(clock).toMatchObject({ year: 2026, month: 7, day: 15, hour: 10, minute: 30, utcOffsetHours: -4 });
  });

  it("10:45 UTC lands on 6:45 AM EDT — the dispatch cron's EDT-bracket tick", () => {
    const clock = getEasternWallClock(new Date("2026-07-15T10:45:00Z"));
    expect(clock.hour).toBe(6);
    expect(clock.minute).toBe(45);
    expect(clock.utcOffsetHours).toBe(-4);
  });
});

describe("getEasternWallClock — EST (winter, UTC-5)", () => {
  it("computes the correct Eastern hour/minute from a known UTC instant", () => {
    // 2026-01-15T14:30:00Z -> 9:30 AM EST
    const clock = getEasternWallClock(new Date("2026-01-15T14:30:00Z"));
    expect(clock).toMatchObject({ year: 2026, month: 1, day: 15, hour: 9, minute: 30, utcOffsetHours: -5 });
  });

  it("11:45 UTC lands on 6:45 AM EST — the dispatch cron's EST-bracket tick", () => {
    const clock = getEasternWallClock(new Date("2026-01-15T11:45:00Z"));
    expect(clock.hour).toBe(6);
    expect(clock.minute).toBe(45);
    expect(clock.utcOffsetHours).toBe(-5);
  });
});

describe("getEasternWallClock — DST transitions (2026 US rules)", () => {
  it("the day BEFORE spring-forward (2026-03-07) is still EST (UTC-5)", () => {
    const clock = getEasternWallClock(new Date("2026-03-07T16:00:00Z"));
    expect(clock.utcOffsetHours).toBe(-5);
  });

  it("the day OF spring-forward (2026-03-08), after 2 AM local, is EDT (UTC-4)", () => {
    // 2026-03-08T16:00:00Z = noon EDT, well after the 2am local changeover
    const clock = getEasternWallClock(new Date("2026-03-08T16:00:00Z"));
    expect(clock.utcOffsetHours).toBe(-4);
  });

  it("the day BEFORE fall-back (2026-10-31) is still EDT (UTC-4)", () => {
    const clock = getEasternWallClock(new Date("2026-10-31T16:00:00Z"));
    expect(clock.utcOffsetHours).toBe(-4);
  });

  it("the day OF fall-back (2026-11-01), after 2 AM local, is EST (UTC-5)", () => {
    const clock = getEasternWallClock(new Date("2026-11-01T16:00:00Z"));
    expect(clock.utcOffsetHours).toBe(-5);
  });

  it("isTargetEasternMinute correctly flips which UTC bracket matches 6:45 AM ET across the spring-forward boundary", () => {
    // Before the transition (EST): 11:45 UTC is the match, 10:45 is not.
    expect(isTargetEasternMinute(new Date("2026-03-07T11:45:00Z"), 6, 45)).toBe(true);
    expect(isTargetEasternMinute(new Date("2026-03-07T10:45:00Z"), 6, 45)).toBe(false);

    // After the transition (EDT): 10:45 UTC is the match, 11:45 is not.
    expect(isTargetEasternMinute(new Date("2026-03-09T10:45:00Z"), 6, 45)).toBe(true);
    expect(isTargetEasternMinute(new Date("2026-03-09T11:45:00Z"), 6, 45)).toBe(false);
  });

  it("isTargetEasternMinute correctly flips back across the fall-back boundary", () => {
    // Before the transition (EDT): 10:45 UTC matches.
    expect(isTargetEasternMinute(new Date("2026-10-31T10:45:00Z"), 6, 45)).toBe(true);

    // After the transition (EST): 11:45 UTC matches instead.
    expect(isTargetEasternMinute(new Date("2026-11-02T11:45:00Z"), 6, 45)).toBe(true);
    expect(isTargetEasternMinute(new Date("2026-11-02T10:45:00Z"), 6, 45)).toBe(false);
  });
});

describe("isTargetEasternMinute — the non-matching bracket tick is a correct no-op", () => {
  it("returns false when neither hour nor minute match", () => {
    expect(isTargetEasternMinute(new Date("2026-07-15T18:00:00Z"), 6, 45)).toBe(false);
  });
});

describe("easternDateKey", () => {
  it("formats as YYYY-MM-DD in Eastern local terms, not UTC", () => {
    // 2026-01-01T03:00:00Z is still 2025-12-31 10:00 PM EST — the Eastern
    // calendar date must be 2025-12-31, not the UTC date 2026-01-01.
    expect(easternDateKey(new Date("2026-01-01T03:00:00Z"))).toBe("2025-12-31");
  });

  it("matches the UTC date when well clear of the midnight boundary", () => {
    expect(easternDateKey(new Date("2026-07-15T14:30:00Z"))).toBe("2026-07-15");
  });
});

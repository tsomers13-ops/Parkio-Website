import { describe, expect, it } from "vitest";
import { checkMissedPublication, expectedSlugFor } from "../src/missedPublicationCheck";

const SAMPLE_FEED_WITH_TODAY = `<?xml version="1.0"?><rss><channel>
  <item><title>Parkio Daily for October 12, 2026</title><link>https://parkio.info/guide/parkio-daily-2026-10-12/</link></item>
  <item><title>Parkio Daily for October 11, 2026</title><link>https://parkio.info/guide/parkio-daily-2026-10-11/</link></item>
</channel></rss>`;

const SAMPLE_FEED_WITHOUT_TODAY = `<?xml version="1.0"?><rss><channel>
  <item><title>Parkio Daily for October 11, 2026</title><link>https://parkio.info/guide/parkio-daily-2026-10-11/</link></item>
</channel></rss>`;

describe("expectedSlugFor", () => {
  it("builds the slug from the Eastern calendar date", () => {
    expect(expectedSlugFor(new Date("2026-10-12T14:00:00Z"))).toBe("parkio-daily-2026-10-12");
  });

  it("uses the Eastern date, not the UTC date, right at the 7:15 AM EDT fallback-check moment", () => {
    // 2026-10-12T11:15:00Z is 7:15 AM EDT on 2026-10-12 — UTC and Eastern
    // agree here, so this also confirms the slug the fallback check will
    // actually look for in the feed matches the day it's checking for.
    expect(expectedSlugFor(new Date("2026-10-12T11:15:00Z"))).toBe("parkio-daily-2026-10-12");
  });

  it("would use YESTERDAY's Eastern date if ever invoked right after UTC midnight — confirms the date source is genuinely Eastern-local, not UTC", () => {
    // 2026-10-12T03:00:00Z is still 2026-10-11, 11:00 PM EDT.
    expect(expectedSlugFor(new Date("2026-10-12T03:00:00Z"))).toBe("parkio-daily-2026-10-11");
  });
});

describe("checkMissedPublication — using the real deployed fallback time, 7:15 AM Eastern", () => {
  it("does not alert before the fallback time, even if the article is missing", () => {
    // 7:00 AM ET, fallback is 7:15 AM ET — too early to call it missed.
    const now = new Date("2026-10-12T11:00:00Z"); // 7:00 AM EDT
    const check = checkMissedPublication(now, SAMPLE_FEED_WITHOUT_TODAY, "parkio-daily-2026-10-12", 7, 15);
    expect(check.shouldAlert).toBe(false);
    expect(check.reason).toContain("too early");
  });

  it("does not alert after the fallback time if the article IS in the feed", () => {
    const now = new Date("2026-10-12T11:30:00Z"); // 7:30 AM EDT
    const check = checkMissedPublication(now, SAMPLE_FEED_WITH_TODAY, "parkio-daily-2026-10-12", 7, 15);
    expect(check.shouldAlert).toBe(false);
    expect(check.reason).toContain("already contains");
  });

  it("alerts after the fallback time if the article is still missing", () => {
    const now = new Date("2026-10-12T11:30:00Z"); // 7:30 AM EDT
    const check = checkMissedPublication(now, SAMPLE_FEED_WITHOUT_TODAY, "parkio-daily-2026-10-12", 7, 15);
    expect(check.shouldAlert).toBe(true);
    expect(check.reason).toContain("parkio-daily-2026-10-12");
    expect(check.reason).toContain("07:15");
  });

  it("alerts exactly at the fallback minute, not only strictly after it", () => {
    const now = new Date("2026-10-12T11:15:00Z"); // exactly 7:15 AM EDT
    const check = checkMissedPublication(now, SAMPLE_FEED_WITHOUT_TODAY, "parkio-daily-2026-10-12", 7, 15);
    expect(check.shouldAlert).toBe(true);
  });

  it("correctly identifies a stale feed (yesterday's entry only) as missing today's article even late in the day", () => {
    const now = new Date("2026-10-12T20:00:00Z"); // 4:00 PM EDT
    const check = checkMissedPublication(now, SAMPLE_FEED_WITHOUT_TODAY, "parkio-daily-2026-10-12", 7, 15);
    expect(check.shouldAlert).toBe(true);
  });
});

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
});

describe("checkMissedPublication", () => {
  it("does not alert before the fallback time, even if the article is missing", () => {
    // 8:00 AM ET, fallback is 9:00 AM ET — too early to call it missed.
    const now = new Date("2026-10-12T12:00:00Z"); // 8:00 AM EDT
    const check = checkMissedPublication(now, SAMPLE_FEED_WITHOUT_TODAY, "parkio-daily-2026-10-12", 9, 0);
    expect(check.shouldAlert).toBe(false);
    expect(check.reason).toContain("too early");
  });

  it("does not alert after the fallback time if the article IS in the feed", () => {
    const now = new Date("2026-10-12T13:30:00Z"); // 9:30 AM EDT
    const check = checkMissedPublication(now, SAMPLE_FEED_WITH_TODAY, "parkio-daily-2026-10-12", 9, 0);
    expect(check.shouldAlert).toBe(false);
    expect(check.reason).toContain("already contains");
  });

  it("alerts after the fallback time if the article is still missing", () => {
    const now = new Date("2026-10-12T13:30:00Z"); // 9:30 AM EDT
    const check = checkMissedPublication(now, SAMPLE_FEED_WITHOUT_TODAY, "parkio-daily-2026-10-12", 9, 0);
    expect(check.shouldAlert).toBe(true);
    expect(check.reason).toContain("parkio-daily-2026-10-12");
    expect(check.reason).toContain("09:00");
  });

  it("alerts exactly at the fallback minute, not only strictly after it", () => {
    const now = new Date("2026-10-12T13:00:00Z"); // exactly 9:00 AM EDT
    const check = checkMissedPublication(now, SAMPLE_FEED_WITHOUT_TODAY, "parkio-daily-2026-10-12", 9, 0);
    expect(check.shouldAlert).toBe(true);
  });

  it("correctly identifies a stale feed (yesterday's entry only) as missing today's article even late in the day", () => {
    const now = new Date("2026-10-12T20:00:00Z"); // 4:00 PM EDT
    const check = checkMissedPublication(now, SAMPLE_FEED_WITHOUT_TODAY, "parkio-daily-2026-10-12", 9, 0);
    expect(check.shouldAlert).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import { buildPrompt, weekdayForIssueDate } from "../scripts/parkio-daily/build.mjs";

function promptFor(etDate: string) {
  return buildPrompt({
    etDate,
    slug: `parkio-daily-${etDate}`,
    rssText: "",
    additionalText: "",
    parksJson: "{}",
    videosJson: "[]",
    totalRssItems: 12,
  });
}

describe("buildPrompt — issue date and status wording", () => {
  it("names the ET weekday of the issue date", () => {
    expect(weekdayForIssueDate("2026-11-24")).toBe("Tuesday");
    expect(weekdayForIssueDate("2026-11-22")).toBe("Sunday");

    const tuesday = promptFor("2026-11-24");
    expect(tuesday).toContain("Tuesday, 2026-11-24 (America/New_York)");

    const sunday = promptFor("2026-11-22");
    expect(sunday).toContain("Sunday, 2026-11-22 (America/New_York)");
  });

  it("does not call the destinations directory live park status or use a same-day reopen example", () => {
    const prompt = promptFor("2026-11-24");
    expect(prompt).not.toContain("live park status");
    expect(prompt).not.toContain("reopens today");
    expect(prompt).toContain("resort and park directory, not live ride status");
    expect(prompt).toContain("from Monday's report");
  });
});

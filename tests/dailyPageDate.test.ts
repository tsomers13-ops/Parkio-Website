import { describe, expect, it } from "vitest";
import { checkDailyPost, blockingFindings } from "../scripts/parkio-daily/factcheck.mjs";
import { augmentEvidence, extractPublishedDate } from "../scripts/parkio-daily/pageDate.mjs";

const META = `<html><head><meta property="article:published_time" content="2026-11-19T15:00:00+00:00"></head></html>`;
const JSON_LD = `<html><head><script type="application/ld+json">{"@graph":[{"@type":"NewsArticle","datePublished":"2026-11-19T15:00:00Z"}]}</script></head></html>`;
const TIME = `<html><body><time datetime="2026-11-18T12:00:00Z">updated</time><time itemprop="datePublished" datetime="2026-11-19T15:00:00Z">published</time></body></html>`;

function post(title: string, url = "https://example.com/story") {
  return {
    date: "2026-11-19",
    title: "t",
    teaser: "Quiet.",
    sections: {
      breaking: [{ title, body: "The bar is serving guests.", source: { label: "Example", url } }],
    },
  };
}

describe("extractPublishedDate", () => {
  it("reads article:published_time first", () => {
    const found = extractPublishedDate(META);
    expect(found?.method).toBe("article:published_time");
    expect(found?.raw).toBe("2026-11-19T15:00:00+00:00");
    expect(found?.etDate).toBe("2026-11-19");
  });

  it("reads JSON-LD datePublished inside @graph", () => {
    const found = extractPublishedDate(JSON_LD);
    expect(found?.method).toBe("json-ld:datePublished");
    expect(found?.etDate).toBe("2026-11-19");
  });

  it("prefers a time marked datePublished over another datetime", () => {
    const found = extractPublishedDate(TIME);
    expect(found?.method).toBe("time:datetime");
    expect(found?.raw).toBe("2026-11-19T15:00:00Z");
    expect(found?.etDate).toBe("2026-11-19");
  });

  it("keeps a date-only value on that calendar date", () => {
    const found = extractPublishedDate(`<meta property="article:published_time" content="2026-11-19">`);
    expect(found?.etDate).toBe("2026-11-19");
  });
});

describe("cited URL missing from the feed", () => {
  const briefing = post("Bountiful Valley Brews opens today at California Adventure");

  it("passes when the page date is the issue date", async () => {
    const { evidence } = await augmentEvidence(briefing, { version: 1, skipped: false, items: [] }, {
      fetchPage: async () => ({ ok: true, status: 200, html: META }),
    });
    const { findings } = checkDailyPost(briefing, { evidence });
    expect(findings.filter((f) => f.rule === "c-source-date" || f.rule === "unverifiable")).toEqual([]);
  });

  it("is a contradiction when the page date is the previous day", async () => {
    const html = `<meta property="article:published_time" content="2026-11-18T15:00:00+00:00">`;
    const { evidence } = await augmentEvidence(briefing, { version: 1, skipped: false, items: [] }, {
      fetchPage: async () => ({ ok: true, status: 200, html }),
    });
    const { findings } = checkDailyPost(briefing, { evidence });
    expect(findings.some((f) => f.rule === "c-source-date" && f.class === "contradiction")).toBe(true);
    expect(findings.some((f) => f.rule === "unverifiable")).toBe(false);
  });

  it("turns a 403 into unverifiable, not a contradiction", async () => {
    const { evidence } = await augmentEvidence(briefing, { version: 1, skipped: false, items: [] }, {
      fetchPage: async () => ({ ok: false, status: 403 }),
    });
    const { findings } = checkDailyPost(briefing, { evidence });
    expect(findings.some((f) => f.rule === "unverifiable" && /403/.test(f.evidence))).toBe(true);
    expect(findings.some((f) => f.rule === "c-source-date")).toBe(false);
  });

  it("turns a timeout into unverifiable", async () => {
    const { evidence } = await augmentEvidence(briefing, { version: 1, skipped: false, items: [] }, {
      fetchPage: async () => {
        const err = new Error("The operation was aborted due to timeout");
        err.name = "TimeoutError";
        throw err;
      },
    });
    const { findings } = checkDailyPost(briefing, { evidence });
    expect(findings.some((f) => f.rule === "unverifiable" && /timeout/.test(f.evidence))).toBe(true);
    expect(findings.some((f) => f.class === "contradiction" && f.rule === "c-source-date")).toBe(false);
  });

  it("turns a page with no date into unverifiable", async () => {
    const { evidence } = await augmentEvidence(briefing, { version: 1, skipped: false, items: [] }, {
      fetchPage: async () => ({ ok: true, status: 200, html: "<html><title>No date</title></html>" }),
    });
    const { findings } = checkDailyPost(briefing, { evidence });
    expect(findings.some((f) => f.rule === "unverifiable" && /no-date/.test(f.evidence))).toBe(true);
  });
});

describe("unverifiable config", () => {
  const findings = [
    { id: "c-source-date:1", rule: "c-source-date", class: "contradiction", path: "t", text: "down today", evidence: "e" },
    { id: "unverifiable:2", rule: "unverifiable", class: "unverifiable", path: "t", text: "opens today", evidence: "403" },
  ];

  it("reports unverifiable findings unless that key is hold, separate from date checks", () => {
    expect(blockingFindings(findings, { unverifiable: "report", dateChecks: "report" })).toEqual([]);
    const heldUnverifiable = blockingFindings(findings, { unverifiable: "hold", dateChecks: "report" }) as Array<{ rule: string }>;
    expect(heldUnverifiable.map((f) => f.rule)).toEqual(["unverifiable"]);
    const heldDates = blockingFindings(findings, { unverifiable: "report", dateChecks: "block" }) as Array<{ rule: string }>;
    expect(heldDates.map((f) => f.rule)).toEqual(["c-source-date"]);
    expect(findings.find((f) => f.rule === "unverifiable")?.class).toBe("unverifiable");
  });
});

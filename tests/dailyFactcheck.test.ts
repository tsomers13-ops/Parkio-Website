import { describe, expect, it } from "vitest";

import {
  applyCuts,
  checkerRequest as checkerRequestJs,
  collectItems,
  decide as decideJs,
  findWeekdayDateMismatches,
  isHedged,
  isRisky,
  parseVerdicts,
  renderReport as renderReportJs,
} from "../scripts/parkio-daily/verify.mjs";
import { buildCalendar, buildPrompt, finalText } from "../scripts/parkio-daily/build.mjs";

// verify.mjs is plain JavaScript, so TypeScript infers its parameter and
// return types from default values (e.g. `checkedIds = []` becomes never[]).
// These loose aliases let the tests pass the shapes the code really takes.
const checkerRequest = checkerRequestJs as (opts: { prompt: string; useThemeParks: boolean }) => {
  body: any;
  betas: string[];
};
const decide = decideJs as (args: any) => any;
const renderReport = renderReportJs as (args: any) => string;

const post = {
  title: "Parkio Daily",
  slug: "parkio-daily-2026-11-25",
  date: "2026-11-25",
  teaser: "Jingle Bell Jamboree returns Friday, November 28 at Magic Kingdom.",
  sections: {
    breaking: [],
    bignews: [
      {
        title: "Holiday party adds dates",
        body: "Disney added two party nights in December.",
        source: { label: "Disney Parks Blog", url: "https://disneyparksblog.com/x" },
        parkioInsight: { category: "opportunity", text: "Book early." },
      },
      {
        title: "New popcorn bucket",
        body: "WDWNT reports a new bucket at EPCOT for $35.",
        source: { label: "WDWNT", url: "https://wdwnt.com/y" },
        parkioInsight: { category: "opportunity", text: "Go early." },
      },
    ],
    topstories: [
      { title: "A quiet stroll", body: "Main Street lights look lovely at dusk.", parkioInsight: { category: "opportunity", text: "Bring a camera." } },
    ],
    icymi: [],
    spotlight: [],
  },
};

describe("fact-check — code check for weekday/date pairs", () => {
  it("catches a weekday that does not match the date", () => {
    const found = findWeekdayDateMismatches("returns Friday, November 28", "2026-11-25");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ stated: "Friday", actual: "Saturday", date: "2026-11-28" });
  });

  it("accepts correct pairs, abbreviations and ordinals", () => {
    expect(findWeekdayDateMismatches("Saturday, November 28", "2026-11-25")).toEqual([]);
    expect(findWeekdayDateMismatches("Tuesday Dec. 1st", "2026-11-25")).toEqual([]);
  });

  it("reads a January date in a late-December issue as next year", () => {
    // 2027-01-02 is a Saturday; 2026-01-02 was a Friday.
    expect(findWeekdayDateMismatches("Saturday, January 2", "2026-12-28")).toEqual([]);
    expect(findWeekdayDateMismatches("Friday, January 2", "2026-12-28")).toHaveLength(1);
  });

  it("matches the calendar the writer is given", () => {
    const cal = buildCalendar("2026-11-25", { back: 0, ahead: 3 });
    expect(cal).toContain("2026-11-28 = Saturday, November 28");
    expect(cal).toContain("2026-11-25 = Wednesday, November 25  <- issue date");
  });
});

describe("fact-check — what gets sent to the checker", () => {
  it("always checks the teaser and the lead, and skips items with no facts to check", () => {
    const items = collectItems(post);
    expect(items.map((i) => i.id)).toEqual(["teaser", "bignews-0", "bignews-1", "topstories-0"]);
    expect(items.find((i) => i.id === "bignews-0")?.isLead).toBe(true);
    const risky = items.filter(isRisky).map((i) => i.id);
    expect(risky).toContain("teaser");
    expect(risky).toContain("bignews-0");
    expect(risky).toContain("bignews-1"); // has a price
    expect(risky).not.toContain("topstories-0");
  });

  it("limits web tools to Disney and the five source blogs, and adds ThemeParks.wiki over MCP", () => {
    const { body, betas } = checkerRequest({ prompt: "x", useThemeParks: true });
    expect(body.model).toBe("claude-sonnet-5-5");
    const fetchTool = body.tools.find((t: { name?: string }) => t.name === "web_fetch");
    expect(fetchTool.allowed_domains).toContain("disneyparksblog.com");
    expect(fetchTool.allowed_domains).toContain("wdwnt.com");
    expect(body.mcp_servers[0].url).toBe("https://api.themeparks.wiki/mcp");
    expect(body.tools.some((t: { type: string }) => t.type === "mcp_toolset")).toBe(true);
    expect(betas).toContain("mcp-client-2025-11-20");

    const off = checkerRequest({ prompt: "x", useThemeParks: false });
    expect(off.body.mcp_servers).toBeUndefined();
    expect(off.betas).not.toContain("mcp-client-2025-11-20");
  });
});

describe("fact-check — decisions", () => {
  const items = collectItems(post);
  const checkedIds = items.filter(isRisky).map((i) => i.id);

  it("parses the verdict array even with stray text around it", () => {
    const v = parseVerdicts('Here you go:\n```json\n[{"id":"bignews-1","verdict":"wrong","problem":"price is $40","fix":"","evidence":[]}]\n```');
    expect(v).toEqual([{ id: "bignews-1", verdict: "wrong", problem: "price is $40", fix: "", evidence: [] }]);
    expect(parseVerdicts("no json here")).toBeNull();
  });

  it("cuts wrong items and holds when the teaser fails", () => {
    const dateIssues = { teaser: findWeekdayDateMismatches(post.teaser, post.date) };
    const d = decide({
      items,
      verdicts: [{ id: "bignews-1", verdict: "wrong", problem: "price is $40", fix: "", evidence: [] }],
      dateIssues,
      checkedIds,
    });
    expect(d.cuts.map((c: { id: string }) => c.id).sort()).toEqual(["bignews-1", "teaser"]);
    expect(d.hold).toBe(true);
    expect(d.holdReasons.join(" ")).toContain("teaser");
  });

  it("keeps an unverifiable claim only when it is worded as a report", () => {
    expect(isHedged("WDWNT reports a new bucket")).toBe(true);
    expect(isHedged("A new bucket arrives at EPCOT")).toBe(false);
    const d = decide({
      items,
      verdicts: [
        { id: "teaser", verdict: "confirmed", problem: "", fix: "", evidence: [] },
        { id: "bignews-0", verdict: "confirmed", problem: "", fix: "", evidence: [] },
        { id: "bignews-1", verdict: "unverifiable", problem: "no page found", fix: "", evidence: [] },
      ],
      checkedIds,
    });
    expect(d.cuts).toHaveLength(0);
    expect(d.results.find((r: { id: string }) => r.id === "bignews-1")?.action).toBe("flag");
    expect(d.hold).toBe(false);
  });

  it("holds the issue when the checker fails", () => {
    const d = decide({ items, verdicts: null, checkedIds, checkerError: "timeout" });
    expect(d.hold).toBe(true);
  });

  it("holds at three cuts", () => {
    const d = decide({
      items,
      verdicts: ["teaser", "bignews-1", "topstories-0"].map((id) => ({ id, verdict: "wrong", problem: "", fix: "", evidence: [] })),
      checkedIds,
    });
    expect(d.cuts).toHaveLength(3);
    expect(d.hold).toBe(true);
  });

  it("removes cut items without touching the rest, and reports in shadow wording", () => {
    const d = decide({
      items,
      verdicts: [{ id: "bignews-1", verdict: "wrong", problem: "price is $40", fix: "", evidence: [] }],
      checkedIds,
    });
    const next = applyCuts(post, d);
    expect(next.sections.bignews.map((i: { title: string }) => i.title)).toEqual(["Holiday party adds dates"]);
    expect(post.sections.bignews).toHaveLength(2);
    const report = renderReport({ etDate: post.date, mode: "shadow", decision: d, useThemeParks: true });
    expect(report).toContain("shadow mode");
    expect(report).toContain("would remove");
  });
});

describe("writer prompt and response handling", () => {
  const prompt = buildPrompt({
    etDate: "2026-11-25",
    slug: "parkio-daily-2026-11-25",
    rssText: "",
    additionalText: "",
    parksJson: "{}",
    videosJson: "[]",
    totalRssItems: 12,
  });

  it("asks for fewer, sourced stories and gives a calendar instead of a rides box", () => {
    expect(prompt).toContain("6–10 distinct");
    expect(prompt).not.toContain("10–13");
    expect(prompt).toContain("2026-11-28 = Saturday, November 28");
    expect(prompt).not.toContain('"headline": "Best rides right now"');
    expect(prompt).toContain("OFFICIAL vs REPORTED");
  });

  it("reads the answer from the last text block, after any thinking block", () => {
    expect(
      finalText({ content: [{ type: "thinking", thinking: "" }, { type: "text", text: "{}" }] }),
    ).toBe("{}");
    expect(finalText({ content: [] })).toBe("");
  });
});

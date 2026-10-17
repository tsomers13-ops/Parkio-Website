// @vitest-environment jsdom
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DailyPost } from "@/lib/guideDaily";

const DAILY_DIR = path.join(process.cwd(), "content", "guide", "daily");

/** In-memory stand-in for content/guide/daily — mirrors tests/guideDaily.test.ts. */
let files: Record<string, string> = {};

vi.mock("node:fs", () => ({
  default: {
    statSync: (p: string) => {
      if (p === DAILY_DIR) return { isDirectory: () => true };
      throw new Error("ENOENT");
    },
    readdirSync: () => Object.keys(files),
    existsSync: (p: string) => path.basename(p) in files,
    readFileSync: (p: string) => {
      const name = path.basename(p);
      if (!(name in files)) throw new Error("ENOENT");
      return files[name]!;
    },
  },
}));

const { GET, eligibleForFeed, buildFeedXml, feedFreshnessWindow } = await import(
  "@/app/feed.xml/route"
);

function post(date: string, overrides: Partial<DailyPost> = {}): DailyPost {
  return {
    slug: `parkio-daily-${date}`,
    title: `Parkio Daily — ${date}`,
    date,
    teaser: "Today's briefing.",
    ...overrides,
  };
}

function rawPost(date: string, overrides: Partial<DailyPost> = {}) {
  return JSON.stringify(post(date, overrides));
}

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, "application/xml");
}

function hasParserError(doc: Document): boolean {
  return doc.getElementsByTagName("parsererror").length > 0;
}

beforeEach(() => {
  files = {};
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("feedFreshnessWindow", () => {
  it("resolves today/yesterday by America/New_York calendar date during EDT", () => {
    const now = new Date("2026-10-17T15:00:00Z");
    expect(feedFreshnessWindow(now)).toEqual({
      today: "2026-10-17",
      yesterday: "2026-10-16",
    });
  });

  it("resolves a UTC instant that falls on the PRIOR Eastern calendar date", () => {
    // 02:00 UTC is 22:00 the previous day in America/New_York during EDT
    // (UTC-4) — the exact case that would be wrong if this used UTC
    // calendar dates instead of the Eastern ones.
    const now = new Date("2026-10-17T02:00:00Z");
    expect(feedFreshnessWindow(now)).toEqual({
      today: "2026-10-16",
      yesterday: "2026-10-15",
    });
  });
});

describe("eligibleForFeed — rolling today/yesterday window", () => {
  const now = new Date("2026-10-17T15:00:00Z"); // Eastern today: 2026-10-17

  it("includes a post dated exactly today", () => {
    const result = eligibleForFeed([post("2026-10-17")], now);
    expect(result.map((p) => p.date)).toEqual(["2026-10-17"]);
  });

  it("includes a post dated exactly yesterday", () => {
    const result = eligibleForFeed([post("2026-10-16")], now);
    expect(result.map((p) => p.date)).toEqual(["2026-10-16"]);
  });

  it("excludes a post dated the day before yesterday (too old)", () => {
    const result = eligibleForFeed([post("2026-10-15")], now);
    expect(result).toEqual([]);
  });

  it("excludes a week-old post that a later app rebuild re-surfaces", () => {
    const result = eligibleForFeed([post("2026-10-09")], now);
    expect(result).toEqual([]);
  });

  it("keeps today+yesterday together and drops everything else", () => {
    const result = eligibleForFeed(
      [post("2026-10-17"), post("2026-10-16"), post("2026-10-15"), post("2026-09-27")],
      now,
    );
    expect(result.map((p) => p.date).sort()).toEqual(["2026-10-16", "2026-10-17"]);
  });

  it("the window shifts with a UTC instant on the prior Eastern calendar date", () => {
    // Same real moment family as the feedFreshnessWindow boundary test:
    // Eastern "today" is 2026-10-16 here, so a post dated 2026-10-17
    // (tomorrow, not yet eligible) is excluded while 2026-10-16/15 are in.
    const boundaryNow = new Date("2026-10-17T02:00:00Z");
    const result = eligibleForFeed(
      [post("2026-10-17"), post("2026-10-16"), post("2026-10-15"), post("2026-10-14")],
      boundaryNow,
    );
    expect(result.map((p) => p.date).sort()).toEqual(["2026-10-15", "2026-10-16"]);
  });
});

describe("buildFeedXml — strict XML validity", () => {
  const now = new Date("2026-10-17T15:00:00Z");

  it("emits a well-formed RSS shell with no parser errors", () => {
    const xml = buildFeedXml([post("2026-10-17")], now);
    expect(hasParserError(parseXml(xml))).toBe(false);
  });

  it("escapes &, <, >, quotes, and apostrophes in title/description so the feed still parses", () => {
    const tricky = post("2026-10-17", {
      title: `Magic Kingdom & EPCOT: "Can't Miss" <Today>`,
      teaser: `Wait times & crowds — don't miss "Pecos Bill" <today>.`,
    });
    const xml = buildFeedXml([tricky], now);
    const doc = parseXml(xml);
    expect(hasParserError(doc)).toBe(false);
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&lt;Today&gt;");
  });

  it("no longer emits undeclared HTML named entities (e.g. &mdash;, &rarr;) anywhere in the feed", () => {
    const withRideNote = post("2026-10-17", {
      rightNow: { rides: [{ name: "Space Mountain", parkSlug: "magic-kingdom", note: "short wait" }] },
      sections: {
        topstories: [
          {
            title: "Big news",
            parkSlug: "magic-kingdom",
            parkioInsight: { text: "Ride it before noon." },
          },
        ],
      },
    } as Partial<DailyPost>);
    const xml = buildFeedXml([withRideNote], now);
    expect(hasParserError(parseXml(xml))).toBe(false);
    expect(xml).not.toContain("&mdash;");
    expect(xml).not.toContain("&rarr;");
    // The literal replacement characters are still present (as real
    // Unicode text, not entities) — this isn't just deleting content.
    expect(xml).toContain("—");
    expect(xml).toContain("→");
  });

  it("stays valid with multiple eligible items, each carrying tricky characters", () => {
    const xml = buildFeedXml(
      [
        post("2026-10-17", { title: `Today's "Briefing" & More` }),
        post("2026-10-16", { teaser: `<b>Not real HTML</b> & other stuff` }),
      ],
      now,
    );
    expect(hasParserError(parseXml(xml))).toBe(false);
  });
});

describe("GET /feed.xml", () => {
  it("serves a well-formed RSS document with the expected content type", async () => {
    files = {
      "parkio-daily-2026-09-27.json": rawPost("2026-09-27"),
    };
    const res = GET();
    expect(res.headers.get("Content-Type")).toContain("application/rss+xml");
    const xml = await res.text();
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" ?>')).toBe(true);
    expect(xml).toContain("<rss version=\"2.0\"");
    expect(xml).toContain("<channel>");
    expect(xml).toContain("<title>Parkio Daily</title>");
    expect(xml).toContain("</channel>");
    expect(xml).toContain("</rss>");
    expect(hasParserError(parseXml(xml))).toBe(false);
  });

  it("emits a valid, parser-clean shell with no content directory at all", async () => {
    files = {};
    const xml = await GET().text();
    expect(xml).toContain("<channel>");
    expect(xml).toContain("</rss>");
    expect(hasParserError(parseXml(xml))).toBe(false);
  });
});

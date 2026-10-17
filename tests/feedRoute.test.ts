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

const { GET } = await import("@/app/feed.xml/route");

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

async function feedAt(now: Date, posts: DailyPost[]): Promise<string> {
  files = Object.fromEntries(
    posts.map((entry) => [`${entry.slug}.json`, JSON.stringify(entry)]),
  );
  vi.useFakeTimers();
  vi.setSystemTime(now);
  try {
    return await GET().text();
  } finally {
    vi.useRealTimers();
  }
}

beforeEach(() => {
  files = {};
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("/feed.xml rolling today/yesterday window", () => {
  it("resolves today/yesterday by America/New_York calendar date during EDT", async () => {
    const now = new Date("2026-10-17T15:00:00Z");
    const xml = await feedAt(now, [
      post("2026-10-17"),
      post("2026-10-16"),
      post("2026-10-15"),
    ]);
    expect(xml).toContain("parkio-daily-2026-10-17");
    expect(xml).toContain("parkio-daily-2026-10-16");
    expect(xml).not.toContain("parkio-daily-2026-10-15");
  });

  it("resolves a UTC instant that falls on the PRIOR Eastern calendar date", async () => {
    // 02:00 UTC is 22:00 the previous day in America/New_York during EDT
    // (UTC-4) — the exact case that would be wrong if this used UTC
    // calendar dates instead of the Eastern ones.
    const now = new Date("2026-10-17T02:00:00Z");
    const xml = await feedAt(now, [
      post("2026-10-17"),
      post("2026-10-16"),
      post("2026-10-15"),
      post("2026-10-14"),
    ]);
    expect(xml).not.toContain("parkio-daily-2026-10-17");
    expect(xml).toContain("parkio-daily-2026-10-16");
    expect(xml).toContain("parkio-daily-2026-10-15");
    expect(xml).not.toContain("parkio-daily-2026-10-14");
  });

  it("excludes a week-old post that a later app rebuild re-surfaces", async () => {
    const xml = await feedAt(new Date("2026-10-17T15:00:00Z"), [post("2026-10-09")]);
    expect(xml).not.toContain("parkio-daily-2026-10-09");
  });
});

describe("buildFeedXml — strict XML validity", () => {
  const now = new Date("2026-10-17T15:00:00Z");

  it("emits a well-formed RSS shell with no parser errors", async () => {
    const xml = await feedAt(now, [post("2026-10-17")]);
    expect(hasParserError(parseXml(xml))).toBe(false);
  });

  it("escapes &, <, >, quotes, and apostrophes in title/description so the feed still parses", async () => {
    const tricky = post("2026-10-17", {
      title: `Magic Kingdom & EPCOT: "Can't Miss" <Today>`,
      teaser: `Wait times & crowds — don't miss "Pecos Bill" <today>.`,
    });
    const xml = await feedAt(now, [tricky]);
    const doc = parseXml(xml);
    expect(hasParserError(doc)).toBe(false);
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&lt;Today&gt;");
  });

  it("no longer emits undeclared HTML named entities (e.g. &mdash;, &rarr;) anywhere in the feed", async () => {
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
    const xml = await feedAt(now, [withRideNote]);
    expect(hasParserError(parseXml(xml))).toBe(false);
    expect(xml).not.toContain("&mdash;");
    expect(xml).not.toContain("&rarr;");
    // The literal replacement characters are still present (as real
    // Unicode text, not entities) — this isn't just deleting content.
    expect(xml).toContain("—");
    expect(xml).toContain("→");
  });

  it("stays valid with multiple eligible items, each carrying tricky characters", async () => {
    const xml = await feedAt(
      now,
      [
        post("2026-10-17", { title: `Today's "Briefing" & More` }),
        post("2026-10-16", { teaser: `<b>Not real HTML</b> & other stuff` }),
      ],
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

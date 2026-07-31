import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DAILY_DIR = path.join(process.cwd(), "content", "guide", "daily");

/** In-memory stand-in for content/guide/daily. */
let files: Record<string, string> = {};
let dirPresent = true;

vi.mock("node:fs", () => ({
  default: {
    statSync: (p: string) => {
      if (p === DAILY_DIR && dirPresent) return { isDirectory: () => true };
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

const {
  SECTION_ORDER,
  formatBriefingDate,
  getDailyPost,
  hasItems,
  listDailyPosts,
  listDailySlugs,
  sectionEyebrow,
  sectionTitle,
} = await import("@/lib/guideDaily");

function post(date: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    slug: `parkio-daily-${date}`,
    title: `Parkio Daily — ${date}`,
    date,
    teaser: "Today's briefing.",
    ...extra,
  });
}

beforeEach(() => {
  files = {};
  dirPresent = true;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("section helpers", () => {
  it("orders sections breaking → spotlight", () => {
    expect(SECTION_ORDER).toEqual([
      "breaking",
      "bignews",
      "topstories",
      "icymi",
      "spotlight",
    ]);
  });

  it("has a title and a numbered eyebrow for every section", () => {
    SECTION_ORDER.forEach((key, i) => {
      expect(sectionTitle(key).length).toBeGreaterThan(0);
      expect(sectionEyebrow(key)).toContain(`0${i + 1} ·`);
    });
  });
});

describe("hasItems", () => {
  it("narrows only non-empty arrays", () => {
    expect(hasItems(undefined)).toBe(false);
    expect(hasItems([])).toBe(false);
    expect(hasItems([1])).toBe(true);
  });
});

describe("formatBriefingDate", () => {
  it("formats an ISO date in UTC so it is viewer-timezone stable", () => {
    expect(formatBriefingDate("2026-04-26")).toBe("Sunday, April 26, 2026");
  });

  it("returns the input unchanged when it is not parseable", () => {
    expect(formatBriefingDate("not-a-date")).toBe("not-a-date");
  });
});

describe("listDailySlugs", () => {
  it("returns an empty list when the content directory is missing", () => {
    dirPresent = false;
    expect(listDailySlugs()).toEqual([]);
  });

  it("strips the .json extension and ignores other files", () => {
    files = {
      "parkio-daily-2026-04-26.json": post("2026-04-26"),
      "README.md": "not a briefing",
    };
    expect(listDailySlugs()).toEqual(["parkio-daily-2026-04-26"]);
  });
});

describe("getDailyPost", () => {
  it("returns null when the directory or file is missing", () => {
    dirPresent = false;
    expect(getDailyPost("parkio-daily-2026-04-26")).toBeNull();
    dirPresent = true;
    expect(getDailyPost("parkio-daily-2026-04-26")).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    files = { "broken.json": "{ not json" };
    expect(getDailyPost("broken")).toBeNull();
  });

  it("fills in a stable shape for omitted optional fields", () => {
    files = { "parkio-daily-2026-04-26.json": post("2026-04-26") };
    expect(getDailyPost("parkio-daily-2026-04-26")).toMatchObject({
      slug: "parkio-daily-2026-04-26",
      type: "daily-briefing",
      sections: {},
      videos: [],
    });
  });

  it("preserves sections and videos that are present", () => {
    files = {
      "parkio-daily-2026-04-26.json": post("2026-04-26", {
        sections: { breaking: [{ title: "T", body: "B" }] },
        videos: [{ title: "V", channel: "C", url: "https://x" }],
      }),
    };
    const parsed = getDailyPost("parkio-daily-2026-04-26");
    expect(parsed?.sections?.breaking).toHaveLength(1);
    expect(parsed?.videos).toHaveLength(1);
  });
});

describe("listDailyPosts", () => {
  it("sorts newest first and skips unreadable files", () => {
    files = {
      "parkio-daily-2026-04-24.json": post("2026-04-24"),
      "parkio-daily-2026-04-26.json": post("2026-04-26"),
      "parkio-daily-2026-04-25.json": post("2026-04-25"),
      "broken.json": "{{{",
    };
    expect(listDailyPosts().map((p) => p.date)).toEqual([
      "2026-04-26",
      "2026-04-25",
      "2026-04-24",
    ]);
  });

  it("returns an empty list when nothing is on disk", () => {
    expect(listDailyPosts()).toEqual([]);
  });
});

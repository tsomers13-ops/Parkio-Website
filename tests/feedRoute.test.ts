import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function post(date: string) {
  return JSON.stringify({
    slug: `parkio-daily-${date}`,
    title: `Parkio Daily — ${date}`,
    date,
    teaser: "Today's briefing.",
  });
}

beforeEach(() => {
  files = {};
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/feed.xml backlog cutoff", () => {
  it("excludes every backlog entry dated on or before the cutoff", async () => {
    files = {
      "parkio-daily-2026-09-27.json": post("2026-09-27"),
      "parkio-daily-2026-09-17.json": post("2026-09-17"),
      "parkio-daily-2026-09-16.json": post("2026-09-16"),
    };
    const xml = await GET().text();
    expect(xml).not.toContain("parkio-daily-2026-09-27");
    expect(xml).not.toContain("parkio-daily-2026-09-17");
    expect(xml).not.toContain("parkio-daily-2026-09-16");
  });

  it("includes a future entry automatically, with no backlog leaking in alongside it", async () => {
    files = {
      "parkio-daily-2026-09-28.json": post("2026-09-28"),
      "parkio-daily-2026-09-27.json": post("2026-09-27"),
    };
    const xml = await GET().text();
    expect(xml).toContain("parkio-daily-2026-09-28");
    expect(xml).not.toContain("parkio-daily-2026-09-27");
  });

  it("keeps including further future entries without another code change", async () => {
    files = {
      "parkio-daily-2026-10-05.json": post("2026-10-05"),
      "parkio-daily-2026-09-28.json": post("2026-09-28"),
    };
    const xml = await GET().text();
    expect(xml).toContain("parkio-daily-2026-10-05");
    expect(xml).toContain("parkio-daily-2026-09-28");
  });

  it("still emits a valid, well-formed RSS shell when nothing is eligible", async () => {
    files = {
      "parkio-daily-2026-09-27.json": post("2026-09-27"),
    };
    const res = GET();
    expect(res.headers.get("Content-Type")).toContain("application/rss+xml");
    const xml = await res.text();
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" ?>')).toBe(
      true,
    );
    expect(xml).toContain("<rss version=\"2.0\"");
    expect(xml).toContain("<channel>");
    expect(xml).toContain("<title>Parkio Daily</title>");
    expect(xml).toContain("</channel>");
    expect(xml).toContain("</rss>");
  });

  it("emits valid RSS with no content directory at all", async () => {
    files = {};
    const xml = await GET().text();
    expect(xml).toContain("<channel>");
    expect(xml).toContain("</rss>");
  });
});

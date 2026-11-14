import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { getDailyPost, listDailySlugs } from "@/lib/guideDaily";
import { safeCssUrl, safeHttpUrl } from "@/lib/safeUrl";

function assertCssSafe(value: string) {
  expect(value).toMatch(/^(?:[^"'()\\\n\r]|\\[0-9a-f]+ )*$/);
  expect(value).not.toMatch(/[\n\r]/);
}

describe("safeHttpUrl", () => {
  it("allows http and https and preserves a bare origin", () => {
    expect(safeHttpUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(safeHttpUrl("http://example.com/a")).toBe("http://example.com/a");
    expect(safeHttpUrl("https://www.disneyfoodblog.com")).toBe(
      "https://www.disneyfoodblog.com",
    );
    expect(safeHttpUrl("  https://example.com/a \n")).toBe(
      "https://example.com/a",
    );
    expect(safeHttpUrl("https://i.ytimg.com/vi/abc/mqdefault.jpg")).toBe(
      "https://i.ytimg.com/vi/abc/mqdefault.jpg",
    );
  });

  it("canonicalizes a safe URL the parser has to rewrite", () => {
    expect(safeHttpUrl("HTTPS://Example.COM/Path")).toBe(
      "https://example.com/Path",
    );
    expect(safeHttpUrl("https://example.com/a b")).toBe(
      "https://example.com/a%20b",
    );
  });

  it("rejects non-http schemes, including mixed case, whitespace, and null bytes", () => {
    const rejected = [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "JaVaScRiPt:alert(1)",
      "  javascript:alert(1)",
      "\tjavascript:alert(1)",
      "\njavascript:alert(1)",
      "java\tscript:alert(1)",
      "java\nscript:alert(1)",
      "java\rscript:alert(1)",
      "\u0000javascript:alert(1)",
      "javascript://example.com/%0Aalert(1)",
      "javascript:alert(1)//https://example.com",
      "data:text/html,<script>alert(1)</script>",
      " \n DATA:text/html,hi",
      "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'>",
      "vbscript:msgbox(1)",
      "VbScRiPt:msgbox(1)",
      "blob:https://example.com/uuid",
      "file:///etc/passwd",
      "mailto:a@b.com",
      "ws://example.com",
      "about:blank",
      "//evil.com",
      "/guide/parkio-daily-2026-04-26",
      "javascript%3Aalert(1)",
      "java&#115;cript:alert(1)",
      "http://",
      "https://",
      "",
      "   ",
      null,
      undefined,
    ];
    for (const value of rejected) {
      expect(safeHttpUrl(value), JSON.stringify(value)).toBeNull();
    }
  });

  it("does not treat an encoded or embedded scheme word as the scheme", () => {
    expect(safeHttpUrl("https://example.com/%6Aavascript:alert(1)")).toBe(
      "https://example.com/%6Aavascript:alert(1)",
    );
    expect(
      safeHttpUrl("http://example.com/redirect?next=javascript:alert(1)"),
    ).toBe("http://example.com/redirect?next=javascript:alert(1)");
  });
});

describe("safeCssUrl", () => {
  it("returns a clean http(s) URL unchanged", () => {
    const url = "https://i.ytimg.com/vi/vPhGW524Gsg/mqdefault.jpg";
    expect(safeCssUrl(url)).toBe(url);
    expect(safeCssUrl("http://example.com/a.jpg")).toBe(
      "http://example.com/a.jpg",
    );
  });

  it("hex-escapes quotes, parentheses, and backslashes that would break url()", () => {
    expect(safeCssUrl("https://example.com/a(b).jpg")).toBe(
      "https://example.com/a\\28 b\\29 .jpg",
    );
    expect(safeCssUrl("https://example.com/);color:red")).toBe(
      "https://example.com/\\29 ;color:red",
    );
    expect(safeCssUrl("https://example.com/a'b.jpg")).toBe(
      "https://example.com/a\\27 b.jpg",
    );
    // The URL parser percent-encodes a raw double quote before CSS escaping.
    expect(safeCssUrl('https://example.com/a"b.jpg')).toBe(
      "https://example.com/a%22b.jpg",
    );
    // A raw backslash is folded to "/" by the URL parser; the paren remains.
    expect(safeCssUrl("https://example.com/a\\b).jpg")).toBe(
      "https://example.com/a/b\\29 .jpg",
    );
    expect(safeCssUrl("https://example.com/a%29);color:red")).toBe(
      "https://example.com/a%29\\29 ;color:red",
    );
  });

  it("does not leave a raw newline or a breakout character in the CSS value", () => {
    const attacks = [
      "https://example.com/a)\nb.jpg",
      "https://example.com/a\nb.jpg",
      "https://example.com/);background:url(https://evil.test/x)",
      'https://example.com/");color:red',
      "https://example.com/a(b)\\c'd\".jpg",
      "https://example.com/a%0A);color:red",
    ];
    for (const attack of attacks) {
      const css = safeCssUrl(attack);
      expect(css, attack).not.toBeNull();
      assertCssSafe(css!);
      const background = `url(${css})`;
      expect(background.match(/\)/g)).toEqual([")"]);
      expect(background.startsWith("url(")).toBe(true);
    }
  });

  it("drops script and data URLs instead of encoding them into CSS", () => {
    expect(safeCssUrl("javascript:alert(1)")).toBeNull();
    expect(safeCssUrl("JaVaScRiPt:alert(1)")).toBeNull();
    expect(
      safeCssUrl("data:text/html,<script>alert(1)</script>"),
    ).toBeNull();
    expect(safeCssUrl("vbscript:msgbox(1)")).toBeNull();
    expect(safeCssUrl(null)).toBeNull();
  });
});

describe("published daily content", () => {
  it("still accepts every on-disk slug, source URL, and thumbnail", () => {
    const slugs = listDailySlugs();
    expect(slugs.length).toBeGreaterThan(100);

    const urls: string[] = [];
    for (const slug of slugs) {
      expect(slug, slug).toMatch(/^parkio-daily-\d{4}-\d{2}-\d{2}$/);
      const post = getDailyPost(slug);
      expect(post, slug).not.toBeNull();
      collectContentUrls(post, urls);
    }

    expect(urls.length).toBeGreaterThan(1000);
    for (const url of urls) {
      expect(safeHttpUrl(url), url).toBe(url);
      expect(safeCssUrl(url), url).toBe(url);
    }

    // The directory the test walked is the real content tree.
    const dir = path.join(process.cwd(), "content", "guide", "daily");
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith(".json"))).toHaveLength(
      slugs.length,
    );
  });
});

function collectContentUrls(value: unknown, out: string[]) {
  if (Array.isArray(value)) {
    for (const item of value) collectContentUrls(item, out);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if ((key === "url" || key === "thumbnailUrl") && typeof child === "string") {
      out.push(child);
    } else {
      collectContentUrls(child, out);
    }
  }
}

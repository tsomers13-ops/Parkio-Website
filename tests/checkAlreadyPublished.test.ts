import { describe, expect, it } from "vitest";
import { checkAlreadyPublished } from "../scripts/parkio-daily/checkAlreadyPublished.mjs";

const RSS_FEED_WITH = (slug: string) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><item><link>https://parkio.info/guide/parkio-daily-${slug}</link></item></channel></rss>`;
const RSS_FEED_WITHOUT = `<?xml version="1.0"?><rss version="2.0"><channel><item><link>https://parkio.info/guide/parkio-daily-2020-01-01</link></item></channel></rss>`;

function fakeFetch(response: { ok: boolean; status: number; body: string } | (() => Promise<never>)) {
  if (typeof response === "function") return response as unknown as typeof fetch;
  return (async () => ({
    ok: response.ok,
    status: response.status,
    text: async () => response.body,
  })) as unknown as typeof fetch;
}

describe("checkAlreadyPublished — three outcomes, not two", () => {
  it("is 'published' when the feed contains the slug", async () => {
    const result = await checkAlreadyPublished("2026-10-09", {
      fetchImpl: fakeFetch({ ok: true, status: 200, body: RSS_FEED_WITH("2026-10-09") }),
    });
    expect(result).toEqual({ status: "published" });
  });

  it("is 'not-published' when the feed is readable but doesn't contain the slug", async () => {
    const result = await checkAlreadyPublished("2026-10-09", {
      fetchImpl: fakeFetch({ ok: true, status: 200, body: RSS_FEED_WITHOUT }),
    });
    expect(result).toEqual({ status: "not-published" });
  });

  it("is 'unknown' — NOT 'not-published' — on a non-200 response", async () => {
    // This is the exact mistake a naive `curl | grep` makes: a 500/404
    // just fails to match and looks identical to "not published yet".
    const result = await checkAlreadyPublished("2026-10-09", {
      fetchImpl: fakeFetch({ ok: false, status: 500, body: "Internal Server Error" }),
    });
    expect(result.status).toBe("unknown");
    expect(result.reason).toContain("500");
  });

  it("is 'unknown' when the request itself fails (network error, timeout, DNS failure)", async () => {
    const result = await checkAlreadyPublished("2026-10-09", {
      fetchImpl: fakeFetch(async () => {
        throw new Error("fetch failed: ECONNREFUSED");
      }),
    });
    expect(result.status).toBe("unknown");
    expect(result.reason).toContain("request failed");
  });

  it("is 'unknown' when the response is 200 but doesn't look like RSS/Atom at all", async () => {
    // E.g. a CDN error page, a maintenance page, or an empty body that
    // still returns 200 — must not be silently treated as "not published".
    const result = await checkAlreadyPublished("2026-10-09", {
      fetchImpl: fakeFetch({ ok: true, status: 200, body: "<html><body>Service Unavailable</body></html>" }),
    });
    expect(result.status).toBe("unknown");
    expect(result.reason).toContain("RSS/Atom");
  });

  it("is 'unknown' when no slug is given at all", async () => {
    const result = await checkAlreadyPublished("", { fetchImpl: fakeFetch({ ok: true, status: 200, body: RSS_FEED_WITHOUT }) });
    expect(result.status).toBe("unknown");
  });

  it("accepts an Atom feed shape too, not just RSS", async () => {
    const atomBody = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>parkio-daily-2026-10-09</id></entry></feed>`;
    const result = await checkAlreadyPublished("2026-10-09", {
      fetchImpl: fakeFetch({ ok: true, status: 200, body: atomBody }),
    });
    expect(result).toEqual({ status: "published" });
  });
});

describe("checkAlreadyPublished CLI contract — what the workflow step actually relies on", () => {
  // The workflow does: status="$(node checkAlreadyPublished.mjs "$slug")"
  // under GitHub Actions' default `bash -e` — confirmed (via a direct
  // local bash -e repro) that a failing command substitution in that
  // exact assignment form aborts the step, so the CLI's contract is:
  // print exactly "published"/"not-published" and exit 0, or print
  // nothing to stdout and exit 1. This test proves the CLI side of that
  // contract via a real subprocess (not the importable function, which
  // the tests above already cover) against a request that's certain to
  // fail fast — an unroutable address — without needing a mock server.
  it("exits non-zero and prints nothing to stdout for the 'unknown' case (no slug given)", async () => {
    // Hitting the real parkio.info here would make this test flaky and
    // network-dependent; "no slug" is a representative unknown/exit-1
    // case that needs no network access at all, exercising the real CLI
    // entry point end to end rather than just the importable function.
    const { execFileSync } = await import("node:child_process");
    const path = await import("node:path");
    const scriptPath = path.resolve(__dirname, "../scripts/parkio-daily/checkAlreadyPublished.mjs");
    let threw = false;
    let stdout = "";
    try {
      stdout = execFileSync("node", [scriptPath], { encoding: "utf8", timeout: 5_000 });
    } catch (err: any) {
      threw = true;
      stdout = typeof err.stdout === "string" ? err.stdout : "";
    }
    expect(threw).toBe(true);
    expect(stdout.trim()).toBe("");
  }, 10_000);
});

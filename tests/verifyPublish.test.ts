import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";

import {
  RETRY_SCHEDULE_SECONDS,
  checkPublish,
  verifyPublishWithRetries,
} from "@/scripts/parkio-daily/verifyPublish.mjs";

// Real local HTTP server + Node's native fetch — same reasoning as
// tests/dailyPublishVerifyFollowsRedirects.test.ts: this sandbox's
// subprocess loopback networking hangs when shelling out to real curl,
// but in-process fetch against a local server works immediately, and
// `redirect: "manual"`/`"follow"` is the same underlying semantic curl's
// `-L` flag controls.
//
// Covers 2026-10-17's actual incident shape: Worker
// 31420633-3c1b-4062-9648-77a861377937 deployed successfully, but the
// immediate feed-slug check failed about five seconds later and only
// resolved itself a bit later — exercised below as "transient-then-
// success" — plus a genuine, permanent failure that must still exit
// nonzero after the schedule is exhausted.
const SLUG = "2026-10-17";
const NOW = new Date("2026-10-17T15:00:00Z"); // toUTCString() -> "Sat, 17 Oct 2026 15:00:00 GMT"

describe("checkPublish", () => {
  let server: http.Server;
  let baseUrl: string;
  let feedReady: boolean;

  function startServer(feedContainsSlugFromStart: boolean) {
    feedReady = feedContainsSlugFromStart;
    server = http.createServer((req, res) => {
      if (req.url === "/") {
        res.writeHead(200);
        res.end("ok");
      } else if (req.url === `/guide/parkio-daily-${SLUG}`) {
        res.writeHead(308, { Location: `/guide/parkio-daily-${SLUG}/` });
        res.end();
      } else if (req.url === `/guide/parkio-daily-${SLUG}/`) {
        res.writeHead(200);
        res.end("<html>briefing</html>");
      } else if (req.url === "/feed.xml") {
        const body = feedReady
          ? `<rss><item><guid>parkio-daily-${SLUG}</guid></item><lastBuildDate>${NOW.toUTCString()}</lastBuildDate></rss>`
          : `<rss><lastBuildDate>${NOW.toUTCString()}</lastBuildDate></rss>`;
        res.writeHead(200, { "Content-Type": "application/rss+xml" });
        res.end(body);
      } else if (req.url === "/parks/magic-kingdom/dining/mk-pecos-bill") {
        res.writeHead(308, { Location: "/parks/magic-kingdom/dining/mk-pecos-bill/" });
        res.end();
      } else if (req.url === "/parks/magic-kingdom/dining/mk-pecos-bill/") {
        res.writeHead(200);
        res.end("<html>dining</html>");
      } else if (req.url === "/api/dining/mk-pecos-bill/ratings/") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      } else {
        res.writeHead(404);
        res.end("not found");
      }
    });
    return new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        const port = typeof address === "object" && address ? address.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  }

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("passes every check, with no failures or warnings, when everything is live and fresh", async () => {
    await startServer(true);
    const result = await checkPublish(SLUG, { siteUrl: baseUrl, now: NOW });
    expect(result).toEqual({ ok: true, failures: [], warnings: [] });
  });

  it("follows redirects for the guide and dining pages — 308 alone must not be treated as failure", async () => {
    await startServer(true);
    const result = await checkPublish(SLUG, { siteUrl: baseUrl, now: NOW });
    expect(result.failures).toEqual([]);
  });

  it("reports the feed-slug check by name when the feed does not yet contain the entry", async () => {
    await startServer(false);
    const result = await checkPublish(SLUG, { siteUrl: baseUrl, now: NOW });
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([
      `feed.xml does not contain today's entry (parkio-daily-${SLUG})`,
    ]);
  });

  it("fails on a non-200 feed response even if its body happens to contain the expected slug", async () => {
    await startServer(true);
    const result = await checkPublish(SLUG, {
      siteUrl: baseUrl,
      now: NOW,
      fetchFn: async (url, init) => {
        const response = await fetch(url, init);
        if (String(url).endsWith("/feed.xml")) {
          return new Response(await response.text(), { status: 503 });
        }
        return response;
      },
    });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain("feed.xml returned 503");
  });

  it("warns (does not fail) when lastBuildDate doesn't match today, same as the original warning-only check", async () => {
    await startServer(true);
    const wrongDay = new Date("2026-10-16T15:00:00Z");
    const result = await checkPublish(SLUG, { siteUrl: baseUrl, now: wrongDay });
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([
      "feed.xml lastBuildDate does not show today's date — check manually.",
    ]);
  });
});

describe("verifyPublishWithRetries", () => {
  let server: http.Server;
  let baseUrl: string;
  let feedRequestCount: number;
  let feedReadyAfterRequest: number; // feed becomes ready once feedRequestCount reaches this

  async function startFlakyFeedServer(readyAfterRequest: number) {
    feedRequestCount = 0;
    feedReadyAfterRequest = readyAfterRequest;
    server = http.createServer((req, res) => {
      if (req.url === "/") {
        res.writeHead(200);
        res.end("ok");
      } else if (req.url === `/guide/parkio-daily-${SLUG}`) {
        res.writeHead(308, { Location: `/guide/parkio-daily-${SLUG}/` });
        res.end();
      } else if (req.url === `/guide/parkio-daily-${SLUG}/`) {
        res.writeHead(200);
        res.end("<html>briefing</html>");
      } else if (req.url === "/feed.xml") {
        feedRequestCount += 1;
        const ready = feedRequestCount >= feedReadyAfterRequest;
        const body = ready
          ? `<rss><item><guid>parkio-daily-${SLUG}</guid></item><lastBuildDate>${NOW.toUTCString()}</lastBuildDate></rss>`
          : `<rss><lastBuildDate>${NOW.toUTCString()}</lastBuildDate></rss>`;
        res.writeHead(200);
        res.end(body);
      } else if (req.url === "/parks/magic-kingdom/dining/mk-pecos-bill") {
        res.writeHead(308, { Location: "/parks/magic-kingdom/dining/mk-pecos-bill/" });
        res.end();
      } else if (req.url === "/parks/magic-kingdom/dining/mk-pecos-bill/") {
        res.writeHead(200);
        res.end("<html>dining</html>");
      } else if (req.url === "/api/dining/mk-pecos-bill/ratings/") {
        res.writeHead(200);
        res.end("{}");
      } else {
        res.writeHead(404);
        res.end("not found");
      }
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        const port = typeof address === "object" && address ? address.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  }

  afterEach(async () => {
    if (!server) return;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function fakeSleep(calls: number[]) {
    return async (ms: number) => {
      calls.push(ms);
    };
  }

  it("the default schedule is 0, 5, 10, 20, 40 seconds", () => {
    expect(RETRY_SCHEDULE_SECONDS).toEqual([0, 5, 10, 20, 40]);
  });

  it("succeeds on the first attempt with no retries when everything is already live", async () => {
    await startFlakyFeedServer(1);
    const sleepCalls: number[] = [];
    const result = await verifyPublishWithRetries(SLUG, {
      siteUrl: baseUrl,
      now: NOW,
      sleepFn: fakeSleep(sleepCalls),
      log: () => {},
    });
    expect(result.ok).toBe(true);
    expect(sleepCalls).toEqual([]);
    expect(feedRequestCount).toBe(1);
  });

  it("tolerates transient stale content and succeeds once it resolves within the schedule", async () => {
    // Fails the first two attempts (feed not ready), succeeds on the third.
    await startFlakyFeedServer(3);
    const sleepCalls: number[] = [];
    const result = await verifyPublishWithRetries(SLUG, {
      siteUrl: baseUrl,
      now: NOW,
      sleepFn: fakeSleep(sleepCalls),
      log: () => {},
    });
    expect(result.ok).toBe(true);
    expect(feedRequestCount).toBe(3);
    // Delays before attempts 2 and 3 (schedule[1]=5s, schedule[2]=10s),
    // converted to ms — proves the real schedule values were used, not
    // just that retrying happened.
    expect(sleepCalls).toEqual([5000, 10000]);
  });

  it("retries a transient fetch exception instead of aborting the verification loop", async () => {
    await startFlakyFeedServer(1);
    let firstRequest = true;
    const sleepCalls: number[] = [];
    const result = await verifyPublishWithRetries(SLUG, {
      siteUrl: baseUrl,
      now: NOW,
      schedule: [0, 1],
      sleepFn: fakeSleep(sleepCalls),
      log: () => {},
      fetchFn: async (url, init) => {
        if (firstRequest) {
          firstRequest = false;
          throw new Error("temporary connection failure");
        }
        return fetch(url, init);
      },
    });
    expect(result.ok).toBe(true);
    expect(sleepCalls).toEqual([1000]);
  });

  it("exhausts the full retry schedule and still exits as a genuine failure when the content never becomes live", async () => {
    // readyAfterRequest beyond the number of attempts in the schedule —
    // the feed check never passes.
    await startFlakyFeedServer(999);
    const sleepCalls: number[] = [];
    const attemptLogs: string[] = [];
    const result = await verifyPublishWithRetries(SLUG, {
      siteUrl: baseUrl,
      now: NOW,
      sleepFn: fakeSleep(sleepCalls),
      log: (msg?: unknown) => attemptLogs.push(String(msg)),
    });
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([
      `feed.xml does not contain today's entry (parkio-daily-${SLUG})`,
    ]);
    expect(feedRequestCount).toBe(RETRY_SCHEDULE_SECONDS.length);
    expect(sleepCalls).toEqual([5000, 10000, 20000, 40000]);
    expect(attemptLogs.some((l) => l.includes("Attempt 5/5"))).toBe(true);
  });

  it("a genuine, unrelated failure (e.g. the homepage itself down) is still reported after exhaustion, not masked", async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(500);
      res.end("down");
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        const port = typeof address === "object" && address ? address.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
    const sleepCalls: number[] = [];
    const result = await verifyPublishWithRetries(SLUG, {
      siteUrl: baseUrl,
      now: NOW,
      sleepFn: fakeSleep(sleepCalls),
      log: () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain("homepage returned 500");
  });
});

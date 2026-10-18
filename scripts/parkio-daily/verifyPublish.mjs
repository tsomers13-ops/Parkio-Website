#!/usr/bin/env node
/**
 * verifyPublish.mjs — post-deploy "Verify the publish" check, with
 * bounded retry/backoff.
 *
 * On 2026-10-17, Worker 31420633-3c1b-4062-9648-77a861377937 deployed
 * successfully and the immediate feed-slug check failed about five
 * seconds later; the feed showed the article, and the scheduled health
 * check passed, within the next few minutes. The exact cache/propagation
 * cause is unproven — this does not try to prove or fix that mechanism,
 * only to stop a transient, resolves-on-its-own staleness window from
 * being reported as a hard failure immediately after every deploy.
 *
 * Every check below (homepage, guide page, feed contents, dining page,
 * ratings API) is retried together as one unit, on a bounded schedule —
 * never individually and never indefinitely — so a genuine failure
 * (the deploy really is broken) still exhausts the schedule and exits
 * nonzero, exactly as before.
 */

import { fileURLToPath } from "node:url";

export const RETRY_SCHEDULE_SECONDS = [0, 5, 10, 20, 40];
export const REQUEST_TIMEOUT_MS = 15_000;

const DEFAULT_SITE_URL = "https://parkio.info";

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs the full set of post-publish acceptance checks ONCE. `fetchFn` and
 * `now` are injectable so this is testable against a local HTTP server
 * and a pinned clock, without touching the real site or real time.
 *
 * @returns {Promise<{ ok: boolean, failures: string[], warnings: string[] }>}
 */
export async function checkPublish(
  slug,
  {
    fetchFn = fetch,
    siteUrl = DEFAULT_SITE_URL,
    now = new Date(),
    requestTimeoutMs = REQUEST_TIMEOUT_MS,
  } = {},
) {
  const failures = [];
  const warnings = [];

  function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
  }

  async function request(urlPath, { follow = false } = {}) {
    return fetchFn(`${siteUrl}${urlPath}`, {
      redirect: follow ? "follow" : "manual",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  }

  async function statusOf(label, urlPath, { follow = false } = {}) {
    try {
      return (await request(urlPath, { follow })).status;
    } catch (error) {
      failures.push(`${label} request failed: ${errorMessage(error)}`);
      return undefined;
    }
  }

  const homepageStatus = await statusOf("homepage", "/");
  if (homepageStatus !== undefined && homepageStatus !== 200) {
    failures.push(`homepage returned ${homepageStatus}`);
  }

  // -L equivalent (follow: true) is required, not cosmetic — parkio.info
  // 308-redirects a bare path to its own trailing-slash form regardless
  // of whether the page is actually published. See
  // tests/dailyPublishVerifyFollowsRedirects.test.ts.
  const guideStatus = await statusOf("guide", `/guide/parkio-daily-${slug}`, {
    follow: true,
  });
  if (guideStatus !== undefined && guideStatus !== 200) {
    failures.push(`guide/parkio-daily-${slug} returned ${guideStatus}`);
  }

  try {
    const feedRes = await request("/feed.xml");
    const feedText = await feedRes.text();
    if (feedRes.status !== 200) {
      failures.push(`feed.xml returned ${feedRes.status}`);
    }
    if (!feedText.includes(`parkio-daily-${slug}`)) {
      failures.push(`feed.xml does not contain today's entry (parkio-daily-${slug})`);
    }
    // RFC-822 date prefix, e.g. "Sat, 17 Oct 2026" — the same 16 leading
    // characters toUTCString() always produces for a UTC date, matching
    // the original `date -u +%a,\ %d\ %b\ %Y` shell invocation exactly.
    const todayRfc822Prefix = now.toUTCString().slice(0, 16);
    if (!feedText.includes(`<lastBuildDate>${todayRfc822Prefix}`)) {
      warnings.push("feed.xml lastBuildDate does not show today's date — check manually.");
    }
  } catch (error) {
    failures.push(`feed.xml request failed: ${errorMessage(error)}`);
  }

  const diningStatus = await statusOf(
    "representative dining page",
    "/parks/magic-kingdom/dining/mk-pecos-bill",
    { follow: true },
  );
  if (diningStatus !== undefined && diningStatus !== 200) {
    failures.push(`representative dining page returned ${diningStatus}`);
  }

  const ratingsStatus = await statusOf(
    "Community Ratings API",
    "/api/dining/mk-pecos-bill/ratings/",
  );
  if (ratingsStatus !== undefined && ratingsStatus !== 200) {
    failures.push(`Community Ratings API returned ${ratingsStatus}`);
  }

  return { ok: failures.length === 0, failures, warnings };
}

/**
 * Runs checkPublish() on the bounded retry schedule, logging each
 * attempt's number and specific failed checks/statuses. Succeeds as soon
 * as one attempt passes (tolerating transient staleness); returns the
 * final, still-failing result after exhausting the schedule so a genuine
 * failure remains a failure.
 *
 * @param {string} slug
 * @param {{
 *   fetchFn?: typeof fetch,
 *   siteUrl?: string,
 *   now?: Date,
 *   schedule?: number[],
 *   sleepFn?: (ms: number) => Promise<unknown>,
 *   log?: (message?: unknown, ...optionalParams: unknown[]) => void,
 * }} [options]
 * @returns {Promise<{ ok: boolean, failures: string[], warnings: string[] }>}
 */
export async function verifyPublishWithRetries(
  slug,
  {
    fetchFn,
    siteUrl,
    now,
    schedule = RETRY_SCHEDULE_SECONDS,
    sleepFn = defaultSleep,
    log = console.log,
  } = {},
) {
  let result;
  for (let attempt = 0; attempt < schedule.length; attempt++) {
    const delaySeconds = schedule[attempt];
    if (delaySeconds > 0) {
      log(`Attempt ${attempt + 1}/${schedule.length}: waiting ${delaySeconds}s before checking...`);
      await sleepFn(delaySeconds * 1000);
    }
    log(`Attempt ${attempt + 1}/${schedule.length}: checking publish status for ${slug}...`);
    result = await checkPublish(slug, { fetchFn, siteUrl, now });
    if (result.ok) {
      for (const warning of result.warnings) log(`::warning::${warning}`);
      log(`Attempt ${attempt + 1}/${schedule.length}: all checks passed.`);
      return result;
    }
    log(`Attempt ${attempt + 1}/${schedule.length}: failed — ${result.failures.join("; ")}`);
  }
  return result;
}

// CLI entry point: node verifyPublish.mjs <slug>
// slug extraction from the candidate commit's own message stays in the
// workflow step (unchanged) — this takes the already-extracted slug.
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  const slug = process.argv[2];
  if (!slug) {
    console.error("usage: verifyPublish.mjs <slug>");
    process.exit(2);
  }
  const result = await verifyPublishWithRetries(slug, { log: console.log });
  if (!result.ok) {
    for (const failure of result.failures) console.error(`::error::${failure}`);
    console.error(
      "::error::Post-publish verification failed after exhausting the retry schedule.",
    );
    process.exit(1);
  }
  console.log("Post-publish acceptance passed.");
  process.exit(0);
}

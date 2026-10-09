#!/usr/bin/env node
/**
 * checkAlreadyPublished.mjs — read-only check of whether a given Daily
 * briefing slug is already live on the public RSS feed. Used by
 * parkio-daily-publish.yml's `check` job to decide whether to skip an
 * unnecessary redeploy of a day that's already published.
 *
 * Three distinct outcomes, not two: "published" / "not-published" /
 * "unknown" (feed unreachable, non-200, or doesn't look like a feed at
 * all). The "unknown" case is the one that matters most: a naive
 * fetch-then-search conflates "the feed said no" with "the feed
 * couldn't be read at all" — both just fail to find the slug. Treating
 * "unknown" as "not published" would let any feed.xml outage or
 * malformed response silently fall through to a real deploy, which is
 * exactly backwards — an inconclusive check must fail closed, not
 * default to "safe to proceed."
 */

import { fileURLToPath } from "node:url";

/**
 * @param {string} slug - e.g. "2026-10-09"
 * @param {object} [opts]
 * @param {string} [opts.feedUrl]
 * @param {typeof fetch} [opts.fetchImpl] - injectable for testing without real network access.
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<{status: "published"|"not-published"|"unknown", reason?: string}>}
 */
export async function checkAlreadyPublished(
  slug,
  { feedUrl = "https://parkio.info/feed.xml", fetchImpl = fetch, timeoutMs = 15_000 } = {},
) {
  if (!slug) {
    return { status: "unknown", reason: "no slug provided" };
  }

  let res;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      res = await fetchImpl(feedUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return { status: "unknown", reason: `request failed: ${err?.message ?? err}` };
  }

  if (!res.ok) {
    return { status: "unknown", reason: `HTTP ${res.status}` };
  }

  const body = await res.text();
  if (!/<rss|<feed/.test(body)) {
    return { status: "unknown", reason: "response does not look like RSS/Atom" };
  }

  return body.includes(`parkio-daily-${slug}`) ? { status: "published" } : { status: "not-published" };
}

// CLI entry point: node checkAlreadyPublished.mjs <slug>
// Prints exactly "published" or "not-published" to stdout and exits 0,
// OR prints an ::error:: to stderr and exits 1 for "unknown" — the
// fail-closed policy lives here, not duplicated in the calling workflow.
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  const slug = process.argv[2];
  const result = await checkAlreadyPublished(slug);
  if (result.status === "unknown") {
    console.error(
      `::error::Cannot determine publish status for parkio-daily-${slug}: ${result.reason}. Failing closed: refusing to deploy.`,
    );
    process.exit(1);
  }
  console.log(result.status);
  process.exit(0);
}

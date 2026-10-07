#!/usr/bin/env node
/**
 * resolveApprovedBaseline.mjs — answers "what application source SHA is
 * CURRENTLY approved for production?" for the Daily publisher.
 *
 * Deliberately does NOT consult git tags (production-release-* or
 * otherwise). A tag only records that a release was REQUESTED — it does
 * not prove it was ever deployed, and it does not reflect a later
 * rollback, hotfix, or any other out-of-band change to what is actually
 * live. "Newest tag" was the bug this script replaces.
 *
 * Instead it reads the one piece of state that is authoritative by
 * construction: the `workers/tag` annotation Cloudflare attaches directly
 * to the Worker Version object that is CURRENTLY serving 100% of traffic.
 * That annotation is written once, at the moment a version is created
 * (by `wrangler deploy --tag "sha:<SHA>"`), and is immutable afterwards.
 * A rollback (via the application-release workflow OR a raw
 * `wrangler rollback`) just changes which already-existing version
 * answers traffic — it can never change that version's own tag, which is
 * why resolving through it instead of through git automatically does the
 * right thing after a rollback without any extra rollback-specific logic.
 *
 * Fails closed (returns ok:false) on every ambiguous case: no deployment
 * found, more than one version currently splitting traffic (a gradual
 * rollout in progress), the active version missing a tag, a tag that
 * doesn't match the `sha:<40-hex>` convention, or a tagged sha that
 * doesn't exist in local git history. It never guesses.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SHA_TAG_PATTERN = /^sha:([0-9a-f]{40})$/;

export function parseVersionTag(tagValue) {
  if (typeof tagValue !== "string") return null;
  const m = SHA_TAG_PATTERN.exec(tagValue.trim());
  return m ? m[1] : null;
}

/**
 * @param {unknown} deploymentsListJson - parsed `wrangler deployments list --json`
 */
export function resolveActiveVersionId(deploymentsListJson) {
  if (!Array.isArray(deploymentsListJson) || deploymentsListJson.length === 0) {
    return { ok: false, error: "no deployments found for this Worker" };
  }

  // Order-independent by construction: the array's own order is NOT
  // documented Cloudflare API behavior (observed oldest-first against the
  // real `parkio` Worker, but never relied on here — that would be
  // resolving "the active version" from array position rather than from
  // actual state). "Most recent" is derived from each entry's own
  // created_on timestamp instead, so this is correct regardless of how the
  // API orders the response, now or in the future.
  for (const d of deploymentsListJson) {
    if (typeof d?.created_on !== "string" || Number.isNaN(Date.parse(d.created_on))) {
      return {
        ok: false,
        error: "one or more deployments is missing a valid created_on timestamp — refusing to guess ordering",
      };
    }
  }
  const latest = deploymentsListJson.reduce((a, b) =>
    Date.parse(a.created_on) >= Date.parse(b.created_on) ? a : b
  );

  const versions = Array.isArray(latest?.versions) ? latest.versions : [];
  const atFullTraffic = versions.filter((v) => v?.percentage === 100);

  if (versions.length !== 1 || atFullTraffic.length !== 1) {
    return {
      ok: false,
      error: `most recent deployment has ${versions.length} version(s) splitting traffic — refusing to guess during a gradual rollout`,
    };
  }
  return { ok: true, versionId: atFullTraffic[0].version_id };
}

/**
 * @param {object} opts
 * @param {unknown} opts.deploymentsListJson - parsed `wrangler deployments list --json`
 * @param {unknown} opts.versionsListJson - parsed `wrangler versions list --json`
 * @param {(sha: string) => boolean} [opts.gitShaExists] - defaults to checking the real repo
 */
export function resolveApprovedBaseline({
  deploymentsListJson,
  versionsListJson,
  gitShaExists = defaultGitShaExists,
}) {
  const active = resolveActiveVersionId(deploymentsListJson);
  if (!active.ok) return { ok: false, problems: [active.error] };

  const versions = Array.isArray(versionsListJson) ? versionsListJson : [];
  const version = versions.find((v) => v?.id === active.versionId);
  if (!version) {
    return {
      ok: false,
      problems: [`active version ${active.versionId} was not found in the versions list`],
    };
  }

  const tagValue = version.annotations?.["workers/tag"];
  const sha = parseVersionTag(tagValue);
  if (!sha) {
    return {
      ok: false,
      problems: [
        `active version ${active.versionId} has no valid "sha:<40-hex>" tag (got ${JSON.stringify(tagValue ?? null)}) — refusing to guess a baseline`,
      ],
    };
  }

  if (!gitShaExists(sha)) {
    return {
      ok: false,
      problems: [`active version's tagged sha ${sha} does not exist in local git history`],
    };
  }

  return { ok: true, sha, versionId: active.versionId };
}

function defaultGitShaExists(sha) {
  try {
    execFileSync("git", ["cat-file", "-e", sha], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function wranglerJson(args) {
  const out = execFileSync("npx", ["wrangler", ...args, "--json"], { encoding: "utf8" });
  return JSON.parse(out);
}

// CLI entry point: node resolveApprovedBaseline.mjs
// Prints the resolved sha to stdout on success (nothing else on stdout);
// writes problems as ::error:: lines and exits 1 on failure.
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const deploymentsListJson = wranglerJson([
      "deployments", "list", "--config", "wrangler.production.jsonc", "--name", "parkio",
    ]);
    const versionsListJson = wranglerJson([
      "versions", "list", "--config", "wrangler.production.jsonc", "--name", "parkio",
    ]);
    const result = resolveApprovedBaseline({ deploymentsListJson, versionsListJson });
    if (!result.ok) {
      for (const p of result.problems) console.error(`::error::${p}`);
      console.error("::error::Could not resolve the currently approved production baseline. Refusing to publish Daily content.");
      process.exit(1);
    }
    console.log(result.sha);
    process.exit(0);
  } catch (err) {
    console.error(`::error::Failed to query Cloudflare for the active Worker version: ${err?.message ?? err}`);
    process.exit(1);
  }
}

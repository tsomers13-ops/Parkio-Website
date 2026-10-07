#!/usr/bin/env node
/**
 * validatePublishCandidate.mjs — the security boundary for the no-approval
 * Daily publication path (parkio-daily-publish.yml).
 *
 * Proves, deterministically, that a candidate commit is an authorized Parkio
 * Daily content update and nothing else, BEFORE anything is built or
 * deployed without human review. This is the only thing standing between
 * "scheduled workflow created a commit" and "we deploy to production with
 * no approval" — it must fail closed on anything it cannot positively
 * confirm.
 *
 * Checks, all required:
 *   1. The candidate commit's author matches the Parkio Daily bot identity.
 *   2. Every path the candidate commit itself changed (diffed against its
 *      own immediate parent — NOT against `main`, so human commits already
 *      on `main` before the bot ran are never implicated) matches the
 *      allowlist below. Zero tolerance: one unexpected path fails the
 *      whole candidate.
 *   3. At least one changed path (an empty diff is not a valid publish).
 *
 * The allowlist is derived from scripts/parkio-daily/build.mjs and
 * social.mjs's own write paths (the only two files either script can ever
 * produce), cross-checked against 15 historical parkio-daily-bot commits
 * (2026-09-10 through 2026-10-07): every single one touched exactly these
 * two paths, never anything else.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const DAILY_BOT_AUTHOR_NAME = "parkio-daily-bot";
export const DAILY_BOT_AUTHOR_EMAIL =
  "parkio-daily-bot@users.noreply.github.com";

const DATE_SLUG = "\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])";
/** Matches content/guide/daily/parkio-daily-YYYY-MM-DD.json */
export const GUIDE_DAILY_PATTERN = new RegExp(
  `^content/guide/daily/parkio-daily-${DATE_SLUG}\\.json$`
);
/** Matches content/social/parkio-daily-YYYY-MM-DD.md */
export const SOCIAL_DAILY_PATTERN = new RegExp(
  `^content/social/parkio-daily-${DATE_SLUG}\\.md$`
);

export function isAllowedPath(p) {
  return GUIDE_DAILY_PATTERN.test(p) || SOCIAL_DAILY_PATTERN.test(p);
}

/**
 * Pure function over pre-gathered git facts, so it's testable without a
 * real git repo. The CLI wrapper below supplies these from the real repo.
 */
export function validateCandidate({ authorName, authorEmail, changedPaths }) {
  const problems = [];

  if (authorName !== DAILY_BOT_AUTHOR_NAME || authorEmail !== DAILY_BOT_AUTHOR_EMAIL) {
    problems.push(
      `author mismatch: expected ${DAILY_BOT_AUTHOR_NAME} <${DAILY_BOT_AUTHOR_EMAIL}>, got ${authorName} <${authorEmail}>`
    );
  }

  if (changedPaths.length === 0) {
    problems.push("candidate commit changes no files — nothing to publish");
  }

  const disallowed = changedPaths.filter((p) => !isAllowedPath(p));
  if (disallowed.length > 0) {
    problems.push(
      `candidate touches path(s) outside the Daily content allowlist: ${disallowed.join(", ")}`
    );
  }

  return {
    ok: problems.length === 0,
    problems,
    allowedPaths: changedPaths.filter(isAllowedPath),
  };
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function runFromRepo(sha) {
  const authorName = git(["show", "-s", "--format=%an", sha]);
  const authorEmail = git(["show", "-s", "--format=%ae", sha]);
  const changedPaths = git(["diff", "--name-only", `${sha}^`, sha])
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return validateCandidate({ authorName, authorEmail, changedPaths });
}

// CLI entry point: node validatePublishCandidate.mjs <sha>
// Compared via fileURLToPath (not a raw string/URL concat) because paths
// containing spaces or other special characters are percent-encoded in
// import.meta.url but not in process.argv[1] — a naive comparison silently
// never matches, which would make this whole CLI a silent no-op that always
// exits 0 regardless of input. Caught by testing before this ever reached a
// workflow; do not revert to the naive form.
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  const sha = process.argv[2];
  if (!sha) {
    console.error("usage: validatePublishCandidate.mjs <candidate-sha>");
    process.exit(2);
  }
  const result = runFromRepo(sha);
  if (!result.ok) {
    for (const p of result.problems) {
      console.error(`::error::${p}`);
    }
    console.error(
      `::error::Refusing to publish ${sha} without human review — this does not look like an authorized Parkio Daily content update.`
    );
    process.exit(1);
  }
  console.log(`Candidate ${sha} validated — Daily content only:`);
  for (const p of result.allowedPaths) console.log(`  ${p}`);
  process.exit(0);
}

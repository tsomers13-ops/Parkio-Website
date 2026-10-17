#!/usr/bin/env node
/**
 * composeValidatedHistory.mjs — decides which Daily content files to
 * overlay onto the approved application baseline, across the FULL commit
 * range since that baseline, not just the single latest candidate commit.
 *
 * The bug this replaces: "Compose the publish tree" only ever diffed and
 * applied ${{ inputs.sha }} against its own parent. A missed-day publish,
 * two content-only publishes back to back, or a baseline that jumps
 * forward past several already-validated Daily commits would each cause
 * this to silently drop earlier Daily content that was never superseded —
 * it just never got applied because it wasn't the single most recent
 * commit.
 *
 * Walks every commit strictly between the baseline and the candidate
 * (oldest first) and, for each one that touches at least one Daily-shaped
 * path, requires it to pass the exact same validateCandidate() check
 * validatePublishCandidate.mjs already uses as the no-human-approval
 * security boundary — author identity plus a closed allowlist of paths.
 * A commit that doesn't touch any Daily-shaped path at all (ordinary
 * application commits making up the bulk of history) is simply skipped:
 * it isn't part of Daily content and never was. A commit that DOES touch
 * a Daily-shaped path but fails that check is NOT skipped — it fails the
 * whole composition closed, since that is, by definition, an unvalidated
 * mutation of Daily content sitting in the history we're about to replay.
 * Never looks at, or imports, any non-Daily path — only `isAllowedPath`
 * from validatePublishCandidate.mjs decides what counts as a Daily path.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { isAllowedPath, validateCandidate } from "./validatePublishCandidate.mjs";

/**
 * Pure function over pre-gathered git facts — testable without a real
 * repo, same split as validateCandidate() in validatePublishCandidate.mjs.
 *
 * @param {{ sha: string, authorName: string, authorEmail: string, changedPaths: string[] }[]} commits
 *   Oldest first, strictly after the baseline, up to and including the
 *   candidate commit.
 * @returns {{ ok: true, overlay: { sha: string, path: string }[] } | { ok: false, problems: string[] }}
 */
export function planHistoryOverlay(commits) {
  // path -> { sha, path }. A later commit's entry for the same path
  // overwrites an earlier one, so the final overlay always reflects the
  // most recent validated version of each Daily file — processing
  // oldest-first makes that a plain overwrite rather than needing any
  // explicit "keep the newest" comparison.
  const overlayByPath = new Map();

  for (const commit of commits) {
    const touchesDailyPath = commit.changedPaths.some(isAllowedPath);
    if (!touchesDailyPath) continue;

    const result = validateCandidate({
      authorName: commit.authorName,
      authorEmail: commit.authorEmail,
      changedPaths: commit.changedPaths,
    });
    if (!result.ok) {
      return {
        ok: false,
        problems: [
          `commit ${commit.sha} touches a Daily-shaped path but fails validation: ${result.problems.join("; ")}`,
        ],
      };
    }

    for (const path of result.allowedPaths) {
      overlayByPath.set(path, { sha: commit.sha, path });
    }
  }

  return { ok: true, overlay: Array.from(overlayByPath.values()) };
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

/**
 * Git-wired fact gathering for every commit strictly after `baseline` up
 * to and including `candidateSha`, oldest first. Mirrors
 * validatePublishCandidate.mjs's runFromRepo(), just over a range instead
 * of a single commit.
 */
export function commitsBetween(baseline, candidateSha) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", baseline, candidateSha], {
      stdio: "ignore",
    });
  } catch {
    throw new Error(
      `approved baseline ${baseline} is not an ancestor of candidate ${candidateSha}`,
    );
  }

  const shas = git(["log", "--format=%H", "--reverse", `${baseline}..${candidateSha}`])
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  return shas.map((sha) => ({
    sha,
    authorName: git(["show", "-s", "--format=%an", sha]),
    authorEmail: git(["show", "-s", "--format=%ae", sha]),
    changedPaths: git(["diff", "--name-only", `${sha}^`, sha])
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  }));
}

// CLI entry point: node composeValidatedHistory.mjs <baseline-sha> <candidate-sha>
// Prints one "<sha> <path>" line per file to overlay, oldest-contributing-
// commit-order is not guaranteed or meaningful in the output — only the
// final sha/path pairing is. Nothing else on stdout on success. Fails
// closed with ::error:: lines and exit 1 on any unvalidated Daily
// mutation or git error.
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  const [baseline, candidateSha] = process.argv.slice(2);
  if (!baseline || !candidateSha) {
    console.error("usage: composeValidatedHistory.mjs <baseline-sha> <candidate-sha>");
    process.exit(2);
  }
  try {
    const commits = commitsBetween(baseline, candidateSha);
    const result = planHistoryOverlay(commits);
    if (!result.ok) {
      for (const p of result.problems) console.error(`::error::${p}`);
      console.error(
        "::error::Refusing to compose the publish tree — unvalidated Daily content mutation found in history between the baseline and the candidate.",
      );
      process.exit(1);
    }
    for (const { sha, path } of result.overlay) {
      console.log(`${sha} ${path}`);
    }
    process.exit(0);
  } catch (err) {
    console.error(`::error::composeValidatedHistory.mjs failed: ${err?.message ?? err}`);
    process.exit(1);
  }
}

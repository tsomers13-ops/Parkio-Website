#!/usr/bin/env node
/**
 * composeValidatedHistory.mjs — decides which Daily content files to
 * overlay onto the approved application baseline, across the FULL commit
 * range since that baseline, not just the single latest candidate commit.
 *
 * The bug this originally replaced: "Compose the publish tree" only ever
 * diffed and applied ${{ inputs.sha }} against its own parent. A
 * missed-day publish, two content-only publishes back to back, or a
 * baseline that jumps forward past several already-validated Daily
 * commits would each cause this to silently drop earlier Daily content
 * that was never superseded — it just never got applied because it
 * wasn't the single most recent commit.
 *
 * CORRECTIVE FIX (two independently reproduced trust-logic bugs in the
 * first version of this file):
 *
 *   1. The commit walk used plain ancestry (`git log --reverse
 *      baseline..candidate`), which includes every ancestor reachable
 *      from the candidate — INCLUDING side-branch commits a human merge
 *      deliberately discarded (e.g. `git merge --no-ff -s ours`). A bot
 *      Daily commit sitting only on the discarded side branch would still
 *      be found by that walk, validate fine on its own, and get
 *      scheduled for publication even though it is provably absent from
 *      the candidate's actual tree. Fixed by walking ONLY the candidate's
 *      first-parent chain (`git log --first-parent`), which an `-s ours`
 *      merge — by construction — excludes the discarded side branch from
 *      entirely, since the side commit is never the merge commit's first
 *      parent.
 *
 *   2. Per-commit diffing used `git diff --name-only`, which for a
 *      detected rename (R100) prints ONLY the destination path, never
 *      the source. A human rename FROM an allowlisted Daily path TO a
 *      disallowed path (e.g. into an `archive/` dump) was therefore
 *      invisible at the source side: the commit's only visible "changed
 *      path" was the disallowed destination, isAllowedPath() on that
 *      single path still correctly flagged it as disallowed... but ONLY
 *      if something else in the same commit also touched an allowed
 *      path — otherwise `touchesDailyPath` could miss it entirely,
 *      silently classifying the commit as "doesn't touch Daily content"
 *      and skipping it, leaving the original file's presence in the
 *      baseline tree unexamined and potentially resurrected. Fixed by
 *      using `git diff --name-status -M -C -z`, which reports BOTH sides
 *      of a rename or copy, and feeding both into validation.
 *
 * The root fix for both is the same shape: never trust a single
 * derived signal (ancestry OR a one-sided diff) in isolation. Every
 * overlay/removal decision this module produces is additionally
 * cross-checked, in resolvePublishPlan() below, against literal
 * existence (or absence) of each path in the CANDIDATE'S OWN FINAL TREE
 * — not reconstructed from intermediate commit state — before it is
 * trusted. A path planned for application is always read FROM the
 * candidate's tree (never from whichever intermediate commit happened to
 * introduce it), so "what gets published" and "what the candidate commit
 * actually contains" cannot diverge. Discarded, deleted, or reverted
 * content cannot be resurrected this way: if the final tree disagrees
 * with the plan the commit walk produced, composition fails closed
 * instead of guessing.
 *
 * Walks every commit on the candidate's first-parent chain after the
 * baseline (oldest first) and, for each one that touches at least one
 * Daily-shaped path (on EITHER side of a rename/copy), requires it to
 * pass the exact same validateCandidate() check validatePublishCandidate.mjs
 * already uses as the no-human-approval security boundary — author
 * identity plus a closed allowlist of paths, now checked against every
 * path a rename or copy touches, not just its destination. A commit that
 * doesn't touch any Daily-shaped path at all (ordinary application
 * commits making up the bulk of history) is simply skipped: it isn't
 * part of Daily content and never was. A commit that DOES touch a
 * Daily-shaped path but fails that check is NOT skipped — it fails the
 * whole composition closed, since that is, by definition, an unvalidated
 * mutation of Daily content sitting in the history we're about to
 * replay. Never looks at, or imports, any non-Daily path — only
 * `isAllowedPath` from validatePublishCandidate.mjs decides what counts
 * as a Daily path.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { isAllowedPath, validateCandidate } from "./validatePublishCandidate.mjs";

/**
 * Pure function over pre-gathered git facts — testable without a real
 * repo, same split as validateCandidate() in validatePublishCandidate.mjs.
 *
 * Does NOT decide where applied content is read from (that would require
 * trusting an intermediate commit's sha) — it only decides, per path,
 * whether the validated history calls for the path to be present
 * ("apply") or absent ("remove") by the time composition finishes.
 * resolvePublishPlan() below is responsible for sourcing "apply" content
 * from the candidate's own final tree and for cross-checking both
 * outcomes against that tree.
 *
 * @param {{
 *   sha: string,
 *   authorName: string,
 *   authorEmail: string,
 *   changedPaths: string[],
 *   fileEvents: { type: "apply" | "remove", path: string }[],
 * }[]} commits
 *   Oldest first, on the candidate's first-parent chain, strictly after
 *   the baseline, up to and including the candidate commit.
 * @returns {{ ok: true, overlay: { op: "apply" | "remove", path: string }[] } | { ok: false, problems: string[] }}
 */
export function planHistoryOverlay(commits) {
  // path -> { op, path }. A later commit's entry for the same path
  // overwrites an earlier one, so the final plan always reflects the
  // most recent validated event for each Daily file — processing
  // oldest-first makes that a plain overwrite rather than needing any
  // explicit "keep the newest" comparison. A rename contributes TWO
  // events (remove the old path, apply the new one), which land as two
  // separate map entries since they're different paths.
  const planByPath = new Map();

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

    for (const event of commit.fileEvents) {
      // Defensive, should be unreachable: every fileEvents path is drawn
      // from the same diff as changedPaths, which validateCandidate just
      // confirmed contains no disallowed path.
      if (!isAllowedPath(event.path)) continue;
      planByPath.set(event.path, { op: event.type, path: event.path });
    }
  }

  return { ok: true, overlay: Array.from(planByPath.values()) };
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

/** Raw (untrimmed) git invocation — needed for -z output, where a
 * trailing NUL is meaningful field structure, not incidental whitespace
 * `.trim()` would otherwise be safe to strip. */
function gitRaw(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

/**
 * Parses `git diff --name-status -z` output into structured entries,
 * capturing both sides of a rename/copy (-M/-C) instead of only the
 * destination. With -z, each field — including the status — is NUL
 * terminated rather than tab/newline-separated, which is what makes a
 * rename record (`<status>\0<oldpath>\0<newpath>\0`) unambiguous to
 * parse regardless of any special characters in a path.
 *
 * @param {string} raw
 * @returns {({ status: string, path: string } | { status: string, oldPath: string, newPath: string })[]}
 */
export function parseNameStatusZ(raw) {
  const tokens = raw.split("\0").filter((t) => t.length > 0);
  const entries = [];
  let i = 0;
  while (i < tokens.length) {
    const status = tokens[i++];
    if (status[0] === "R" || status[0] === "C") {
      const oldPath = tokens[i++];
      const newPath = tokens[i++];
      entries.push({ status, oldPath, newPath });
    } else {
      const path = tokens[i++];
      entries.push({ status, path });
    }
  }
  return entries;
}

/**
 * Turns parsed name-status entries into the two things planHistoryOverlay
 * needs: every path touched on EITHER side of a rename/copy (for
 * validateCandidate's allowlist check), and the apply/remove event each
 * entry implies.
 *
 *   - Add/Modify/Type-change (or any status not otherwise handled below):
 *     the path is present with new content afterward -> apply.
 *   - Delete: the path is gone afterward -> remove.
 *   - Rename: the OLD path is gone (-> remove) and the NEW path is
 *     present (-> apply). Both paths are fed to validation, so a rename
 *     from an allowed path to a disallowed one fails closed on the
 *     disallowed destination, and a rename IN from a disallowed source
 *     fails closed too.
 *   - Copy: the source is untouched (still exists, unchanged) — only the
 *     new path is an event. Still fed to validation on both sides.
 *
 * @param {ReturnType<typeof parseNameStatusZ>} entries
 */
function toChangesAndEvents(entries) {
  const changedPaths = [];
  const fileEvents = [];
  for (const entry of entries) {
    if (entry.status[0] === "R") {
      changedPaths.push(entry.oldPath, entry.newPath);
      fileEvents.push({ type: "remove", path: entry.oldPath });
      fileEvents.push({ type: "apply", path: entry.newPath });
    } else if (entry.status[0] === "C") {
      changedPaths.push(entry.oldPath, entry.newPath);
      fileEvents.push({ type: "apply", path: entry.newPath });
    } else if (entry.status[0] === "D") {
      changedPaths.push(entry.path);
      fileEvents.push({ type: "remove", path: entry.path });
    } else {
      changedPaths.push(entry.path);
      fileEvents.push({ type: "apply", path: entry.path });
    }
  }
  return { changedPaths, fileEvents };
}

/**
 * Git-wired fact gathering for every commit on the candidate's
 * first-parent chain, strictly after `baseline`, up to and including
 * `candidateSha`, oldest first. Mirrors validatePublishCandidate.mjs's
 * runFromRepo(), extended over a range and over rename/copy-aware
 * name-status instead of a single commit's name-only diff.
 *
 * `--first-parent` is the fix for bug #1 (side-branch content discarded
 * by an `-s ours` merge must never surface here): it restricts the walk
 * to the chain of commits that are actually "the candidate's own
 * history" as git itself defines it for a merge, excluding any commit
 * that only exists on a branch a merge chose not to take.
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

  const shas = git(["log", "--first-parent", "--format=%H", "--reverse", `${baseline}..${candidateSha}`])
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  return shas.map((sha) => {
    const entries = parseNameStatusZ(gitRaw(["diff", "--name-status", "-M", "-C", "-z", `${sha}^`, sha]));
    const { changedPaths, fileEvents } = toChangesAndEvents(entries);
    return {
      sha,
      authorName: git(["show", "-s", "--format=%an", sha]),
      authorEmail: git(["show", "-s", "--format=%ae", sha]),
      changedPaths,
      fileEvents,
    };
  });
}

function pathExistsInTree(treeish, filePath) {
  try {
    execFileSync("git", ["cat-file", "-e", `${treeish}:${filePath}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * The full, git-wired decision: validates history (via commitsBetween +
 * planHistoryOverlay) and then cross-checks every resulting apply/remove
 * decision against the candidate's OWN final tree before trusting it.
 * "Apply" entries are always sourced from `candidateSha` itself (never
 * from whichever intermediate commit introduced the change) — this is
 * what guarantees overlay output can never disagree with what the
 * candidate commit actually, literally contains.
 *
 * @returns {{ ok: true, overlay: { op: "apply" | "remove", path: string, sha?: string }[] } | { ok: false, problems: string[] }}
 */
export function resolvePublishPlan(baseline, candidateSha) {
  const commits = commitsBetween(baseline, candidateSha);
  const planResult = planHistoryOverlay(commits);
  if (!planResult.ok) return planResult;

  const problems = [];
  const overlay = [];
  for (const entry of planResult.overlay) {
    const existsInFinalTree = pathExistsInTree(candidateSha, entry.path);
    if (entry.op === "apply") {
      if (!existsInFinalTree) {
        problems.push(
          `internal inconsistency: ${entry.path} was planned for application but does not exist in the candidate's final tree (${candidateSha}) — refusing to proceed.`,
        );
        continue;
      }
      overlay.push({ op: "apply", path: entry.path, sha: candidateSha });
    } else {
      if (existsInFinalTree) {
        problems.push(
          `internal inconsistency: ${entry.path} was planned for removal but still exists in the candidate's final tree (${candidateSha}) — refusing to proceed.`,
        );
        continue;
      }
      overlay.push({ op: "remove", path: entry.path });
    }
  }

  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, overlay };
}

// CLI entry point: node composeValidatedHistory.mjs <baseline-sha> <candidate-sha>
// Prints one line per planned operation:
//   apply <candidate-sha> <path>
//   remove - <path>
// (the literal "-" keeps every line exactly three space-separated
// fields, regardless of op — paths here are always drawn from the
// existing no-space Daily content allowlist, so naive splitting on
// whitespace in the workflow consumer is safe). Nothing else on stdout
// on success. Fails closed with ::error:: lines and exit 1 on any
// unvalidated Daily mutation, final-tree inconsistency, or git error.
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  const [baseline, candidateSha] = process.argv.slice(2);
  if (!baseline || !candidateSha) {
    console.error("usage: composeValidatedHistory.mjs <baseline-sha> <candidate-sha>");
    process.exit(2);
  }
  try {
    const result = resolvePublishPlan(baseline, candidateSha);
    if (!result.ok) {
      for (const p of result.problems) console.error(`::error::${p}`);
      console.error(
        "::error::Refusing to compose the publish tree — unvalidated or inconsistent Daily content mutation found between the baseline and the candidate.",
      );
      process.exit(1);
    }
    for (const entry of result.overlay) {
      console.log(`${entry.op} ${entry.op === "apply" ? entry.sha : "-"} ${entry.path}`);
    }
    process.exit(0);
  } catch (err) {
    console.error(`::error::composeValidatedHistory.mjs failed: ${err?.message ?? err}`);
    process.exit(1);
  }
}

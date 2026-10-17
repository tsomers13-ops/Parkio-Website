import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  commitsBetween,
  planHistoryOverlay,
  resolvePublishPlan,
} from "@/scripts/parkio-daily/composeValidatedHistory.mjs";

// Real-git regressions for "Compose the publish tree"'s history-overlay
// logic — mirrors tests/dailyBuildShallowCloneHistory.test.ts's approach
// of exercising actual git history rather than mocking it, since the bug
// classes here (which commits a range walk picks up or excludes, and
// how a rename is reported) are properties of real git semantics, not
// something a mocked git client would reproduce faithfully.
//
// Two independently reproduced trust-logic bugs motivated this file's
// current shape:
//   1. Plain ancestry walking (no --first-parent) picks up bot Daily
//      commits sitting only on a side branch a human `-s ours` merge
//      deliberately discarded.
//   2. `git diff --name-only` for a rename reports only the destination
//      path, never the source — a rename FROM an allowed Daily path TO
//      a disallowed one was invisible on the source side.
// resolvePublishPlan() is the full, corrected decision (commit-history
// validation PLUS a final cross-check against the candidate's own
// tree) and is what these tests exercise almost throughout, since it's
// what the CLI — and therefore the workflow — actually calls.
//
// commitsBetween()'s internal `git()` helper has no cwd parameter (same
// shape as validatePublishCandidate.mjs's own git-wired runFromRepo()),
// so these tests process.chdir() into a scratch repo for the duration of
// each call and always restore the original cwd, including on failure.

const BOT_ENV = {
  GIT_AUTHOR_NAME: "parkio-daily-bot",
  GIT_AUTHOR_EMAIL: "parkio-daily-bot@users.noreply.github.com",
  GIT_COMMITTER_NAME: "parkio-daily-bot",
  GIT_COMMITTER_EMAIL: "parkio-daily-bot@users.noreply.github.com",
};
const HUMAN_ENV = {
  GIT_AUTHOR_NAME: "tsomers13-ops",
  GIT_AUTHOR_EMAIL: "tsomers13@gmail.com",
  GIT_COMMITTER_NAME: "tsomers13-ops",
  GIT_COMMITTER_EMAIL: "tsomers13@gmail.com",
};

function dailyPath(date: string) {
  return `content/guide/daily/parkio-daily-${date}.json`;
}

describe("composeValidatedHistory — real-git regressions", () => {
  let tmp: string;
  let repo: string;
  let originalCwd: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "compose-validated-history-"));
    repo = path.join(tmp, "repo");
    fs.mkdirSync(repo);
    execFileSync("git", ["init", "-b", "main", repo]);
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function commit(relPath: string, content: string, message: string, env: Record<string, string>) {
    const full = path.join(repo, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
    execFileSync("git", ["add", "."], { cwd: repo });
    execFileSync("git", ["commit", "-m", message], { cwd: repo, env: { ...process.env, ...env } });
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  }

  function headSha() {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  }

  function withRepoCwd<T>(fn: () => T): T {
    process.chdir(repo);
    try {
      return fn();
    } finally {
      process.chdir(originalCwd);
    }
  }

  it("a missed-day publish: both the skipped day's and the next day's commits are overlaid, not just the latest", () => {
    const baseline = commit("app.txt", "v1\n", "Initial app baseline", HUMAN_ENV);
    commit(dailyPath("2026-10-09"), "{}\n", "Parkio Daily — 2026-10-09", BOT_ENV);
    const candidate = commit(dailyPath("2026-10-10"), "{}\n", "Parkio Daily — 2026-10-10", BOT_ENV);

    const result = withRepoCwd(() => resolvePublishPlan(baseline, candidate));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const applyPaths = result.overlay.filter((o) => o.op === "apply").map((o) => o.path).sort();
    expect(applyPaths).toEqual([dailyPath("2026-10-09"), dailyPath("2026-10-10")]);
    expect(result.overlay.every((o) => o.op === "apply" && o.sha === candidate)).toBe(true);
  });

  it("consecutive content-only publishes while the baseline is unchanged: a second run still carries the first day forward", () => {
    const baseline = commit("app.txt", "v1\n", "Initial app baseline", HUMAN_ENV);
    const firstRun = commit(dailyPath("2026-10-11"), "{}\n", "Parkio Daily — 2026-10-11", BOT_ENV);
    const secondRun = commit(dailyPath("2026-10-12"), "{}\n", "Parkio Daily — 2026-10-12", BOT_ENV);

    const firstResult = withRepoCwd(() => resolvePublishPlan(baseline, firstRun));
    expect(firstResult.ok).toBe(true);
    if (firstResult.ok) {
      expect(firstResult.overlay.map((o) => o.path)).toEqual([dailyPath("2026-10-11")]);
    }

    // Second publish run against the SAME unmoved baseline (the Worker
    // annotation still points at it) must still include the first day —
    // this is exactly what the single-commit-diff bug dropped.
    const secondResult = withRepoCwd(() => resolvePublishPlan(baseline, secondRun));
    expect(secondResult.ok).toBe(true);
    if (secondResult.ok) {
      const paths = secondResult.overlay.map((o) => o.path).sort();
      expect(paths).toEqual([dailyPath("2026-10-11"), dailyPath("2026-10-12")]);
    }
  });

  it("a later full app release: older Daily history already folded into the new baseline is not replayed again", () => {
    commit("app.txt", "v1\n", "Initial app baseline", HUMAN_ENV);
    commit(dailyPath("2026-10-13"), "{}\n", "Parkio Daily — 2026-10-13", BOT_ENV);
    // The new application release is a descendant of the day-13 Daily
    // commit, so day 13's content is already present in its tree — this
    // commit is the new approved baseline from here on.
    const newBaseline = commit("app.txt", "v2\n", "Release: app v2", HUMAN_ENV);
    const candidate = commit(dailyPath("2026-10-14"), "{}\n", "Parkio Daily — 2026-10-14", BOT_ENV);

    const result = withRepoCwd(() => resolvePublishPlan(newBaseline, candidate));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const paths = result.overlay.map((o) => o.path);
    expect(paths).toEqual([dailyPath("2026-10-14")]);
  });

  it("fails closed when the approved baseline is not an ancestor of the candidate", () => {
    const common = commit("app.txt", "v1\n", "Initial app baseline", HUMAN_ENV);
    const candidate = commit(dailyPath("2026-10-14"), "{}\n", "Parkio Daily — 2026-10-14", BOT_ENV);

    execFileSync("git", ["checkout", "-b", "diverged", common], { cwd: repo });
    const divergedBaseline = commit("app.txt", "diverged\n", "Diverged app release", HUMAN_ENV);

    expect(() => withRepoCwd(() => commitsBetween(divergedBaseline, candidate))).toThrow(
      "is not an ancestor",
    );
  });

  it("skips ordinary application commits that never touch a Daily-shaped path, instead of failing on them", () => {
    const baseline = commit("app.txt", "v1\n", "Initial app baseline", HUMAN_ENV);
    commit("README.md", "docs change\n", "Update README", HUMAN_ENV);
    const candidate = commit(dailyPath("2026-10-15"), "{}\n", "Parkio Daily — 2026-10-15", BOT_ENV);

    const result = withRepoCwd(() => resolvePublishPlan(baseline, candidate));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.overlay.map((o) => o.path)).toEqual([dailyPath("2026-10-15")]);
  });

  it("fails closed when a commit touches a Daily-shaped path alongside a disallowed one, even though a later commit is fully valid", () => {
    const baseline = commit("app.txt", "v1\n", "Initial app baseline", HUMAN_ENV);
    // A compromised or malfunctioning bot commit: a real Daily file
    // riding along with an application file in the SAME commit.
    fs.mkdirSync(path.join(repo, path.dirname(dailyPath("2026-10-16"))), { recursive: true });
    fs.writeFileSync(path.join(repo, dailyPath("2026-10-16")), "{}\n");
    fs.writeFileSync(path.join(repo, "app.txt"), "v1-tampered\n");
    execFileSync("git", ["add", "."], { cwd: repo });
    execFileSync("git", ["commit", "-m", "Parkio Daily — 2026-10-16"], {
      cwd: repo,
      env: { ...process.env, ...BOT_ENV },
    });
    const candidate = commit(dailyPath("2026-10-17"), "{}\n", "Parkio Daily — 2026-10-17", BOT_ENV);

    const result = withRepoCwd(() => resolvePublishPlan(baseline, candidate));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.join(" ")).toContain("fails validation");
  });

  // ─────────────────────── corrective-fix regressions ───────────────────────

  it("BUG #1 — a bot Daily file discarded by a human `-s ours` merge on a side branch is never overlaid", () => {
    const baseline = commit("app.txt", "v1\n", "Initial app baseline", HUMAN_ENV);

    execFileSync("git", ["checkout", "-b", "side", baseline], { cwd: repo });
    commit(dailyPath("2026-10-18"), "{}\n", "Parkio Daily — 2026-10-18", BOT_ENV);

    execFileSync("git", ["checkout", "main"], { cwd: repo });
    execFileSync(
      "git",
      ["merge", "--no-ff", "-s", "ours", "-m", "Merge pull request: discard side/2026-10-18", "side"],
      { cwd: repo, env: { ...process.env, ...HUMAN_ENV } },
    );

    const candidate = commit(dailyPath("2026-10-19"), "{}\n", "Parkio Daily — 2026-10-19", BOT_ENV);

    const result = withRepoCwd(() => resolvePublishPlan(baseline, candidate));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const paths = result.overlay.map((o) => o.path);
    expect(paths).toEqual([dailyPath("2026-10-19")]);
    expect(paths).not.toContain(dailyPath("2026-10-18"));

    // Sanity: the discarded file really is absent from the candidate's
    // own tree — confirms the test setup reproduces the described bug
    // shape, not just that the function returns the expected list.
    expect(() =>
      withRepoCwd(() =>
        execFileSync("git", ["cat-file", "-e", `${candidate}:${dailyPath("2026-10-18")}`], {
          stdio: "ignore",
        }),
      ),
    ).toThrow();
  });

  it("BUG #2 — a human R100 rename from an allowlisted Daily file to a disallowed archive path fails closed", () => {
    // The baseline itself is the bot commit that adds the file, so the
    // rename commit is the only thing in baseline..candidate.
    const baseline = commit(dailyPath("2026-10-20"), "{}\n", "Parkio Daily — 2026-10-20", BOT_ENV);

    fs.mkdirSync(path.join(repo, "archive"), { recursive: true });
    execFileSync("git", ["mv", dailyPath("2026-10-20"), "archive/discarded.json"], { cwd: repo });
    execFileSync("git", ["commit", "-m", "Archive old Daily content"], {
      cwd: repo,
      env: { ...process.env, ...HUMAN_ENV },
    });
    const candidate = headSha();

    const result = withRepoCwd(() => resolvePublishPlan(baseline, candidate));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.join(" ")).toContain("fails validation");
  });

  it("a human deletion of Daily content fails closed", () => {
    const baseline = commit("app.txt", "v1\n", "Initial app baseline", HUMAN_ENV);
    const dayPath = dailyPath("2026-10-21");
    commit(dayPath, "{}\n", "Parkio Daily — 2026-10-21", BOT_ENV);

    fs.rmSync(path.join(repo, dayPath));
    execFileSync("git", ["add", "."], { cwd: repo });
    execFileSync("git", ["commit", "-m", "Revert accidental Daily publish"], {
      cwd: repo,
      env: { ...process.env, ...HUMAN_ENV },
    });
    const candidate = headSha();

    const result = withRepoCwd(() => resolvePublishPlan(baseline, candidate));

    expect(result.ok).toBe(false);
  });

  it("a validated bot deletion agrees with the candidate's final tree and cannot resurrect the removed content", () => {
    const baseline = commit("app.txt", "v1\n", "Initial app baseline", HUMAN_ENV);
    const dayPath = dailyPath("2026-10-22");
    commit(dayPath, "{}\n", "Parkio Daily — 2026-10-22", BOT_ENV);

    fs.rmSync(path.join(repo, dayPath));
    execFileSync("git", ["add", "."], { cwd: repo });
    execFileSync("git", ["commit", "-m", "Parkio Daily — 2026-10-22 retraction"], {
      cwd: repo,
      env: { ...process.env, ...BOT_ENV },
    });
    const candidate = headSha();

    const result = withRepoCwd(() => resolvePublishPlan(baseline, candidate));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The LATER (delete) event must win over the earlier (add) event for
    // the same path — the file must never be scheduled for application.
    expect(result.overlay).toEqual([{ op: "remove", path: dayPath }]);
  });

  it("a validated bot rename between two allowed Daily paths removes the old path and applies the new one", () => {
    const baseline = commit("app.txt", "v1\n", "Initial app baseline", HUMAN_ENV);
    const fromPath = dailyPath("2026-10-23");
    commit(fromPath, "{}\n", "Parkio Daily — 2026-10-23", BOT_ENV);

    const toPath = dailyPath("2026-10-24");
    execFileSync("git", ["mv", fromPath, toPath], { cwd: repo });
    execFileSync("git", ["commit", "-m", "Parkio Daily — 2026-10-24 (relabel)"], {
      cwd: repo,
      env: { ...process.env, ...BOT_ENV },
    });
    const candidate = headSha();

    const result = withRepoCwd(() => resolvePublishPlan(baseline, candidate));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byPath = new Map(result.overlay.map((o) => [o.path, o.op]));
    expect(byPath.get(fromPath)).toBe("remove");
    expect(byPath.get(toPath)).toBe("apply");
  });
});

describe("planHistoryOverlay — pure unit coverage", () => {
  it("fails closed on a commit whose only recorded event path is disallowed, even if changedPaths also lists an allowed one from a rename", () => {
    const result = planHistoryOverlay([
      {
        sha: "deadbeef",
        authorName: "tsomers13-ops",
        authorEmail: "tsomers13@gmail.com",
        changedPaths: [
          "content/guide/daily/parkio-daily-2026-10-25.json",
          "archive/discarded.json",
        ],
        fileEvents: [
          { type: "remove", path: "content/guide/daily/parkio-daily-2026-10-25.json" },
          { type: "apply", path: "archive/discarded.json" },
        ],
      },
    ]);
    expect(result.ok).toBe(false);
  });

  it("skips a commit whose changedPaths contain no Daily-shaped path at all", () => {
    const result = planHistoryOverlay([
      {
        sha: "cafef00d",
        authorName: "tsomers13-ops",
        authorEmail: "tsomers13@gmail.com",
        changedPaths: ["README.md"],
        fileEvents: [{ type: "apply", path: "README.md" }],
      },
    ]);
    expect(result).toEqual({ ok: true, overlay: [] });
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { commitsBetween, planHistoryOverlay } from "@/scripts/parkio-daily/composeValidatedHistory.mjs";

// Real-git regressions for "Compose the publish tree"'s history-overlay
// logic — mirrors tests/dailyBuildShallowCloneHistory.test.ts's approach
// of exercising actual git history rather than mocking it, since the bug
// class here (which commits a range walk picks up or excludes) is a
// property of real git ancestry, not something a mocked git client would
// reproduce faithfully.
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

    const result = withRepoCwd(() => {
      const commits = commitsBetween(baseline, candidate);
      return planHistoryOverlay(commits);
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const paths = result.overlay.map((o) => o.path).sort();
    expect(paths).toEqual([dailyPath("2026-10-09"), dailyPath("2026-10-10")]);
  });

  it("consecutive content-only publishes while the baseline is unchanged: a second run still carries the first day forward", () => {
    const baseline = commit("app.txt", "v1\n", "Initial app baseline", HUMAN_ENV);
    const firstRun = commit(dailyPath("2026-10-11"), "{}\n", "Parkio Daily — 2026-10-11", BOT_ENV);
    const secondRun = commit(dailyPath("2026-10-12"), "{}\n", "Parkio Daily — 2026-10-12", BOT_ENV);

    const firstResult = withRepoCwd(() => planHistoryOverlay(commitsBetween(baseline, firstRun)));
    expect(firstResult.ok).toBe(true);
    if (firstResult.ok) {
      expect(firstResult.overlay.map((o) => o.path)).toEqual([dailyPath("2026-10-11")]);
    }

    // Second publish run against the SAME unmoved baseline (the Worker
    // annotation still points at it) must still include the first day —
    // this is exactly what the single-commit-diff bug dropped.
    const secondResult = withRepoCwd(() => planHistoryOverlay(commitsBetween(baseline, secondRun)));
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

    const result = withRepoCwd(() => planHistoryOverlay(commitsBetween(newBaseline, candidate)));

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

    const result = withRepoCwd(() => planHistoryOverlay(commitsBetween(baseline, candidate)));

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

    const result = withRepoCwd(() => planHistoryOverlay(commitsBetween(baseline, candidate)));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.join(" ")).toContain("fails validation");
  });
});

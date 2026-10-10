import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Found during a real controlled activation attempt: "Commit the new
// briefing" (parkio-daily.yml), when today's file already exists, looks
// up the commit that last touched it via `git log -1 -- <path>` and
// offers that SHA to the publish job. Under a depth-1 shallow clone —
// actions/checkout's default, and what the `build` job used — that
// single available commit has no parent from git's point of view, so
// EVERY file in its tree appears to have been "added" by it. In the
// real run, this meant a long-standing Daily content file got
// attributed to a same-day, completely unrelated merge commit (a
// workflow-fix PR merge) instead of the actual commit that added it —
// correctly rejected downstream by the security boundary (wrong
// author, wrong changed paths), but it meant a real, already-valid
// article could not be published that day.
//
// Real git clones throughout (including a real --depth 1 clone via a
// file:// remote — git silently ignores --depth for same-filesystem
// clones without the explicit file:// scheme, which is itself worth
// documenting here since it's an easy way to accidentally "test" a
// clone that was never actually shallow) — this is a property of real
// git history-truncation semantics, not something a mocked filesystem
// would reproduce faithfully.
describe("Daily build checkout depth — must not misattribute an existing file to an unrelated same-day commit", () => {
  let tmp: string;
  let origin: string;
  let contentSha: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "daily-shallow-clone-"));
    origin = path.join(tmp, "origin.git");
    execFileSync("git", ["init", "--bare", origin]);

    const seed = path.join(tmp, "seed");
    execFileSync("git", ["clone", origin, seed]);
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: "parkio-daily-bot",
      GIT_AUTHOR_EMAIL: "parkio-daily-bot@users.noreply.github.com",
      GIT_COMMITTER_NAME: "parkio-daily-bot",
      GIT_COMMITTER_EMAIL: "parkio-daily-bot@users.noreply.github.com",
    };

    // Commit A — the real Daily content commit, same shape as the
    // actual repo's "Parkio Daily — 2026-10-10" commits.
    fs.mkdirSync(path.join(seed, "content", "guide", "daily"), { recursive: true });
    fs.writeFileSync(path.join(seed, "content", "guide", "daily", "today.json"), "{}\n");
    execFileSync("git", ["add", "."], { cwd: seed });
    execFileSync("git", ["commit", "-m", "Parkio Daily — 2026-10-10"], { cwd: seed, env });
    contentSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: seed, encoding: "utf8" }).trim();

    // Commit B — an unrelated, same-day merge (a different author,
    // different files) landing AFTER the content commit, exactly like
    // a workflow-fix PR merging later the same day.
    fs.writeFileSync(path.join(seed, "unrelated-workflow-fix.txt"), "unrelated\n");
    execFileSync("git", ["add", "."], { cwd: seed });
    execFileSync("git", ["commit", "-m", "Merge pull request #99 from fix/something-unrelated"], {
      cwd: seed,
      env: { ...process.env, GIT_AUTHOR_NAME: "tsomers13-ops", GIT_AUTHOR_EMAIL: "tsomers13@gmail.com", GIT_COMMITTER_NAME: "tsomers13-ops", GIT_COMMITTER_EMAIL: "tsomers13@gmail.com" },
    });

    execFileSync("git", ["push", "origin", "HEAD:main"], { cwd: seed });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("reproduces the exact bug: a depth-1 shallow clone misattributes the content file to the unrelated later commit", () => {
    const shallowDir = path.join(tmp, "shallow");
    // file:// is required here: git silently ignores --depth for local
    // filesystem clones without it, which would make this assertion
    // pass for the wrong reason (a clone that was never actually
    // shallow) — confirmed empirically before relying on it.
    execFileSync("git", ["clone", "--depth", "1", `file://${origin}`, shallowDir]);
    const found = execFileSync(
      "git",
      ["log", "-1", "--format=%H", "--", "content/guide/daily/today.json"],
      { cwd: shallowDir, encoding: "utf8" },
    ).trim();
    expect(found).not.toBe(contentSha);
  });

  it("the fix: a full (fetch-depth: 0 equivalent) clone correctly attributes the file to the real content commit", () => {
    const fullDir = path.join(tmp, "full");
    execFileSync("git", ["clone", origin, fullDir]);
    const found = execFileSync(
      "git",
      ["log", "-1", "--format=%H", "--", "content/guide/daily/today.json"],
      { cwd: fullDir, encoding: "utf8" },
    ).trim();
    expect(found).toBe(contentSha);
  });
});

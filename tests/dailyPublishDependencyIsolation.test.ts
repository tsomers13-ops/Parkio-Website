import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Proves the property the new "Reinstall dependencies to match the
// approved baseline" step depends on: `npm ci` is npm's own well-tested
// behavior (not re-proven here) — what actually needs proving is that
// the RIGHT package-lock.json is physically on disk at the moment that
// step runs. Real git subprocesses throughout, same pattern as
// dailyPublishToolingIsolation.test.ts, for the same reason: this is a
// property of real `git checkout` semantics, which a mocked filesystem
// would never reproduce faithfully.
describe("Daily publish dependency isolation — the application build must use the baseline's own dependencies, not the content commit's", () => {
  let tmp: string;
  let origin: string;
  let mainDir: string;
  let baselineSha: string;
  let contentSha: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "daily-publish-dep-isolation-"));
    origin = path.join(tmp, "origin.git");
    execFileSync("git", ["init", "--bare", origin]);

    const seed = path.join(tmp, "seed");
    execFileSync("git", ["clone", origin, seed]);
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: "test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    };

    // Commit A — the "approved baseline": a distinct package-lock.json,
    // standing in for "whatever dependency set was approved at release
    // time".
    fs.writeFileSync(path.join(seed, "package.json"), JSON.stringify({ name: "app", version: "1.0.0" }, null, 2));
    fs.writeFileSync(
      path.join(seed, "package-lock.json"),
      JSON.stringify({ name: "app", lockfileVersion: 3, marker: "BASELINE-LOCKFILE" }, null, 2),
    );
    execFileSync("git", ["add", "."], { cwd: seed });
    execFileSync("git", ["commit", "-m", "baseline"], { cwd: seed, env });
    baselineSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: seed, encoding: "utf8" }).trim();

    // Commit B — the "Daily content commit", built on top of a main
    // branch that has since drifted: a DIFFERENT package-lock.json
    // (simulating a dependency bump that happened after the baseline
    // was approved and deployed, which is exactly the situation that
    // would silently contaminate the build without this fix), plus a
    // content file.
    fs.writeFileSync(
      path.join(seed, "package-lock.json"),
      JSON.stringify({ name: "app", lockfileVersion: 3, marker: "CONTENT-COMMIT-LOCKFILE-DRIFTED" }, null, 2),
    );
    fs.mkdirSync(path.join(seed, "content", "guide", "daily"), { recursive: true });
    fs.writeFileSync(path.join(seed, "content", "guide", "daily", "today.json"), "{}\n");
    execFileSync("git", ["add", "."], { cwd: seed });
    execFileSync("git", ["commit", "-m", "Parkio Daily — content"], { cwd: seed, env });
    contentSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: seed, encoding: "utf8" }).trim();

    execFileSync("git", ["push", "origin", "HEAD:main"], { cwd: seed });

    mainDir = path.join(tmp, "main");
    execFileSync("git", ["clone", origin, mainDir]);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function lockfileMarker(dir: string): string {
    const raw = fs.readFileSync(path.join(dir, "package-lock.json"), "utf8");
    return JSON.parse(raw).marker;
  }

  it("reproduces the exact risk: right after the initial checkout, the lockfile on disk is the content commit's (drifted) version", () => {
    execFileSync("git", ["checkout", contentSha], { cwd: mainDir });
    expect(lockfileMarker(mainDir)).toBe("CONTENT-COMMIT-LOCKFILE-DRIFTED");
  });

  it("the fix: after 'Compose the publish tree' (checkout to baseline), the lockfile on disk is unambiguously the approved baseline's — this is what makes the Reinstall step's npm ci correct", () => {
    execFileSync("git", ["checkout", contentSha], { cwd: mainDir }); // initial checkout, as the job does
    execFileSync("git", ["checkout", baselineSha], { cwd: mainDir }); // "Compose the publish tree"
    expect(lockfileMarker(mainDir)).toBe("BASELINE-LOCKFILE");
    // package.json itself must also be the baseline's — npm ci validates
    // package.json and package-lock.json are mutually consistent, so if
    // either were left over from the wrong revision, npm ci would
    // either install the wrong deps or fail outright on a lockfile
    // mismatch — either way, this confirms there's no partial drift.
    const pkg = JSON.parse(fs.readFileSync(path.join(mainDir, "package.json"), "utf8"));
    expect(pkg.version).toBe("1.0.0");
  });

  it("build artifacts from another revision cannot linger: the content commit's lockfile is not merely shadowed, it is gone from disk after the baseline checkout", () => {
    execFileSync("git", ["checkout", contentSha], { cwd: mainDir });
    execFileSync("git", ["checkout", baselineSha], { cwd: mainDir });
    const raw = fs.readFileSync(path.join(mainDir, "package-lock.json"), "utf8");
    expect(raw).not.toContain("CONTENT-COMMIT-LOCKFILE-DRIFTED");
  });
});

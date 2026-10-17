import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";

// Exercises the ACTUAL apply/remove loop from "Compose the publish
// tree"'s run: string in parkio-daily-publish.yml, extracted from the
// real workflow file the same way
// tests/dailyPublishDeployCommandYamlFolding.test.ts already does —
// rather than a reimplementation of what that bash is supposed to do,
// so a future edit to the real step is exercised here automatically.
//
// composeValidatedHistory.mjs's resolvePublishPlan() can now emit
// "remove" operations (a validated deletion or a rename moving a file
// away) in addition to "apply" — the workflow step has to actually
// understand that output, not just an "apply" line. This is the
// real-git-backed test for that: a real repo with a tracked file that
// must be removed, and another path that was never tracked at all
// (--ignore-unmatch must make that a no-op, not an error), plus an
// unrecognized op failing the step closed.
describe("'Compose the publish tree' apply/remove loop — real-git, against the actual workflow step text", () => {
  const workflowPath = path.join(process.cwd(), ".github/workflows/parkio-daily-publish.yml");

  function findComposeRunString(): string {
    const doc = parseYaml(fs.readFileSync(workflowPath, "utf8"));
    for (const job of Object.values(doc.jobs as Record<string, any>)) {
      for (const step of job.steps ?? []) {
        if (step.name === "Compose the publish tree" && typeof step.run === "string") {
          return step.run;
        }
      }
    }
    throw new Error("Could not find the 'Compose the publish tree' step in parkio-daily-publish.yml");
  }

  function extractOverlayLoop(runString: string): string {
    const match = runString.match(/while IFS=' ' read -r op sha p; do[\s\S]*?\ndone < \/tmp\/daily_overlay\.txt/);
    if (!match) {
      throw new Error("Could not find the apply/remove while-loop in the 'Compose the publish tree' step");
    }
    return match[0];
  }

  let tmp: string;
  let repo: string;
  let candidateSha: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "compose-apply-remove-"));
    repo = path.join(tmp, "repo");
    fs.mkdirSync(repo);
    execFileSync("git", ["init", "-b", "main", repo]);
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: "parkio-daily-bot",
      GIT_AUTHOR_EMAIL: "parkio-daily-bot@users.noreply.github.com",
      GIT_COMMITTER_NAME: "parkio-daily-bot",
      GIT_COMMITTER_EMAIL: "parkio-daily-bot@users.noreply.github.com",
    };
    fs.mkdirSync(path.join(repo, "content/guide/daily"), { recursive: true });

    // Commit A: the candidate's final content for fileA — this is what
    // "apply" must pull, regardless of whatever fileA looks like in the
    // currently-checked-out (baseline) working tree.
    fs.writeFileSync(path.join(repo, "content/guide/daily/fileA.json"), "final content\n");
    execFileSync("git", ["add", "."], { cwd: repo });
    execFileSync("git", ["commit", "-m", "Parkio Daily — fileA final"], { cwd: repo, env });
    candidateSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();

    // Commit B: adds fileB, tracked — simulates a file the baseline
    // tree has, which validated history says must now be removed.
    fs.writeFileSync(path.join(repo, "content/guide/daily/fileB.json"), "stale, should be removed\n");
    execFileSync("git", ["add", "."], { cwd: repo });
    execFileSync("git", ["commit", "-m", "Parkio Daily — fileB (to be removed)"], { cwd: repo, env });

    // Now simulate the state right after "git checkout $baseline": fileA
    // does not exist yet at this point in the real scenario (baseline
    // predates it), fileB IS present and tracked (baseline already has
    // it) — exactly what the loop needs to overwrite/remove.
    fs.rmSync(path.join(repo, "content/guide/daily/fileA.json"));
    execFileSync("git", ["rm", "--cached", "--quiet", "content/guide/daily/fileA.json"], { cwd: repo });
    execFileSync("git", ["commit", "-m", "Simulated baseline: fileA absent, fileB present"], { cwd: repo, env });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function runLoop(overlayLines: string[]): { exitCode: number; stdout: string; stderr: string } {
    fs.writeFileSync("/tmp/daily_overlay.txt", overlayLines.join("\n") + (overlayLines.length ? "\n" : ""));
    const script = extractOverlayLoop(findComposeRunString());
    try {
      const stdout = execFileSync("bash", ["-ec", script], { cwd: repo, encoding: "utf8" });
      return { exitCode: 0, stdout, stderr: "" };
    } catch (err: any) {
      return {
        exitCode: typeof err.status === "number" ? err.status : 1,
        stdout: err.stdout ?? "",
        stderr: err.stderr ?? "",
      };
    } finally {
      fs.rmSync("/tmp/daily_overlay.txt", { force: true });
    }
  }

  it("applies a path by checking out the EXACT content from the given sha, overwriting whatever the baseline tree had", () => {
    const result = runLoop([`apply ${candidateSha} content/guide/daily/fileA.json`]);
    expect(result.exitCode).toBe(0);
    const content = fs.readFileSync(path.join(repo, "content/guide/daily/fileA.json"), "utf8");
    expect(content).toBe("final content\n");
  });

  it("removes a tracked path the baseline had, when validated history says it was deleted or renamed away", () => {
    expect(fs.existsSync(path.join(repo, "content/guide/daily/fileB.json"))).toBe(true);
    const result = runLoop(["remove - content/guide/daily/fileB.json"]);
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(path.join(repo, "content/guide/daily/fileB.json"))).toBe(false);
    const tracked = execFileSync("git", ["ls-files", "content/guide/daily/fileB.json"], {
      cwd: repo,
      encoding: "utf8",
    }).trim();
    expect(tracked).toBe("");
  });

  it("a remove for a path the baseline never had at all is a safe no-op, not an error (--ignore-unmatch)", () => {
    const result = runLoop(["remove - content/guide/daily/never-existed.json"]);
    expect(result.exitCode).toBe(0);
  });

  it("applies and removes together in one pass, exactly as a real composition would", () => {
    const result = runLoop([
      `apply ${candidateSha} content/guide/daily/fileA.json`,
      "remove - content/guide/daily/fileB.json",
    ]);
    expect(result.exitCode).toBe(0);
    expect(fs.readFileSync(path.join(repo, "content/guide/daily/fileA.json"), "utf8")).toBe("final content\n");
    expect(fs.existsSync(path.join(repo, "content/guide/daily/fileB.json"))).toBe(false);
  });

  it("fails closed on an unrecognized operation instead of silently ignoring it", () => {
    const result = runLoop(["bogus - content/guide/daily/fileA.json"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr + result.stdout).toContain("unrecognized operation");
  });

  it("an empty overlay (nothing to apply or remove) is a clean no-op", () => {
    const result = runLoop([]);
    expect(result.exitCode).toBe(0);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Real git subprocess throughout, not mocked — the actual historical bug
// was a property of real `git checkout` semantics (switching the whole
// working tree wipes files not present in the target commit), which a
// mocked filesystem would never reproduce faithfully. Mirrors the exact
// shape parkio-daily-publish.yml now uses: a "main" checkout at the
// Daily content commit, a second "tooling" checkout (sparse, same
// commit) alongside it, then `git checkout <baseline>` applied ONLY to
// "main".
describe("Daily publish tooling isolation — the baseline checkout must not remove publishing scripts", () => {
  let tmp: string;
  let origin: string;
  let mainDir: string;
  let toolingDir: string;
  let baselineSha: string;
  let contentSha: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "daily-publish-isolation-"));
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

    // Commit A — the "approved baseline": predates the lock script
    // entirely, exactly like the real 104e7578 baseline predates
    // productionDeployLock.mjs. Also seeds unrelated app-shaped
    // directories (app/, tests/) so the sparse-checkout assertions below
    // have something real to prove they exclude.
    fs.mkdirSync(path.join(seed, "scripts"), { recursive: true });
    fs.writeFileSync(path.join(seed, "scripts", "other-thing.txt"), "unrelated\n");
    fs.mkdirSync(path.join(seed, "app"), { recursive: true });
    fs.writeFileSync(path.join(seed, "app", "page.tsx"), "export default function Page() {}\n");
    fs.mkdirSync(path.join(seed, "tests"), { recursive: true });
    fs.writeFileSync(path.join(seed, "tests", "something.test.ts"), "// a test\n");
    execFileSync("git", ["add", "."], { cwd: seed });
    execFileSync("git", ["commit", "-m", "baseline"], { cwd: seed, env });
    baselineSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: seed, encoding: "utf8" }).trim();

    // Commit B — the "Daily content commit": adds the publishing scripts
    // (post-dating the baseline, same as the real PR #18) plus a content
    // file, on top of commit A.
    fs.mkdirSync(path.join(seed, "scripts", "deploy"), { recursive: true });
    fs.writeFileSync(path.join(seed, "scripts", "deploy", "productionDeployLock.mjs"), "// lock script marker\n");
    fs.mkdirSync(path.join(seed, "scripts", "parkio-daily"), { recursive: true });
    fs.writeFileSync(path.join(seed, "scripts", "parkio-daily", "resolveApprovedBaseline.mjs"), "// baseline script marker\n");
    fs.mkdirSync(path.join(seed, "content", "guide", "daily"), { recursive: true });
    fs.writeFileSync(path.join(seed, "content", "guide", "daily", "today.json"), "{}\n");
    execFileSync("git", ["add", "."], { cwd: seed });
    execFileSync("git", ["commit", "-m", "Parkio Daily — content"], { cwd: seed, env });
    contentSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: seed, encoding: "utf8" }).trim();

    execFileSync("git", ["push", "origin", "HEAD:main"], { cwd: seed });

    // "main" — the equivalent of the job's primary actions/checkout, at
    // the content commit.
    mainDir = path.join(tmp, "main");
    execFileSync("git", ["clone", origin, mainDir]);
    execFileSync("git", ["checkout", contentSha], { cwd: mainDir });

    // "tooling" — the fix: a second, sparse checkout of the SAME content
    // commit, nested inside `main/tooling`, exactly as
    // `actions/checkout@v4` with `path: tooling` would place it.
    toolingDir = path.join(mainDir, "tooling");
    execFileSync("git", ["clone", "--no-checkout", origin, toolingDir]);
    execFileSync("git", ["sparse-checkout", "init", "--cone"], { cwd: toolingDir });
    execFileSync("git", ["sparse-checkout", "set", "scripts/deploy", "scripts/parkio-daily"], { cwd: toolingDir });
    execFileSync("git", ["checkout", contentSha], { cwd: toolingDir });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("confirms both checkouts start out with the publishing scripts present", () => {
    expect(fs.existsSync(path.join(mainDir, "scripts/deploy/productionDeployLock.mjs"))).toBe(true);
    expect(fs.existsSync(path.join(toolingDir, "scripts/deploy/productionDeployLock.mjs"))).toBe(true);
  });

  it("the sparse tooling checkout excludes unrelated app/test directories — proving it can't be swept into tsc/vitest's broad globs", () => {
    expect(fs.existsSync(path.join(toolingDir, "app"))).toBe(false);
    expect(fs.existsSync(path.join(toolingDir, "tests"))).toBe(false);
    // Sanity: these DO exist in the main checkout, so their absence in
    // tooling/ is sparse-checkout actually working, not a setup mistake.
    expect(fs.existsSync(path.join(mainDir, "app"))).toBe(true);
    expect(fs.existsSync(path.join(mainDir, "tests"))).toBe(true);
  });

  it("reproduces the exact historical bug: switching the MAIN checkout to the baseline removes the lock script from it", () => {
    execFileSync("git", ["checkout", baselineSha], { cwd: mainDir });
    expect(fs.existsSync(path.join(mainDir, "scripts/deploy/productionDeployLock.mjs"))).toBe(false);
    expect(fs.existsSync(path.join(mainDir, "scripts/parkio-daily/resolveApprovedBaseline.mjs"))).toBe(false);
  });

  it("the fix: the isolated tooling checkout is unaffected by the main checkout switching to the baseline", () => {
    execFileSync("git", ["checkout", baselineSha], { cwd: mainDir });
    // The real regression: before this fix, there was no tooling/ at
    // all, and this exact file was the one reported missing with
    // "Cannot find module" in the actual failed run.
    expect(fs.existsSync(path.join(toolingDir, "scripts/deploy/productionDeployLock.mjs"))).toBe(true);
    expect(fs.existsSync(path.join(toolingDir, "scripts/parkio-daily/resolveApprovedBaseline.mjs"))).toBe(true);
    expect(fs.readFileSync(path.join(toolingDir, "scripts/deploy/productionDeployLock.mjs"), "utf8")).toContain(
      "lock script marker"
    );
  });

  it("the cleanliness check's :(exclude)tooling pathspec reports clean despite tooling/ sitting right there, unstaged", () => {
    execFileSync("git", ["checkout", baselineSha], { cwd: mainDir });
    const status = execFileSync("git", ["status", "--short", "--", ".", ":(exclude)tooling"], {
      cwd: mainDir,
      encoding: "utf8",
    });
    expect(status.trim()).toBe("");
  });

  it("the same cleanliness check still catches a genuinely unexpected file elsewhere in the tree", () => {
    execFileSync("git", ["checkout", baselineSha], { cwd: mainDir });
    fs.writeFileSync(path.join(mainDir, "rogue.txt"), "should never be here\n");
    const status = execFileSync("git", ["status", "--short", "--", ".", ":(exclude)tooling"], {
      cwd: mainDir,
      encoding: "utf8",
    });
    expect(status).toContain("rogue.txt");
  });
});

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

// Found during the first real end-to-end run of the fully-audited
// pipeline (after PRs #19-#28 were all merged): the "Deploy to
// Production Worker" step's `run:` value spans two physical lines in
// the workflow file, with a trailing `\` before the line break —
// written to look like a shell line-continuation.
//
// It isn't one. YAML's plain-scalar folding rule applies BEFORE bash
// ever sees the text: a line break inside a plain (unquoted, non-block)
// scalar folds to a single space, and the trailing `\` is kept as an
// ordinary literal character, not consumed as a YAML continuation
// marker. So the real run string is one logical line containing the
// literal substring `-- \ npx` (dash dash, space, backslash, space,
// n-p-x) — confirmed here by parsing the actual workflow file with the
// same `yaml` package workflowPermissions.mjs already depends on.
//
// Bash then tokenizes `\ ` (backslash immediately followed by a space)
// as an ESCAPED SPACE: a literal space character glued onto the
// following text with no field-splitting effect, producing a single
// argument " npx" (leading space) instead of two separate tokens `--`
// and `npx`. That malformed argument became `command[0]` passed to
// productionDeployLock.mjs's `spawn()` call, which failed with
// `spawn  npx ENOENT` (the double space in that real error message is
// the tell: one from Node's own "spawn <cmd>" template, one from the
// leading space baked into the command string) — reproduced exactly
// below. Cloudflare was never actually contacted; the lock's
// confirmed/ambiguous distinction correctly treated the failed spawn()
// itself as a clean, confirmed failure and the lock was released
// normally.
//
// The fix (already applied) removes the stray backslash: YAML's own
// line-folding already joins the two physical lines with exactly one
// space, so no continuation marker is needed or correct here.
describe("the deploy step's run: command must not contain a YAML-fold + bash-escaped-space bug", () => {
  const workflowPath = path.join(process.cwd(), ".github/workflows/parkio-daily-publish.yml");

  function findDeployRunString(): string {
    const doc = parseYaml(fs.readFileSync(workflowPath, "utf8"));
    for (const job of Object.values(doc.jobs as Record<string, any>)) {
      for (const step of job.steps ?? []) {
        if (typeof step.run === "string" && step.run.includes("productionDeployLock.mjs deploy")) {
          return step.run;
        }
      }
    }
    throw new Error("Could not find the productionDeployLock.mjs deploy step in parkio-daily-publish.yml");
  }

  function argvAfterDoubleDash(runString: string): string[] {
    // Mirrors exactly how GitHub Actions executes a `run:` step: it
    // textually substitutes every `${{ ... }}` expression BEFORE the
    // shell ever runs, then hands the already-YAML-folded, already-
    // substituted string to `bash -e` as a single script. Stand-in
    // values here are inert, since this test is only about the
    // literal-backslash-space bug, not expression evaluation.
    const withSubstitutions = runString.replace(/\$\{\{[^}]*\}\}/g, "X");
    const helper = path.join(process.cwd(), "tests", "fixtures-print-argv.mjs");
    fs.mkdirSync(path.dirname(helper), { recursive: true });
    fs.writeFileSync(helper, "console.log(JSON.stringify(process.argv.slice(2)))\n");
    try {
      const output = execFileSync(
        "bash",
        ["-c", `node "${helper}" ${withSubstitutions.replace("node tooling/scripts/deploy/productionDeployLock.mjs deploy", "")}`],
        { encoding: "utf8" }
      );
      return JSON.parse(output);
    } finally {
      fs.rmSync(helper, { force: true });
    }
  }

  it("the real workflow file's deploy run: string does not fold to a leading-space command token", () => {
    const runString = findDeployRunString();
    const args = argvAfterDoubleDash(runString);
    const sepIndex = args.indexOf("--");
    expect(sepIndex).toBeGreaterThanOrEqual(0);
    const command = args[sepIndex + 1];
    expect(command).toBe("npx");
  });

  it("reproduces the exact historical bug shape for documentation: a literal backslash-space before the command name folds into a single malformed argument", () => {
    const buggyRunString = 'node tooling/scripts/deploy/productionDeployLock.mjs deploy "r" 120000 "sha:x" -- \\ npx wrangler deploy';
    const args = argvAfterDoubleDash(buggyRunString);
    const sepIndex = args.indexOf("--");
    const command = args[sepIndex + 1];
    expect(command).toBe(" npx");
    expect(command).not.toBe("npx");
  });

  it("reproduces the exact spawn() error message observed in the real run (double space, ENOENT)", async () => {
    const { spawn } = await import("node:child_process");
    const message = await new Promise<string>((resolve) => {
      const child = spawn(" npx", ["wrangler"]);
      child.on("error", (err) => resolve(err.message));
    });
    expect(message).toBe("spawn  npx ENOENT");
  });
});

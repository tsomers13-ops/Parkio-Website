import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

// Found during a full execution-path audit of parkio-daily-publish.yml,
// specifically because the audit asked "does any step silently ignore a
// failed command". "Compose the publish tree" originally piped
// validatePublishCandidate.mjs's output straight into `grep | sed`,
// with stderr redirected to /dev/null. GitHub Actions' default shell is
// `bash -e` WITHOUT `pipefail` (confirmed earlier this session, against
// GitHub's own docs: explicitly specifying `shell: bash` adds `-o
// pipefail`, but no step in this file does that, so none of them get
// it) — a pipeline's exit status under plain `-e` is only the LAST
// command's, which for `sed` on anything (including empty input)
// virtually always succeeds. A crash in the validator at that specific
// call site would therefore have been silently swallowed, composing an
// incomplete tree (missing the Daily content overlay) while the step
// still reported success.
//
// These tests run the real `bash -e` interpreter (not vitest's own
// control flow) against both the OLD pattern and the fixed one, with a
// stand-in command that deliberately crashes in place of the real
// validator — proving the old shape really did swallow the failure,
// and the new one does not, rather than reasoning about bash semantics
// abstractly.
describe("'Compose the publish tree' must not silently swallow a crashing validator", () => {
  function runBash(script: string): { exitCode: number; stdout: string } {
    try {
      const stdout = execFileSync("bash", ["-e", "-c", script], { encoding: "utf8" });
      return { exitCode: 0, stdout };
    } catch (err: any) {
      return { exitCode: typeof err.status === "number" ? err.status : 1, stdout: err.stdout ?? "" };
    }
  }

  it("the OLD pattern (direct pipe, stderr to /dev/null) swallows a crashing command and keeps going — this is the bug", () => {
    const result = runBash(`
      node -e "process.exit(1)" 2>/dev/null \\
        | grep -E '^  content/' | sed 's/^  //' > /dev/null
      echo "REACHED THE END"
    `);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("REACHED THE END");
  });

  it("the FIXED pattern (command substitution, explicit || exit 1) correctly aborts instead", () => {
    const result = runBash(`
      validation_output="$(node -e "process.exit(1)" 2>&1)" || {
        echo "CAUGHT THE FAILURE"
        exit 1
      }
      echo "$validation_output" | grep -E '^  content/' | sed 's/^  //' > /dev/null
      echo "REACHED THE END"
    `);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).not.toContain("REACHED THE END");
  });

  it("the FIXED pattern still behaves correctly on the real success path (non-empty, well-formed validator output)", () => {
    const result = runBash(`
      validation_output="$(node -e "console.log('  content/guide/daily/today.json')")" || {
        echo "CAUGHT THE FAILURE"
        exit 1
      }
      echo "$validation_output" | grep -E '^  content/' | sed 's/^  //' > /tmp/fixed-pattern-test-paths.txt
      cat /tmp/fixed-pattern-test-paths.txt
      echo "REACHED THE END"
    `);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("content/guide/daily/today.json");
    expect(result.stdout).toContain("REACHED THE END");
  });
});

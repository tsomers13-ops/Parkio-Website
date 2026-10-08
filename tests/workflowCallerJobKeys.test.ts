import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";

/**
 * Regression check for the exact bug that broke parkio-daily.yml
 * immediately after merge: a job that calls a reusable workflow (`uses:`)
 * cannot ALSO declare `environment:` (or several other keys) — GitHub
 * Actions rejects the whole workflow FILE at parse time if it does,
 * surfacing as zero-job "failed" runs on every push, regardless of that
 * workflow's own triggers. Confirmed against `actionlint` (a real
 * GitHub-Actions-aware validator, not just YAML syntax) before writing
 * this: it flags exactly this pattern, pointing at the exact bad key.
 *
 * This test is a dependency-free, always-in-`npm test` substitute for
 * actionlint, which CI does not install. It walks every workflow file's
 * every job and fails if any job combines `uses:` with a key outside
 * GitHub's own documented allow-list for reusable-workflow caller jobs.
 */

const WORKFLOWS_DIR = path.join(process.cwd(), ".github", "workflows");

// Per GitHub's own documented constraint (and confirmed via actionlint
// against this exact repo's own previously-broken commit): a job with
// `uses:` may ONLY also have these keys.
const ALLOWED_KEYS_WITH_USES = new Set([
  "name",
  "uses",
  "with",
  "secrets",
  "needs",
  "if",
  "permissions",
  "strategy",
  "concurrency",
]);

export function findInvalidCallerJobs(workflowYaml: string): Array<{ job: string; badKeys: string[] }> {
  const doc = YAML.parse(workflowYaml);
  const jobs = doc?.jobs ?? {};
  const problems: Array<{ job: string; badKeys: string[] }> = [];

  for (const [jobId, jobDef] of Object.entries<Record<string, unknown>>(jobs)) {
    if (!jobDef || typeof jobDef !== "object" || !("uses" in jobDef)) continue;
    const badKeys = Object.keys(jobDef).filter((k) => !ALLOWED_KEYS_WITH_USES.has(k));
    if (badKeys.length > 0) {
      problems.push({ job: jobId, badKeys });
    }
  }
  return problems;
}

function listWorkflowFiles(): string[] {
  return readdirSync(WORKFLOWS_DIR)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => path.join(WORKFLOWS_DIR, f));
}

describe("findInvalidCallerJobs (unit)", () => {
  it("flags `environment:` alongside `uses:` — the exact bug this test exists for", () => {
    const yaml = `
jobs:
  publish:
    needs: build
    environment: daily-publish
    uses: ./.github/workflows/other.yml
`;
    const result = findInvalidCallerJobs(yaml);
    expect(result).toEqual([{ job: "publish", badKeys: ["environment"] }]);
  });

  it("passes a caller job using only allowed keys", () => {
    const yaml = `
jobs:
  publish:
    name: Publish
    needs: build
    if: needs.build.outputs.pushed == 'true'
    uses: ./.github/workflows/other.yml
    with:
      sha: abc123
`;
    expect(findInvalidCallerJobs(yaml)).toEqual([]);
  });

  it("ignores ordinary jobs that don't call a reusable workflow at all", () => {
    const yaml = `
jobs:
  build:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - run: echo hi
`;
    expect(findInvalidCallerJobs(yaml)).toEqual([]);
  });

  it("flags multiple disallowed keys on the same caller job", () => {
    const yaml = `
jobs:
  bad:
    uses: ./.github/workflows/other.yml
    environment: production
    runs-on: ubuntu-latest
`;
    const result = findInvalidCallerJobs(yaml);
    expect(result).toHaveLength(1);
    expect(result[0]!.badKeys.sort()).toEqual(["environment", "runs-on"]);
  });
});

describe("every workflow file in .github/workflows", () => {
  for (const file of listWorkflowFiles()) {
    it(`${path.basename(file)} has no caller job combining uses: with a disallowed key`, () => {
      const content = readFileSync(file, "utf8");
      const problems = findInvalidCallerJobs(content);
      expect(problems).toEqual([]);
    });
  }
});

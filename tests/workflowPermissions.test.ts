import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  auditWorkflowPermissions,
  findPermissionGaps,
  loadWorkflowDocs,
} from "../scripts/deploy/workflowPermissions.mjs";

describe("findPermissionGaps — pure logic, fixture-based", () => {
  it("reproduces the exact historical bug: caller has no permissions block at all, callee needs contents: write", () => {
    const caller = { callerPath: "a.yml", jobId: "publish", permissions: undefined };
    const callee = { path: "b.yml", jobs: { publish: { permissions: { contents: "write" } } } };
    const gaps = findPermissionGaps(caller, callee);
    expect(gaps).toEqual([{ scope: "contents", required: "write", granted: "none" }]);
  });

  it("is clean once the caller explicitly grants at least as much as the callee requires — the actual fix shape", () => {
    const caller = { callerPath: "a.yml", jobId: "publish", permissions: { contents: "write" } };
    const callee = { path: "b.yml", jobs: { publish: { permissions: { contents: "write" } } } };
    expect(findPermissionGaps(caller, callee)).toEqual([]);
  });

  it("flags read-only caller against a write-requiring callee — not just 'nothing vs something'", () => {
    const caller = { callerPath: "a.yml", jobId: "publish", permissions: { contents: "read" } };
    const callee = { path: "b.yml", jobs: { publish: { permissions: { contents: "write" } } } };
    const gaps = findPermissionGaps(caller, callee);
    expect(gaps).toEqual([{ scope: "contents", required: "write", granted: "read" }]);
  });

  it("is clean when the callee only needs read and the caller grants write (over-granting is not flagged by this check)", () => {
    const caller = { callerPath: "a.yml", jobId: "publish", permissions: { contents: "write" } };
    const callee = { path: "b.yml", jobs: { publish: { permissions: { contents: "read" } } } };
    expect(findPermissionGaps(caller, callee)).toEqual([]);
  });

  it("never assumes a caller's missing permissions block is covered by some outside default — the exact wrong assumption that caused the real bug", () => {
    // No `permissions:` key at all is treated identically to explicitly
    // granting nothing, not as "inherits something adequate from
    // elsewhere" — that ambient-default assumption is the bug.
    const caller = { callerPath: "a.yml", jobId: "publish" }; // permissions omitted entirely
    const callee = { path: "b.yml", jobs: { publish: { permissions: { contents: "write" } } } };
    expect(findPermissionGaps(caller, callee).length).toBe(1);
  });

  it("takes the most permissive requirement across multiple jobs in the same callee file", () => {
    const caller = { callerPath: "a.yml", jobId: "publish", permissions: { contents: "read" } };
    const callee = {
      path: "b.yml",
      jobs: {
        one: { permissions: { contents: "read" } },
        two: { permissions: { contents: "write" } },
      },
    };
    const gaps = findPermissionGaps(caller, callee);
    expect(gaps).toEqual([{ scope: "contents", required: "write", granted: "read" }]);
  });

  it("honors the write-all / read-all shorthand on both sides", () => {
    const callee = { path: "b.yml", jobs: { publish: { permissions: { contents: "write", "pull-requests": "write" } } } };
    expect(findPermissionGaps({ permissions: "write-all" }, callee)).toEqual([]);
    const gaps = findPermissionGaps({ permissions: "read-all" }, callee);
    expect(gaps.map((g) => g.scope).sort()).toEqual(["contents", "pull-requests"]);
  });
});

describe("auditWorkflowPermissions — scans a whole set of caller/callee docs", () => {
  it("reports the specific caller job, callee path, and scope for a mismatch", () => {
    const docs = new Map([
      [
        ".github/workflows/a.yml",
        { jobs: { publish: { uses: "./.github/workflows/b.yml" } } },
      ],
      [
        ".github/workflows/b.yml",
        { jobs: { publish: { permissions: { contents: "write" } } } },
      ],
    ]);
    const problems = auditWorkflowPermissions(docs);
    expect(problems).toEqual([
      {
        callerPath: ".github/workflows/a.yml",
        jobId: "publish",
        calleePath: ".github/workflows/b.yml",
        scope: "contents",
        required: "write",
        granted: "none",
      },
    ]);
  });

  it("reports a missing callee file distinctly, rather than silently skipping it", () => {
    const docs = new Map([
      [".github/workflows/a.yml", { jobs: { publish: { uses: "./.github/workflows/missing.yml" } } }],
    ]);
    const problems = auditWorkflowPermissions(docs);
    expect(problems).toHaveLength(1);
    expect(problems[0].error).toBe("callee workflow file not found");
  });

  it("ignores jobs that don't call a local reusable workflow at all", () => {
    const docs = new Map([
      [".github/workflows/a.yml", { jobs: { build: { "runs-on": "ubuntu-latest", steps: [] } } }],
    ]);
    expect(auditWorkflowPermissions(docs)).toEqual([]);
  });

  it("ignores a `uses:` that calls a published/external action or workflow, not a local one", () => {
    const docs = new Map([
      [".github/workflows/a.yml", { jobs: { publish: { uses: "actions/checkout@v4" } } }],
    ]);
    expect(auditWorkflowPermissions(docs)).toEqual([]);
  });
});

describe("the repo's REAL workflow files — the actual regression guard", () => {
  // This is the test that matters: it would have failed `npm test` on the
  // exact commit that broke Parkio Daily's first production activation,
  // without needing a live GitHub Actions dispatch to find out.
  it("has no caller/callee permission gaps across any local reusable workflow call", () => {
    const repoRoot = path.resolve(__dirname, "..");
    const docs = loadWorkflowDocs(repoRoot);
    const problems = auditWorkflowPermissions(docs);
    expect(problems).toEqual([]);
  });
});

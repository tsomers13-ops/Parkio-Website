import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  auditButtondownBuildConfig,
  findProductionBuildJobs,
  isProductionDeployJob,
  jobGuardsButtondownEnv,
  jobWiresButtondownEnv,
  loadWorkflowDocs,
} from "../scripts/deploy/buttondownBuildGuard.mjs";

describe("isProductionDeployJob — pure logic, fixture-based", () => {
  it("recognizes a real wrangler deploy against wrangler.production.jsonc", () => {
    const job = {
      steps: [{ run: 'npx wrangler deploy --config wrangler.production.jsonc --tag "sha:abc"' }],
    };
    expect(isProductionDeployJob(job)).toBe(true);
  });

  it("does NOT flag a --dry-run deploy (pr-validation.yml's shape)", () => {
    const job = {
      steps: [
        { run: "npx --no-install wrangler deploy --dry-run\n--config wrangler.production.jsonc" },
      ],
    };
    expect(isProductionDeployJob(job)).toBe(false);
  });

  it("does NOT flag a deploy with no --config at all (workers-preview.yml's shape — default/preview config)", () => {
    const job = { steps: [{ run: "npx wrangler deploy" }] };
    expect(isProductionDeployJob(job)).toBe(false);
  });

  it("is false for a job with no steps", () => {
    expect(isProductionDeployJob({ steps: [] })).toBe(false);
    expect(isProductionDeployJob({})).toBe(false);
  });
});

describe("findProductionBuildJobs — pure logic, fixture-based", () => {
  it("finds a job that both builds and deploys to Production", () => {
    const doc = {
      jobs: {
        deploy: {
          steps: [
            { name: "Next build", run: "npm run build" },
            { name: "Deploy", run: "npx wrangler deploy --config wrangler.production.jsonc" },
          ],
        },
      },
    };
    expect(findProductionBuildJobs(doc)).toEqual(["deploy"]);
  });

  it("ignores a job that builds but never deploys to Production (pr-validation.yml's shape)", () => {
    const doc = {
      jobs: {
        validate: { steps: [{ name: "Next build", run: "npm run build" }] },
      },
    };
    expect(findProductionBuildJobs(doc)).toEqual([]);
  });

  it("ignores a job that deploys to Production but has no Next build step of its own", () => {
    const doc = {
      jobs: {
        redeploy: {
          steps: [{ run: "npx wrangler deploy --config wrangler.production.jsonc" }],
        },
      },
    };
    expect(findProductionBuildJobs(doc)).toEqual([]);
  });
});

describe("jobWiresButtondownEnv / jobGuardsButtondownEnv — pure logic, fixture-based", () => {
  it("reproduces the exact historical bug: a Production build job with no NEXT_PUBLIC_BUTTONDOWN_USERNAME anywhere", () => {
    const job = {
      env: { NEXT_PUBLIC_CARTO_API_KEY: "${{ secrets.NEXT_PUBLIC_CARTO_API_KEY }}" },
      steps: [
        { name: "Next build", run: "npm run build" },
        { run: "npx wrangler deploy --config wrangler.production.jsonc" },
      ],
    };
    expect(jobWiresButtondownEnv(job)).toBe(false);
  });

  it("is wired once the job-level env includes it — the actual fix shape", () => {
    const job = {
      env: { NEXT_PUBLIC_BUTTONDOWN_USERNAME: "${{ vars.NEXT_PUBLIC_BUTTONDOWN_USERNAME }}" },
      steps: [{ run: "npm run build" }],
    };
    expect(jobWiresButtondownEnv(job)).toBe(true);
  });

  it("is wired when only a step-level env sets it, not just job-level", () => {
    const job = {
      steps: [
        { run: "npm run build", env: { NEXT_PUBLIC_BUTTONDOWN_USERNAME: "x" } },
      ],
    };
    expect(jobWiresButtondownEnv(job)).toBe(true);
  });

  it("flags a job that wires the env but has no fail-closed guard step before the build", () => {
    const job = {
      env: { NEXT_PUBLIC_BUTTONDOWN_USERNAME: "${{ vars.NEXT_PUBLIC_BUTTONDOWN_USERNAME }}" },
      steps: [{ name: "Next build", run: "npm run build" }],
    };
    expect(jobWiresButtondownEnv(job)).toBe(true);
    expect(jobGuardsButtondownEnv(job)).toBe(false);
  });

  it("recognizes the real 'Require Buttondown configuration' guard shape", () => {
    const job = {
      steps: [
        {
          name: "Require Buttondown configuration",
          run: 'if [ -z "${NEXT_PUBLIC_BUTTONDOWN_USERNAME:-}" ]; then echo "::error::missing"; exit 1; fi',
        },
        { name: "Next build", run: "npm run build" },
      ],
    };
    expect(jobGuardsButtondownEnv(job)).toBe(true);
  });

  it("does not count a guard step that runs AFTER the build as protecting it", () => {
    const job = {
      steps: [
        { name: "Next build", run: "npm run build" },
        {
          name: "Too late",
          run: 'if [ -z "${NEXT_PUBLIC_BUTTONDOWN_USERNAME:-}" ]; then exit 1; fi',
        },
      ],
    };
    expect(jobGuardsButtondownEnv(job)).toBe(false);
  });
});

describe("auditButtondownBuildConfig — scans a whole set of docs", () => {
  it("reports 'missing-env' for the exact historical shape of parkio-daily-publish.yml before the fix", () => {
    const docs = new Map([
      [
        ".github/workflows/parkio-daily-publish.yml",
        {
          jobs: {
            publish: {
              env: { NEXT_PUBLIC_CARTO_API_KEY: "${{ secrets.NEXT_PUBLIC_CARTO_API_KEY }}" },
              steps: [
                { name: "Next build", run: "npm run build" },
                { run: "npx wrangler deploy --config wrangler.production.jsonc" },
              ],
            },
          },
        },
      ],
    ]);
    expect(auditButtondownBuildConfig(docs)).toEqual([
      { path: ".github/workflows/parkio-daily-publish.yml", jobId: "publish", problem: "missing-env" },
    ]);
  });

  it("reports 'missing-guard' when the env is wired but nothing fails the build closed", () => {
    const docs = new Map([
      [
        ".github/workflows/x.yml",
        {
          jobs: {
            deploy: {
              env: { NEXT_PUBLIC_BUTTONDOWN_USERNAME: "${{ vars.NEXT_PUBLIC_BUTTONDOWN_USERNAME }}" },
              steps: [
                { name: "Next build", run: "npm run build" },
                { run: "npx wrangler deploy --config wrangler.production.jsonc" },
              ],
            },
          },
        },
      ],
    ]);
    expect(auditButtondownBuildConfig(docs)).toEqual([
      { path: ".github/workflows/x.yml", jobId: "deploy", problem: "missing-guard" },
    ]);
  });

  it("is clean once both the env and the guard are present — the actual fix shape", () => {
    const docs = new Map([
      [
        ".github/workflows/x.yml",
        {
          jobs: {
            deploy: {
              env: { NEXT_PUBLIC_BUTTONDOWN_USERNAME: "${{ vars.NEXT_PUBLIC_BUTTONDOWN_USERNAME }}" },
              steps: [
                {
                  name: "Require Buttondown configuration",
                  run: 'if [ -z "${NEXT_PUBLIC_BUTTONDOWN_USERNAME:-}" ]; then exit 1; fi',
                },
                { name: "Next build", run: "npm run build" },
                { run: "npx wrangler deploy --config wrangler.production.jsonc" },
              ],
            },
          },
        },
      ],
    ]);
    expect(auditButtondownBuildConfig(docs)).toEqual([]);
  });

  it("never flags a job that doesn't deploy to Production at all", () => {
    const docs = new Map([
      [
        ".github/workflows/pr-validation.yml",
        { jobs: { validate: { steps: [{ run: "npm run build" }] } } },
      ],
    ]);
    expect(auditButtondownBuildConfig(docs)).toEqual([]);
  });
});

describe("the repo's REAL workflow files — the actual regression guard", () => {
  // This is the test that matters: it would have failed `npm test` on the
  // exact commit that broke parkio.info/newsletter in production on
  // 2026-10-23 (parkio-daily-publish.yml's `publish` job had no
  // NEXT_PUBLIC_BUTTONDOWN_USERNAME wiring at all), without needing a live
  // GitHub Actions dispatch — or a day of silently-erased signups — to
  // find out.
  it("has no Production-deploying build job missing Buttondown env wiring or its fail-closed guard", () => {
    const repoRoot = path.resolve(__dirname, "..");
    const docs = loadWorkflowDocs(repoRoot);
    const problems = auditButtondownBuildConfig(docs);
    expect(problems).toEqual([]);
  });

  it("actually exercises both known Production-deploying jobs, not an empty scan", () => {
    // Guards against this test suite silently passing because the
    // detection pattern stopped matching anything at all (e.g. a future
    // wrangler/workflow refactor) rather than because the config is
    // genuinely correct.
    const repoRoot = path.resolve(__dirname, "..");
    const docs = loadWorkflowDocs(repoRoot);
    const found: string[] = [];
    for (const [filePath, doc] of docs) {
      for (const jobId of findProductionBuildJobs(doc)) {
        found.push(`${filePath}#${jobId}`);
      }
    }
    expect(found.sort()).toEqual([
      ".github/workflows/parkio-daily-publish.yml#publish",
      ".github/workflows/workers-production.yml#deploy",
    ]);
  });
});

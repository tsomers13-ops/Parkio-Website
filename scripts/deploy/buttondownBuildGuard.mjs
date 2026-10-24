/**
 * buttondownBuildGuard.mjs — detects the exact class of bug that broke
 * the /newsletter signup form in production on 2026-10-23: a workflow
 * job that builds the Next app and deploys it to the Production Worker
 * (`wrangler deploy --config wrangler.production.jsonc`, not a preview
 * or dry-run) without wiring NEXT_PUBLIC_BUTTONDOWN_USERNAME into its
 * build-time env, or without a fail-closed guard step that stops the
 * build if that value is missing.
 *
 * Next.js inlines NEXT_PUBLIC_* values at build time
 * (`npm run build`, the "Next build" step in these workflows). A build
 * job that lacks the env wiring produces a Worker whose /newsletter page
 * (lib/buttondown.ts's BUTTONDOWN_READY ladder) silently falls back to
 * its configuration-pending placeholder — no form, "Coming soon" — with
 * every test, typecheck, and the deploy itself all staying green. That
 * is exactly what happened: workers-production.yml had the wiring and
 * the guard; parkio-daily-publish.yml deploys the SAME Production
 * Worker independently (see that file's own header comment — it is
 * deliberately not a `workflow_call` into workers-production.yml, so it
 * never inherited that file's Buttondown wiring) and had neither. Every
 * Daily publish after that re-deployed the Worker and re-erased the
 * signup form, even though the application-release path had it working.
 *
 * This module exists so that regression can never silently reappear,
 * checked directly against this repo's real workflow files by `npm
 * test` — no live GitHub Actions dispatch required to catch it. Mirrors
 * the design of workflowPermissions.mjs, which this repo already uses
 * the same way for the caller/callee permissions and secret-forwarding
 * classes of bug.
 *
 * Deliberately scoped to jobs that actually deploy to PRODUCTION (see
 * isProductionDeployJob below) — not every job that happens to run
 * `npm run build`. pr-validation.yml builds and dry-run-deploys against
 * wrangler.production.jsonc for validation only; workers-preview.yml
 * deploys to the preview Worker. Neither ships anything a real visitor
 * sees, so neither is held to this contract.
 */

import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

const NEXT_BUILD_RUN_PATTERN = /\bnpm run build\b/;
const PRODUCTION_DEPLOY_RUN_PATTERN =
  /wrangler deploy\b(?:(?!--dry-run).)*--config\s+wrangler\.production\.jsonc/s;
const BUTTONDOWN_ENV_KEY = "NEXT_PUBLIC_BUTTONDOWN_USERNAME";

/**
 * A parsed workflow step, loosely typed on purpose: real workflow YAML
 * steps carry other fields (`id`, `uses`, `if`, ...) this module never
 * reads, and fixtures in tests only ever set the fields a given check
 * cares about. Narrower per-function types here would reject perfectly
 * valid fixtures/real steps for fields that are simply irrelevant to
 * that function.
 * @typedef {{name?: string, run?: string, env?: Record<string, unknown>}} WorkflowStep
 * @typedef {{env?: Record<string, unknown>, steps?: WorkflowStep[]}} WorkflowJob
 */

/**
 * @param {WorkflowStep} step
 * @param {RegExp} pattern
 */
function stepRunMatches(step, pattern) {
  return typeof step?.run === "string" && pattern.test(step.run);
}

/**
 * True if any step in the job actually deploys the Production Worker —
 * a real `wrangler deploy` (not `--dry-run`) against
 * wrangler.production.jsonc.
 *
 * @param {WorkflowJob} job
 */
export function isProductionDeployJob(job) {
  const steps = job?.steps ?? [];
  return steps.some((s) => stepRunMatches(s, PRODUCTION_DEPLOY_RUN_PATTERN));
}

/**
 * Finds every job in a parsed workflow doc that both (a) runs a Next.js
 * production build and (b) actually deploys that build to Production.
 * That pairing is the exact point this bug class lives at — a build job
 * with no Production deploy step (e.g. pr-validation.yml's dry run) is
 * not held to this contract.
 *
 * @param {{jobs?: Record<string, WorkflowJob>}} doc
 * @returns {string[]} jobIds
 */
export function findProductionBuildJobs(doc) {
  const jobs = doc?.jobs ?? {};
  const result = [];
  for (const [jobId, job] of Object.entries(jobs)) {
    const steps = job?.steps ?? [];
    const hasNextBuild = steps.some((s) => stepRunMatches(s, NEXT_BUILD_RUN_PATTERN));
    if (hasNextBuild && isProductionDeployJob(job)) {
      result.push(jobId);
    }
  }
  return result;
}

/**
 * True if NEXT_PUBLIC_BUTTONDOWN_USERNAME is wired into the job's
 * build-time environment — checked at job level (applies to every step,
 * including the Next build step) and at individual step level (GitHub
 * Actions merges step env over job env for that one step).
 *
 * @param {WorkflowJob} job
 */
export function jobWiresButtondownEnv(job) {
  if (job?.env && Object.prototype.hasOwnProperty.call(job.env, BUTTONDOWN_ENV_KEY)) {
    return true;
  }
  const steps = job?.steps ?? [];
  return steps.some(
    (s) => s?.env && Object.prototype.hasOwnProperty.call(s.env, BUTTONDOWN_ENV_KEY),
  );
}

/**
 * True if some step BEFORE the Next build step fails the job closed when
 * NEXT_PUBLIC_BUTTONDOWN_USERNAME is empty — the "Require Buttondown
 * configuration" pattern. Checked separately from jobWiresButtondownEnv:
 * a job can reference the variable without ever refusing to proceed when
 * it's blank, which is exactly as silent a failure as not wiring it at
 * all (an empty env var and an unset one both inline to `""`).
 *
 * @param {WorkflowJob} job
 */
export function jobGuardsButtondownEnv(job) {
  const steps = job?.steps ?? [];
  const buildIndex = steps.findIndex((s) => stepRunMatches(s, NEXT_BUILD_RUN_PATTERN));
  const stepsBeforeBuild = buildIndex === -1 ? steps : steps.slice(0, buildIndex);
  return stepsBeforeBuild.some(
    (s) =>
      typeof s?.run === "string" &&
      s.run.includes(BUTTONDOWN_ENV_KEY) &&
      /exit 1\b/.test(s.run),
  );
}

/**
 * Scans a set of parsed workflow documents (path -> parsed YAML) and
 * reports every Production-deploying build job missing the
 * NEXT_PUBLIC_BUTTONDOWN_USERNAME wiring and/or its fail-closed guard.
 * Pure — takes already-parsed docs, not file paths, so it's trivially
 * unit-testable with fixtures (see findPermissionGaps/
 * findSecretForwardingGaps in workflowPermissions.mjs for the same
 * pattern in this repo).
 *
 * @param {Map<string, any>} docsByPath
 * @returns {Array<{path: string, jobId: string, problem: "missing-env" | "missing-guard"}>}
 */
export function auditButtondownBuildConfig(docsByPath) {
  const problems = [];
  for (const [filePath, doc] of docsByPath) {
    for (const jobId of findProductionBuildJobs(doc)) {
      const job = doc.jobs[jobId];
      if (!jobWiresButtondownEnv(job)) {
        // Missing the guard too would be a certainty here (there's
        // nothing to guard), so report just the root cause.
        problems.push({ path: filePath, jobId, problem: "missing-env" });
        continue;
      }
      if (!jobGuardsButtondownEnv(job)) {
        problems.push({ path: filePath, jobId, problem: "missing-guard" });
      }
    }
  }
  return problems;
}

/**
 * Loads every workflow YAML file under .github/workflows into a Map
 * keyed the same way workflowPermissions.mjs's loadWorkflowDocs keys
 * it, so the two modules can share fixtures/usage style. Duplicated
 * rather than imported from that module on purpose: this module has no
 * other dependency on workflowPermissions.mjs's caller/callee-specific
 * logic, and importing just this one loader across files would be a
 * less obvious coupling than re-reading six YAML files with `js-yaml`'s
 * sibling `yaml` package already used throughout this repo.
 *
 * @param {string} repoRoot
 */
export function loadWorkflowDocs(repoRoot) {
  const dir = path.join(repoRoot, ".github", "workflows");
  const docs = new Map();
  for (const entry of fs.readdirSync(dir)) {
    if (!/\.ya?ml$/.test(entry)) continue;
    const relPath = path.join(".github", "workflows", entry);
    const content = fs.readFileSync(path.join(dir, entry), "utf8");
    docs.set(relPath, parseYaml(content));
  }
  return docs;
}

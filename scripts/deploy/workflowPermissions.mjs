/**
 * workflowPermissions.mjs — detects the exact class of bug that broke
 * Parkio Daily's first production activation attempt: a caller job invokes
 * a local reusable workflow (`uses: ./...`) whose own job declares
 * `permissions: contents: write`, but the CALLER job grants less (often
 * nothing at all, silently inheriting the repo's read-only default).
 * GitHub Actions rejects the whole workflow FILE at dispatch time when
 * this happens — "is only allowed 'contents: read'" — before any job
 * (including an unrelated `build` job earlier in the same file) ever runs.
 *
 * This was NOT caught by actionlint, nor by the preview-only integration
 * testing done before PR #18 merged — that testing used standalone
 * workflows with no reusable-workflow call at all, so this exact
 * caller/callee shape was never exercised until a real, unsimulated
 * dispatch hit it in production. This file exists so it can never
 * silently reappear, checked directly against this repo's real workflow
 * files by `npm test` — no live GitHub Actions run required to catch it.
 *
 * Deliberately conservative: a caller job with NO `permissions:` block at
 * all is never assumed to inherit "enough" from some repo/org default —
 * that ambient-default assumption is exactly what caused the real bug.
 * Only an EXPLICIT grant on the caller job (or workflow-level default,
 * which still has to be read explicitly from the file) counts.
 */

import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

const SCOPE_RANK = { none: 0, read: 1, write: 2 };

function rankOf(level) {
  return SCOPE_RANK[level] ?? 0;
}

/**
 * Normalizes a job's `permissions:` value (undefined, a map, or the
 * `read-all`/`write-all`/`none` shorthand strings GitHub also accepts)
 * into a map of scope -> rank, for the specific scopes we care about
 * comparing. Scopes absent from the map are rank 0 ("not explicitly
 * granted"), never assumed to be covered by some outside default.
 *
 * @param {unknown} permissions
 * @param {string[]} scopesToCheck
 */
function normalizePermissions(permissions, scopesToCheck) {
  const result = {};
  if (permissions === "write-all") {
    for (const scope of scopesToCheck) result[scope] = SCOPE_RANK.write;
    return result;
  }
  if (permissions === "read-all") {
    for (const scope of scopesToCheck) result[scope] = SCOPE_RANK.read;
    return result;
  }
  // undefined, "none", or any other non-object: nothing explicitly granted.
  if (!permissions || typeof permissions !== "object") {
    for (const scope of scopesToCheck) result[scope] = 0;
    return result;
  }
  for (const scope of scopesToCheck) {
    result[scope] = rankOf(permissions[scope]);
  }
  return result;
}

/**
 * Compares one caller job's explicit permissions against the UNION
 * (most permissive requirement per scope, across all of the callee
 * file's jobs) of what the reusable workflow it calls requires.
 *
 * @param {{callerPath?: string, jobId?: string, permissions?: unknown}} caller
 * @param {{path: string, jobs: Record<string, {permissions?: unknown}>}} callee
 * @returns {Array<{scope: string, required: string, granted: string}>}
 */
export function findPermissionGaps(caller, callee) {
  const calleeJobs = Object.values(callee.jobs ?? {});
  const scopes = new Set();
  for (const job of calleeJobs) {
    const perms = job.permissions;
    if (perms && typeof perms === "object") {
      for (const scope of Object.keys(perms)) scopes.add(scope);
    } else if (perms === "write-all" || perms === "read-all") {
      // Can't enumerate specific scope names from the shorthand alone;
      // nothing else to add here — the shorthand's own normalization
      // below handles it against whatever scopes the CALLER cares to
      // compare against, which in practice means callers should avoid
      // depending on a shorthand-only callee without naming scopes.
    }
  }
  if (scopes.size === 0) return [];

  const scopeList = [...scopes];
  const requiredByScope = {};
  for (const scope of scopeList) requiredByScope[scope] = 0;
  for (const job of calleeJobs) {
    const normalized = normalizePermissions(job.permissions, scopeList);
    for (const scope of scopeList) {
      requiredByScope[scope] = Math.max(requiredByScope[scope], normalized[scope]);
    }
  }

  const granted = normalizePermissions(caller.permissions, scopeList);
  const rankToName = (r) => Object.keys(SCOPE_RANK).find((k) => SCOPE_RANK[k] === r) ?? String(r);

  const gaps = [];
  for (const scope of scopeList) {
    if (granted[scope] < requiredByScope[scope]) {
      gaps.push({ scope, required: rankToName(requiredByScope[scope]), granted: rankToName(granted[scope]) });
    }
  }
  return gaps;
}

/**
 * Scans a set of parsed workflow documents (path -> parsed YAML) for every
 * job that calls a LOCAL reusable workflow (`uses: ./...`), and reports
 * every caller/callee permission gap found. Pure — takes already-parsed
 * docs, not file paths, so it's trivially unit-testable with fixtures.
 *
 * @param {Map<string, any>} docsByPath - keys are paths as a `uses:`
 *   value would reference them after stripping the leading `./`, e.g.
 *   ".github/workflows/parkio-daily-publish.yml".
 * @returns {Array<{callerPath: string, jobId: string, calleePath: string, scope: (string|null), required: (string|null), granted: (string|null), error?: string}>}
 */
export function auditWorkflowPermissions(docsByPath) {
  const problems = [];
  for (const [callerPath, callerDoc] of docsByPath) {
    const jobs = callerDoc?.jobs ?? {};
    for (const [jobId, job] of Object.entries(jobs)) {
      if (typeof job?.uses !== "string" || !job.uses.startsWith("./")) continue;
      const calleePath = job.uses.replace(/^\.\//, "");
      const calleeDoc = docsByPath.get(calleePath);
      if (!calleeDoc) {
        problems.push({ callerPath, jobId, calleePath, scope: null, required: null, granted: null, error: "callee workflow file not found" });
        continue;
      }
      const gaps = findPermissionGaps({ callerPath, jobId, permissions: job.permissions }, { path: calleePath, jobs: calleeDoc.jobs });
      for (const gap of gaps) {
        problems.push({ callerPath, jobId, calleePath, ...gap });
      }
    }
  }
  return problems;
}

/**
 * Reads and parses every `.yml`/`.yaml` file directly under
 * `.github/workflows/` (relative to repoRoot), keyed by their path exactly
 * as a local `uses: ./...` value would reference them.
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

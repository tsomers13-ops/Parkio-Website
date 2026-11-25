#!/usr/bin/env node
/**
 * Same-day release inputs for Parkio Daily.
 *
 * Two explicit paths, both re-checked by factcheck.mjs. No skip switch.
 *
 *   release_held_run_id + ack=<finding ids>
 *     The workflow downloads that run's parkio-daily-held artifact.
 *     This script copies briefing.json only after its sha256 matches
 *     report.json, and only when the slug is today in America/New_York.
 *
 *   fixed_ref=daily-fix/<slug>
 *     Copies only content/guide/daily/<slug>.json from that ref.
 *     The ref name has to be today's slug. Nothing else on the branch
 *     is checked out or committed.
 *
 * A dispatch with neither input is a normal run (regenerate, or the
 * scheduled run). Ack without one of those inputs is an error.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { etToday, parseAckList, repoRoot } from "./factcheck.mjs";
import { isValidExistingDailyPost } from "./build.mjs";

export function parseFixedRef(ref, today) {
  const bare = String(ref || "")
    .trim()
    .replace(/^refs\/heads\//, "")
    .replace(/^origin\//, "");
  if (!bare) return { ok: true, empty: true, problems: [] };
  if (bare.includes("..") || bare.includes("\\") || /\s/.test(bare) || bare.startsWith("-")) {
    return { ok: false, problems: ["fixed_ref contains unsupported characters."] };
  }
  const m = /^daily-fix\/(parkio-daily-(\d{4}-\d{2}-\d{2}))$/.exec(bare);
  if (!m) {
    return { ok: false, problems: ["fixed_ref must be daily-fix/parkio-daily-YYYY-MM-DD."] };
  }
  if (m[2] !== today) {
    return {
      ok: false,
      problems: [`fixed_ref date ${m[2]} is not today in America/New_York (${today}).`],
    };
  }
  return {
    ok: true,
    empty: false,
    problems: [],
    ref: bare,
    slug: m[1],
    date: m[2],
    relPath: `content/guide/daily/${m[1]}.json`,
  };
}

export function inspectInputs({ releaseHeldRunId, fixedRef, ack, today }) {
  const runId = String(releaseHeldRunId || "").trim();
  const ref = String(fixedRef || "").trim();
  const ackIds = parseAckList(ack);
  const problems = [];
  if (runId && ref) {
    problems.push("Set only one of release_held_run_id and fixed_ref.");
  }
  if (runId && !/^\d{1,12}$/.test(runId)) {
    problems.push("release_held_run_id must be a numeric Actions run id.");
  }
  const fixed = parseFixedRef(ref, today);
  if (!fixed.ok) problems.push(...fixed.problems);
  if (ackIds.length && !runId && !ref) {
    problems.push("ack is only accepted with release_held_run_id or fixed_ref. There is no skip switch.");
  }
  const ok = problems.length === 0;
  return {
    ok,
    problems,
    download: Boolean(ok && runId),
    apply: Boolean(ok && (runId || ref)),
    runId,
    fixed: fixed.ok && !fixed.empty ? fixed : null,
    ackIds,
  };
}

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Copies the held briefing into today's content path when the bytes match
 * the report. Returns the absolute destination path.
 */
export function materializeHeldBriefing({ artifactDir, repo, today }) {
  const briefingPath = path.join(artifactDir, "briefing.json");
  const reportPath = path.join(artifactDir, "report.json");
  if (!existsSync(briefingPath) || !existsSync(reportPath)) {
    throw new Error(`Held artifact in ${artifactDir} is missing briefing.json or report.json.`);
  }
  const bytes = readFileSync(briefingPath);
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const sha = sha256Bytes(bytes);
  if (!report.sha256 || sha !== report.sha256) {
    throw new Error(`Held briefing sha256 ${sha} does not match report.json (${report.sha256 || "missing"}).`);
  }
  let post;
  try {
    post = JSON.parse(bytes.toString("utf8"));
  } catch (err) {
    throw new Error(`Held briefing is not JSON (${err.message}).`);
  }
  if (!isValidExistingDailyPost(post)) {
    throw new Error("Held briefing is missing slug, title, date, or teaser.");
  }
  const slug = `parkio-daily-${today}`;
  if (post.date !== today || post.slug !== slug) {
    throw new Error(`Held briefing is ${post.slug} (${post.date}), not today ${slug}.`);
  }
  const dest = path.join(repo, "content", "guide", "daily", `${slug}.json`);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, bytes);
  return { dest, sha, post };
}

/**
 * Put the held run's feed evidence where build.mjs and factcheck.mjs read
 * it, before build's idempotent no-op. build.mjs will not overwrite a file
 * that is already there, so the release is re-checked against the same
 * sources and the same finding ids.
 */
export function restoreHeldEvidence(artifactDir, dest = defaultEvidencePath()) {
  const src = path.join(artifactDir, "evidence.json");
  if (!existsSync(src)) return { restored: false };
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return { restored: true, dest };
}

function defaultEvidencePath() {
  if (process.env.PARKIO_DAILY_EVIDENCE_PATH) return process.env.PARKIO_DAILY_EVIDENCE_PATH;
  return path.join(process.env.RUNNER_TEMP || tmpdir(), "parkio-daily-evidence.json");
}

export function readFixedRefBytes(spec, git = defaultGit) {
  // FETCH_HEAD is this ref only. Do not check the branch out.
  git(["fetch", "--no-tags", "origin", `refs/heads/${spec.ref}`]);
  return git(["show", `FETCH_HEAD:${spec.relPath}`]);
}

export function materializeFixedRef({ spec, repo, git = defaultGit }) {
  const text = readFixedRefBytes(spec, git);
  let post;
  try {
    post = JSON.parse(text);
  } catch (err) {
    throw new Error(`fixed_ref JSON is not valid (${err.message}).`);
  }
  if (!isValidExistingDailyPost(post)) {
    throw new Error("fixed_ref briefing is missing slug, title, date, or teaser.");
  }
  if (post.date !== spec.date || post.slug !== spec.slug) {
    throw new Error(`fixed_ref file says ${post.slug} / ${post.date}, not ${spec.slug}.`);
  }
  const dest = path.join(repo, spec.relPath);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, text.endsWith("\n") ? text : `${text}\n`);
  return { dest, post };
}

function defaultGit(args) {
  return execFileSync("git", args, {
    cwd: repoRoot(),
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

function writeOutput(pairs) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  const lines = Object.entries(pairs).map(([key, value]) => `${key}=${value}`).join("\n");
  appendFileSync(file, `${lines}\n`);
}

function inputsFromEnv() {
  return inspectInputs({
    releaseHeldRunId: process.env.RELEASE_HELD_RUN_ID,
    fixedRef: process.env.FIXED_REF,
    ack: process.env.ACK,
    today: process.env.PARKIO_DAILY_TODAY || etToday(),
  });
}

export function runCheck() {
  const inspected = inputsFromEnv();
  if (!inspected.ok) {
    for (const problem of inspected.problems) console.error(`::error::${problem}`);
    return 1;
  }
  writeOutput({
    download: inspected.download ? "true" : "false",
    apply: inspected.apply ? "true" : "false",
  });
  if (!inspected.apply) {
    console.log("[parkio-daily] No release inputs. This is a normal enforced run.");
  } else if (inspected.runId) {
    console.log(`[parkio-daily] Will release held run ${inspected.runId} after the fact-check ack.`);
  } else {
    console.log(`[parkio-daily] Will copy ${inspected.fixed.relPath} from ${inspected.fixed.ref}.`);
  }
  return 0;
}

export function runApply() {
  const inspected = inputsFromEnv();
  if (!inspected.ok) {
    for (const problem of inspected.problems) console.error(`::error::${problem}`);
    return 1;
  }
  if (!inspected.apply) return 0;
  const repo = repoRoot();
  const today = process.env.PARKIO_DAILY_TODAY || etToday();
  if (inspected.runId) {
    const artifactDir = process.env.HELD_ARTIFACT_DIR;
    if (!artifactDir) throw new Error("HELD_ARTIFACT_DIR is not set.");
    const { dest, sha } = materializeHeldBriefing({ artifactDir, repo, today });
    const evidence = restoreHeldEvidence(artifactDir);
    console.log(
      evidence.restored
        ? `[parkio-daily] Restored held briefing to ${dest} (${sha}) and feed evidence to ${evidence.dest}.`
        : `[parkio-daily] Restored held briefing to ${dest} (${sha}). No evidence.json in the artifact; the re-check is JSON-only.`,
    );
    return 0;
  }
  const { dest } = materializeFixedRef({ spec: inspected.fixed, repo });
  console.log(`[parkio-daily] Copied ${inspected.fixed.relPath} from ${inspected.fixed.ref} to ${dest}.`);
  return 0;
}

function main() {
  const mode = process.argv[2];
  if (mode === "--check") return runCheck();
  if (mode === "--apply") return runApply();
  console.error("usage: releaseInputs.mjs --check|--apply");
  return 2;
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exit(main());
  } catch (err) {
    console.error(`::error::${err?.message || err}`);
    process.exit(1);
  }
}

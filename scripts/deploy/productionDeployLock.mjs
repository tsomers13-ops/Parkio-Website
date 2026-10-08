#!/usr/bin/env node
/**
 * productionDeployLock.mjs — mutual exclusion between the two paths that can
 * deploy the production `parkio` Worker: workers-production.yml (human-
 * approved application releases) and parkio-daily-publish.yml (unattended
 * Daily content publication). Neither path alone can prevent overlapping
 * `wrangler deploy` calls — Cloudflare's deploy API has no compare-and-swap,
 * so whichever call completes last simply wins. This is the thing that
 * stands between the two.
 *
 * MECHANISM: a dedicated git branch, `deploy-lock`, holds one file
 * (LOCK_FILE) encoding the current holder as JSON. Acquiring the lock means
 * pushing a new commit to that branch; Git's own non-fast-forward rejection
 * IS the compare-and-swap — if the branch moved since we last read it,
 * our push is rejected atomically, with no race of its own. This needs only
 * the ordinary `contents: write` permission already available via the
 * default GITHUB_TOKEN — no new Cloudflare credential or scope.
 *
 * WHY A FIXED LEASE ALONE IS NOT ENOUGH, AND WHAT ACTUALLY PREVENTS OVERLAP:
 * a time-based lease only bounds how long a *crashed* holder can wedge the
 * lock. It does NOT, by itself, prevent overlap if the protected operation
 * (the deploy call) is still genuinely in-flight when the lease expires —
 * a second run could then acquire and start its own deploy while the first
 * is still running, and whichever Cloudflare finishes processing last wins,
 * silently. Detecting this *after* the fact (checking lock ownership once
 * the deploy call returns) is not prevention — the bad outcome can already
 * have happened by the time you check.
 *
 * The actual prevention is `withDeadline`: the deploy command itself is run
 * under a hard, enforced subprocess timeout strictly SHORTER than the lease.
 * If it would run long enough to risk the lease expiring, it is killed
 * before that can happen, and the job fails rather than silently finishing
 * late. This makes "the lease outlives the protected operation" an enforced
 * invariant, not a hope — the lease duration only has to be conservative
 * relative to a timeout we ourselves control, not to the unbounded
 * worst case of a hung network call.
 *
 * Residual risk, stated plainly rather than hidden: if Cloudflare's own
 * server-side processing of the final activation call is unusually slow
 * strictly AFTER that request was already irrecoverably sent — before our
 * client would see the response — killing our local process cannot undo
 * work Cloudflare already started. This is an inherent limit of any
 * client-side coordination around a third-party API with no native
 * cancellation or compare-and-swap; it is not specific to choosing git over
 * some other external lock (a D1-based lock would have the identical edge
 * case). It is not mitigated further here.
 */

import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const LOCK_BRANCH = "deploy-lock";
export const LOCK_FILE = "lock.json";

/** Caps on retry/backoff, exported so tests and callers share one source of truth. */
export const DEFAULT_LEASE_MS = 5 * 60 * 1000; // 5 minutes
export const DEFAULT_ACQUIRE_TIMEOUT_MS = 3 * 60 * 1000; // give up trying to acquire after this
export const DEFAULT_RETRY_DELAY_MS = 5000;
/** The deploy command's own hard timeout — MUST be < lease, with margin. */
export const DEFAULT_DEPLOY_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

/**
 * @typedef {object} LockState
 * @property {string|null} holder - 'release' | 'daily' | null (unlocked).
 * @property {string|null} runId - the holder's unique run identity, or null.
 * @property {number|null} acquiredAt
 * @property {number} expiresAt
 */

export function isExpired(state, now = Date.now()) {
  return !state || typeof state.expiresAt !== "number" || state.expiresAt <= now;
}

export function isHeldBy(state, runId, now = Date.now()) {
  return !!state && !isExpired(state, now) && state.runId === runId;
}

/**
 * Pure acquire-decision logic over an injected git interface, so this is
 * testable without a real git repo or network access.
 *
 * @param {object} git
 * @param {() => {sha: string|null, state: LockState|null}} git.read - current
 *   tip sha (or null if the branch doesn't exist yet) and its decoded lock
 *   state (or null if absent/corrupt).
 * @param {(baseSha: string|null, nextState: LockState) => {ok: boolean}} git.write -
 *   attempts to push nextState as a new commit on top of baseSha. Returns
 *   ok:false on a non-fast-forward rejection (someone else moved the branch).
 * @param {string} runId - this run's own identity, e.g. the GitHub Actions run id.
 * @param {string} holder - 'release' | 'daily'.
 * @param {object} [opts]
 * @param {number} [opts.leaseMs]
 * @param {number} [opts.timeoutMs] - give up and return ok:false after this long.
 * @param {number} [opts.retryDelayMs]
 * @param {() => number} [opts.now]
 * @param {(ms: number) => Promise<void> | void} [opts.sleep]
 */
export async function acquireLock(git, runId, holder, opts = {}) {
  const {
    leaseMs = DEFAULT_LEASE_MS,
    timeoutMs = DEFAULT_ACQUIRE_TIMEOUT_MS,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    now = Date.now,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = opts;

  const deadline = now() + timeoutMs;
  for (;;) {
    const { sha, state } = git.read();
    if (!isExpired(state, now())) {
      if (now() >= deadline) {
        return { ok: false, reason: `timed out waiting for lock held by "${state.holder}"` };
      }
      await sleep(retryDelayMs);
      continue;
    }
    const nextState = { holder, runId, acquiredAt: now(), expiresAt: now() + leaseMs };
    const result = git.write(sha, nextState);
    if (result.ok) {
      return { ok: true, state: nextState };
    }
    // Lost the race to someone else's concurrent acquire. Re-read and retry.
    if (now() >= deadline) {
      return { ok: false, reason: "timed out: lost the compare-and-swap repeatedly" };
    }
    await sleep(retryDelayMs);
  }
}

/**
 * Verifies we still hold the lock right now — the explicit check that
 * replaces "assume the lease covers it". Called immediately before AND
 * immediately after the deploy command.
 * @param {{read: () => {sha: string|null, state: LockState|null}}} git
 * @param {string} runId
 * @param {() => number} [now]
 */
export function verifyOwnership(git, runId, now = Date.now) {
  const { state } = git.read();
  return isHeldBy(state, runId, now());
}

/**
 * Releases the lock ONLY if currently held by runId — never clears a lock
 * acquired by someone else (e.g. after our own lease already expired and
 * was reclaimed). Returns ok:true if free afterwards either way (already
 * not ours is not an error to release).
 * @param {{read: () => {sha: string|null, state: LockState|null}, write: (baseSha: string|null, nextState: LockState) => {ok: boolean}}} git
 * @param {string} runId
 * @param {() => number} [now]
 */
export function releaseLock(git, runId, now = Date.now) {
  const { sha, state } = git.read();
  if (!isHeldBy(state, runId, now())) {
    return { ok: true, releasedByUs: false };
  }
  const result = git.write(sha, { holder: null, runId: null, acquiredAt: null, expiresAt: 0 });
  return { ok: result.ok, releasedByUs: result.ok };
}

/**
 * Enforces the "lease outlives the protected operation" invariant: runs fn
 * (expected to call the actual deploy command) under a hard deadline. If fn
 * would still be running at deadlineMs, the caller's own timeout mechanism
 * (see runDeployCommand below, which wraps execFileSync's native `timeout`)
 * is what actually kills it — this function just documents/asserts the
 * contract that deadlineMs < leaseMs.
 */
export function assertSafeDeadline(deployTimeoutMs, leaseMs) {
  if (deployTimeoutMs >= leaseMs) {
    throw new Error(
      `deploy timeout (${deployTimeoutMs}ms) must be strictly less than the lease (${leaseMs}ms) — otherwise the lease cannot be relied on to outlive the deploy.`
    );
  }
}

/**
 * Runs the actual deploy command under a hard, killing timeout. Throws if
 * it exceeds deployTimeoutMs or exits non-zero.
 *
 * Deliberately NOT execFileSync's built-in `timeout`/`killSignal`: that
 * only signals the single direct child process. Verified empirically
 * before relying on this — a command that backgrounds a grandchild (e.g.
 * `sleep 20 &` inside a shell) left that grandchild running, now
 * re-parented to PID 1, completely unaffected by the "kill", well past
 * the timeout. Since wrangler (or anything it shells out to) is not
 * something we control the internals of, the timeout has to kill the
 * whole process TREE, not just the one PID we spawned.
 *
 * Fix: spawn the child `detached: true` so it gets its own process group,
 * and on timeout send the kill signal to the whole group via the negative
 * PID (`process.kill(-pid, signal)`), a POSIX-only mechanism — fine here,
 * every workflow using this runs on `ubuntu-latest`.
 */
export function runDeployCommand(command, args, { deployTimeoutMs = DEFAULT_DEPLOY_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", detached: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // Group already gone — nothing left to kill.
      }
    }, deployTimeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`command timed out after ${deployTimeoutMs}ms and was killed (signal: ${signal})`));
      } else if (code !== 0) {
        reject(new Error(`command exited with code ${code}${signal ? ` (signal: ${signal})` : ""}`));
      } else {
        resolve();
      }
    });
  });
}

// ---- real git-backed implementation, used by the CLI entry point only ----

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function realGitInterface() {
  return {
    read() {
      try {
        git(["fetch", "origin", LOCK_BRANCH]);
      } catch {
        // Branch doesn't exist remotely yet — treated as unlocked/bootstrap.
        return { sha: null, state: null };
      }
      const sha = git(["rev-parse", "FETCH_HEAD"]);
      let content;
      try {
        content = git(["show", `FETCH_HEAD:${LOCK_FILE}`]);
      } catch {
        return { sha, state: null };
      }
      try {
        return { sha, state: JSON.parse(content) };
      } catch {
        return { sha, state: null };
      }
    },
    write(baseSha, nextState) {
      const tmpDir = git(["rev-parse", "--git-dir"]);
      const blobContent = JSON.stringify(nextState, null, 2) + "\n";
      const blobSha = execFileSync("git", ["hash-object", "-w", "--stdin"], {
        input: blobContent,
        encoding: "utf8",
      }).trim();
      const treeSha = execFileSync(
        "git",
        ["mktree"],
        { input: `100644 blob ${blobSha}\t${LOCK_FILE}\n`, encoding: "utf8" }
      ).trim();
      const parentArgs = baseSha ? ["-p", baseSha] : [];
      // Explicit author/committer env, not global git config: a fresh CI
      // runner has no configured identity, and `commit-tree` refuses to
      // create a commit without one ("Author identity unknown"). Found by
      // live integration testing — the mocked unit tests never exercised
      // a real `git commit-tree` call, so this was invisible until an
      // actual CI runner tried it.
      const commitSha = execFileSync(
        "git",
        ["commit-tree", treeSha, ...parentArgs, "-m", `deploy-lock: ${nextState.holder ?? "release"}`],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            GIT_AUTHOR_NAME: "production-deploy-lock",
            GIT_AUTHOR_EMAIL: "production-deploy-lock@users.noreply.github.com",
            GIT_COMMITTER_NAME: "production-deploy-lock",
            GIT_COMMITTER_EMAIL: "production-deploy-lock@users.noreply.github.com",
          },
        }
      ).trim();
      const refSpec = baseSha
        ? `${commitSha}:refs/heads/${LOCK_BRANCH}`
        : `${commitSha}:refs/heads/${LOCK_BRANCH}`;
      try {
        if (baseSha) {
          // Fast-forward only: fails if the remote moved since our read.
          git(["push", "origin", `${commitSha}:refs/heads/${LOCK_BRANCH}`]);
        } else {
          // First-ever write: branch doesn't exist remotely yet. Use
          // --force-with-lease against "no ref" so a concurrent first
          // writer still loses a real race instead of both succeeding.
          git(["push", "origin", "--force-with-lease=" + `refs/heads/${LOCK_BRANCH}:`, refSpec]);
        }
        return { ok: true };
      } catch {
        return { ok: false };
      }
    },
  };
}

// CLI entry point. Subcommands:
//   acquire <holder> <runId>
//   verify <runId>
//   release <runId>
//   deploy <runId> <deployTimeoutMs> -- <command> [args...]
//     Runs <command> under runDeployCommand's hard timeout. This is the
//     enforcement half of the lease-safety argument: the lease only has to
//     outlive THIS bounded, killable call, not an unbounded wrangler
//     invocation.
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const [action] = args;
  const gitIface = realGitInterface();

  if (action === "acquire") {
    const [, holder, runId] = args;
    const result = await acquireLock(gitIface, runId, holder);
    if (!result.ok) {
      console.error(`::error::Could not acquire production deploy lock: ${result.reason}`);
      process.exit(1);
    }
    console.log(`Lock acquired by ${holder} (${runId}), expires ${new Date(result.state.expiresAt).toISOString()}`);
    process.exit(0);
  } else if (action === "verify") {
    const [, runId] = args;
    const ok = verifyOwnership(gitIface, runId);
    if (!ok) {
      console.error(`::error::Lock ownership verification failed for run ${runId} — refusing to proceed.`);
      process.exit(1);
    }
    console.log("Lock ownership verified.");
    process.exit(0);
  } else if (action === "release") {
    const [, runId] = args;
    const result = releaseLock(gitIface, runId);
    if (!result.releasedByUs) {
      console.log("Lock was not held by this run at release time (already lost or never held) — nothing to release.");
    } else {
      console.log("Lock released.");
    }
    process.exit(result.ok ? 0 : 1);
  } else if (action === "deploy") {
    const [, runId, deployTimeoutMsStr, sep, ...command] = args;
    if (sep !== "--" || command.length === 0) {
      console.error("usage: productionDeployLock.mjs deploy <runId> <deployTimeoutMs> -- <command> [args...]");
      process.exit(2);
    }
    const deployTimeoutMs = Number(deployTimeoutMsStr);
    assertSafeDeadline(deployTimeoutMs, DEFAULT_LEASE_MS);
    if (!verifyOwnership(gitIface, runId)) {
      console.error(`::error::Lock ownership verification failed for run ${runId} immediately before deploy — refusing to deploy.`);
      process.exit(1);
    }
    try {
      await runDeployCommand(command[0], command.slice(1), { deployTimeoutMs });
    } catch (err) {
      console.error(`::error::Deploy command failed or was killed after exceeding ${deployTimeoutMs}ms: ${err?.message ?? err}`);
      process.exit(1);
    }
    if (!verifyOwnership(gitIface, runId)) {
      console.error(
        "::error::Lock ownership verification failed immediately AFTER deploy — the deploy already ran and cannot be undone, but the mutual-exclusion guarantee may have been violated during it. Verify production state manually."
      );
      process.exit(1);
    }
    console.log("Deploy completed with lock ownership verified before and after.");
    process.exit(0);
  } else {
    console.error("usage: productionDeployLock.mjs <acquire|release|verify|deploy> ...");
    process.exit(2);
  }
}

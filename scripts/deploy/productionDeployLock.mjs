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
 * FAIL-CLOSED ON AMBIGUOUS OUTCOMES (the residual risk this file used to
 * state as "not mitigated further here" — it now is, as far as a client can
 * mitigate it): killing our local process when a deploy call is interrupted
 * — by our own timeout, by a GitHub Actions cancellation, or by the runner
 * itself being hard-killed — cannot undo a request Cloudflare already
 * accepted. We cannot know, from here, whether that deploy will still
 * complete server-side. Automatically releasing the lock in that situation
 * would let a second deploy start while the first might still be live,
 * which is exactly the overlap this whole mechanism exists to prevent.
 *
 * So three outcomes are distinguished, not two:
 *   - CONFIRMED SUCCESS   (the command exited 0, cleanly) — lock may be
 *     released normally.
 *   - CONFIRMED FAILURE   (the command exited non-zero, cleanly, no signal
 *     involved) — wrangler itself completed its request/response cycle and
 *     reported failure. Also safe to release normally.
 *   - AMBIGUOUS           (the command was killed by a signal — our own
 *     timeout, or an external SIGINT/SIGTERM forwarded from a cancelled
 *     workflow run) — NOT safe to release. The lock enters a distinct
 *     `recovery_required` status instead.
 *
 * `recovery_required` is sticky: normal lease expiry does NOT clear it (see
 * isRecoveryRequired / isHeldBy below — a recovering lock is never
 * "available" no matter how long its expiresAt timestamp would otherwise
 * suggest), and a plain `release` call refuses to clear it. The only way out
 * is the `recover` CLI action, which requires an operator to state the
 * confirmed outcome explicitly and — whenever Cloudflare credentials are
 * available — cross-checks that claim against the Worker's own live version
 * history before clearing anything. See RECOVERY.md for the full procedure.
 *
 * This also covers the case where the holder is hard-killed with no chance
 * to run any JS at all (e.g. SIGKILL, spot eviction) and so can never
 * proactively record `recovery_required` itself: `deployTag` is written
 * into the lock state *before* the deploy command is started, and cleared
 * back to null only once a CONFIRMED outcome is reached. If a lease expires
 * while `deployTag` is still set, the next would-be acquirer recognizes
 * that a deploy was in flight when its holder disappeared and treats it as
 * `recovery_required` too, rather than silently reclaiming — a safety net
 * that does not depend on the dying process reacting to anything.
 *
 * Residual risk, stated plainly rather than hidden: this closes the gap for
 * every outcome a *client* can ever observe. It cannot close the gap of
 * Cloudflare's own server-side processing continuing indefinitely with no
 * way for any client, ever, to ask "did that specific request finish" —
 * only the verification step in `recover`/`check-tag` (reading the Worker's
 * actual current version and its `workers/tag` annotation) can answer that,
 * after the fact, once Cloudflare's own state has settled. This is an
 * inherent limit of any coordination built around a third-party API with no
 * native cancellation or idempotency token; it is not specific to choosing
 * git over some other external lock.
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

/** expiresAt value written on a recovery_required state. Not Infinity —
 * JSON.stringify(Infinity) serializes to `null`, which would round-trip
 * back as `null`, not a number, and silently break isExpired's type check.
 * The actual value is never consulted while status is recovery_required
 * (every gating path checks status before expiresAt) — this exists only so
 * the persisted JSON stays self-describing for a human reading lock.json. */
export const RECOVERY_SENTINEL_EXPIRES_AT = Number.MAX_SAFE_INTEGER;

/**
 * @typedef {object} LockState
 * @property {"unlocked"|"held"|"recovery_required"} status
 * @property {string|null} holder - 'release' | 'daily' | null (unlocked).
 * @property {string|null} runId - the holder's unique run identity, or null.
 * @property {number|null} acquiredAt
 * @property {number} expiresAt
 * @property {string|null} deployTag - the "sha:<commit>" tag of the deploy
 *   currently (or ambiguously) in flight; null whenever no deploy attempt is
 *   outstanding, including the whole time between acquiring the lock and
 *   actually starting the wrangler call.
 * @property {{reason: string, holder: (string|null), runId: (string|null), deployTag: (string|null), at: number}|null} recovery
 */

export function isExpired(state, now = Date.now()) {
  return !state || typeof state.expiresAt !== "number" || state.expiresAt <= now;
}

export function isRecoveryRequired(state) {
  return !!state && state.status === "recovery_required";
}

export function isHeldBy(state, runId, now = Date.now()) {
  return !!state && !isRecoveryRequired(state) && !isExpired(state, now) && state.runId === runId;
}

/** Pure comparison the `recover`/`check-tag` CLI actions use to turn a live
 * Cloudflare read into a verdict. Separated out from the shelling-out code
 * so this one piece of actual logic is unit-testable without wrangler or
 * credentials. */
export function describeRecoveryVerdict(liveActiveTag, expectedTag) {
  return liveActiveTag === expectedTag ? "success" : "failure";
}

function buildRecoveryState(state, reason, deployTag, now) {
  const tag = deployTag ?? state?.deployTag ?? null;
  return {
    status: "recovery_required",
    holder: state?.holder ?? null,
    runId: state?.runId ?? null,
    acquiredAt: state?.acquiredAt ?? null,
    expiresAt: RECOVERY_SENTINEL_EXPIRES_AT,
    deployTag: tag,
    recovery: { reason, holder: state?.holder ?? null, runId: state?.runId ?? null, deployTag: tag, at: now() },
  };
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

    if (isRecoveryRequired(state)) {
      if (now() >= deadline) {
        return {
          ok: false,
          reason: `timed out: lock is in recovery_required state (reason: ${state.recovery?.reason ?? "unknown"}) — manual recovery is needed before any deploy can proceed. See RECOVERY.md.`,
        };
      }
      await sleep(retryDelayMs);
      continue;
    }

    if (!isExpired(state, now())) {
      if (now() >= deadline) {
        return { ok: false, reason: `timed out waiting for lock held by "${state.holder}"` };
      }
      await sleep(retryDelayMs);
      continue;
    }

    // Lease has expired (or the branch never existed) — normally safe to
    // reclaim. EXCEPT: if a deploy was recorded as having started
    // (deployTag set) and this state never reached a confirmed outcome
    // before its lease ran out, the previous holder almost certainly did
    // not get a chance to react at all (a graceful timeout/cancellation
    // would have already written recovery_required itself, well before the
    // full lease elapsed) — e.g. SIGKILL, a crashed/evicted runner. There is
    // no way to know whether Cloudflare finished that deploy. Reclaiming
    // here would be exactly the silent overlap this mechanism exists to
    // prevent, so this flags it instead of reclaiming it.
    if (state && state.deployTag) {
      const result = git.write(sha, buildRecoveryState(state, "expired_with_in_flight_deploy", state.deployTag, now));
      if (!result.ok) {
        // Someone else (another acquirer noticing the same thing, or a
        // legitimate late release) already moved the branch — re-read.
      }
      if (now() >= deadline) {
        return {
          ok: false,
          reason: "timed out: an abandoned in-flight deploy was found and flagged recovery_required — manual recovery is needed. See RECOVERY.md.",
        };
      }
      await sleep(retryDelayMs);
      continue;
    }

    const nextState = { status: "held", holder, runId, acquiredAt: now(), expiresAt: now() + leaseMs, deployTag: null, recovery: null };
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
 * immediately after the deploy command. False for a recovery_required lock
 * even if its runId matches — "ownership" during recovery means nothing is
 * safe to do automatically.
 * @param {{read: () => {sha: string|null, state: LockState|null}}} git
 * @param {string} runId
 * @param {() => number} [now]
 */
export function verifyOwnership(git, runId, now = Date.now) {
  const { state } = git.read();
  return isHeldBy(state, runId, now());
}

/**
 * Records that this run (still holding the lock) is about to start — or has
 * just finished — the actual deploy command, by writing deployTag into the
 * held state. Called with the real tag right before invoking wrangler, and
 * with null right after a CONFIRMED outcome (success or confirmed failure)
 * — never after an ambiguous one, where markRecoveryRequired takes over
 * instead. This is what lets the NEXT acquirer tell, from the persisted
 * state alone, whether a deploy was genuinely in flight when a lease
 * expired, without needing the dying process to have reacted to anything.
 * @param {{read: () => {sha: string|null, state: LockState|null}, write: (baseSha: string|null, nextState: LockState) => {ok: boolean}}} git
 * @param {string} runId
 * @param {string|null} deployTag
 * @param {() => number} [now]
 */
export function setDeployTag(git, runId, deployTag, now = Date.now) {
  const { sha, state } = git.read();
  if (!isHeldBy(state, runId, now())) {
    return { ok: false, reason: "ownership check failed while updating deployTag" };
  }
  const result = git.write(sha, { ...state, deployTag });
  return result;
}

/**
 * Transitions the lock into recovery_required after an AMBIGUOUS outcome —
 * the proactive path, used by a holder that is still alive to react (our
 * own timeout kill, or a forwarded SIGINT/SIGTERM). Deliberately does not
 * require isHeldBy (i.e. does not require the lease to still be unexpired):
 * this can legitimately race with the lease's own natural expiry, and must
 * still win often enough to matter — if it loses the compare-and-swap to a
 * concurrent acquirer, that acquirer's own deployTag-aware reclaim check
 * (see acquireLock) produces the same recovery_required outcome anyway, so
 * either way the lock ends up correctly flagged.
 * @param {{read: () => {sha: string|null, state: LockState|null}, write: (baseSha: string|null, nextState: LockState) => {ok: boolean}}} git
 * @param {string} runId
 * @param {string|null} deployTag
 * @param {string} reason - 'timeout' | 'cancelled'
 * @param {() => number} [now]
 */
export function markRecoveryRequired(git, runId, deployTag, reason, now = Date.now) {
  const { sha, state } = git.read();
  if (!state || state.runId !== runId) {
    return { ok: false, reason: "lock state no longer belongs to this run; cannot record recovery_required" };
  }
  const result = git.write(sha, buildRecoveryState(state, reason, deployTag, now));
  return result;
}

/**
 * Releases the lock ONLY if currently held by runId — never clears a lock
 * acquired by someone else (e.g. after our own lease already expired and
 * was reclaimed), and never clears a recovery_required lock, regardless of
 * runId — that is the entire point of the status. Returns ok:true if free
 * afterwards either way (already not ours, or deliberately left alone, is
 * not an error to attempt a release against).
 * @param {{read: () => {sha: string|null, state: LockState|null}, write: (baseSha: string|null, nextState: LockState) => {ok: boolean}}} git
 * @param {string} runId
 * @param {() => number} [now]
 */
export function releaseLock(git, runId, now = Date.now) {
  const { sha, state } = git.read();
  if (isRecoveryRequired(state)) {
    return { ok: true, releasedByUs: false, recoveryRequired: true };
  }
  if (!isHeldBy(state, runId, now())) {
    return { ok: true, releasedByUs: false };
  }
  const result = git.write(sha, { status: "unlocked", holder: null, runId: null, acquiredAt: null, expiresAt: 0, deployTag: null, recovery: null });
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

/** A confirmed, non-ambiguous failure: the command ran to completion and
 * told us, cleanly, that it failed. Safe to release the lock normally. */
export class ConfirmedDeployFailureError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfirmedDeployFailureError";
  }
}

/** The command was killed (our own timeout, or an external signal) before
 * it could tell us anything. Cloudflare may already have accepted the
 * deploy request. NOT safe to release the lock normally. */
export class AmbiguousDeployOutcomeError extends Error {
  constructor(message, reason) {
    super(message);
    this.name = "AmbiguousDeployOutcomeError";
    /** @type {"timeout"|"cancelled"} */
    this.reason = reason;
  }
}

/**
 * Runs the actual deploy command under a hard, killing timeout, and
 * classifies the outcome into exactly one of: resolve (confirmed success),
 * ConfirmedDeployFailureError (confirmed failure), or
 * AmbiguousDeployOutcomeError (killed by our timeout, or by an externally
 * forwarded signal — e.g. a GitHub Actions run cancellation).
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
 * and on timeout — or on external abort — send the kill signal to the
 * whole group via the negative PID (`process.kill(-pid, signal)`), a
 * POSIX-only mechanism — fine here, every workflow using this runs on
 * `ubuntu-latest`.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {object} [opts]
 * @param {number} [opts.deployTimeoutMs]
 * @param {AbortSignal} [opts.abortSignal] - external cancellation (e.g. the
 *   CLI's own SIGINT/SIGTERM handler). Aborting kills the child's whole
 *   process group and rejects with AmbiguousDeployOutcomeError, reason
 *   "cancelled" — distinct from our own timeout, reason "timeout".
 */
export function runDeployCommand(command, args, { deployTimeoutMs = DEFAULT_DEPLOY_TIMEOUT_MS, abortSignal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", detached: true });
    let timedOut = false;
    let cancelled = false;

    function killGroup(signal) {
      try {
        process.kill(-child.pid, signal);
      } catch {
        // Group already gone — nothing left to kill.
      }
    }

    const timer = setTimeout(() => {
      timedOut = true;
      killGroup("SIGKILL");
    }, deployTimeoutMs);

    function onAbort() {
      cancelled = true;
      killGroup("SIGKILL");
    }
    abortSignal?.addEventListener("abort", onAbort);

    function cleanup() {
      clearTimeout(timer);
      abortSignal?.removeEventListener("abort", onAbort);
    }

    child.on("error", (err) => {
      cleanup();
      reject(err);
    });
    child.on("exit", (code, signal) => {
      cleanup();
      if (timedOut) {
        reject(
          new AmbiguousDeployOutcomeError(
            `command timed out after ${deployTimeoutMs}ms and was killed (signal: ${signal}) — Cloudflare may already have accepted the deploy request before the kill. Outcome is AMBIGUOUS, not a confirmed failure.`,
            "timeout"
          )
        );
      } else if (cancelled || signal) {
        reject(
          new AmbiguousDeployOutcomeError(
            `command was terminated by signal ${signal ?? "unknown"} before it completed${cancelled ? " (external cancellation)" : ""} — outcome is AMBIGUOUS, not a confirmed failure.`,
            "cancelled"
          )
        );
      } else if (code !== 0) {
        reject(
          new ConfirmedDeployFailureError(
            `command exited with code ${code} — it completed its own request/response cycle and reported failure. This is a CONFIRMED failure.`
          )
        );
      } else {
        resolve();
      }
    });
  });
}

/**
 * Reads the Worker's own live deployment/version state from Cloudflare and
 * returns the tag (if any) of whichever version currently has 100% of
 * traffic. Read-only — lists existing deployments/versions, no mutation.
 * Used by `check-tag` (ad-hoc inspection) and `recover` (verification gate).
 * @param {string} configPath
 */
export function inspectLiveDeploymentTag(configPath) {
  const deployments = JSON.parse(
    execFileSync("npx", ["wrangler", "deployments", "list", "--config", configPath, "--json"], { encoding: "utf8" })
  );
  if (!Array.isArray(deployments) || deployments.length === 0) {
    return { activeVersionId: null, activeTag: null };
  }
  const latest = deployments[deployments.length - 1];
  const activeVersion = (latest.versions || []).find((v) => v.percentage === 100) ?? latest.versions?.[0] ?? null;
  const activeVersionId = activeVersion?.version_id ?? null;
  if (!activeVersionId) {
    return { activeVersionId: null, activeTag: null };
  }
  const versions = JSON.parse(
    execFileSync("npx", ["wrangler", "versions", "list", "--config", configPath, "--json"], { encoding: "utf8" })
  );
  const versionEntry = (versions || []).find((v) => v.id === activeVersionId);
  const activeTag = versionEntry?.annotations?.["workers/tag"] ?? null;
  return { activeVersionId, activeTag };
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
        ["commit-tree", treeSha, ...parentArgs, "-m", `deploy-lock: ${nextState.status} (${nextState.holder ?? "none"})`],
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
      const refSpec = `${commitSha}:refs/heads/${LOCK_BRANCH}`;
      try {
        if (baseSha) {
          // Fast-forward only: fails if the remote moved since our read.
          git(["push", "origin", refSpec]);
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
//   deploy <runId> <deployTimeoutMs> <deployTag> -- <command> [args...]
//     Runs <command> under runDeployCommand's hard timeout. This is the
//     enforcement half of the lease-safety argument: the lease only has to
//     outlive THIS bounded, killable call, not an unbounded wrangler
//     invocation. On a CONFIRMED outcome, behaves as before. On an AMBIGUOUS
//     outcome, transitions the lock to recovery_required instead of leaving
//     it for a plain `release` to (unsafely) clear.
//   check-tag <configPath> <expectedTag>
//     Read-only: reports whether expectedTag is the Worker's currently
//     active version's tag.
//   recover <deployTag> <success|failure> [--force] [--config <path>]
//     Operator-only. Clears a recovery_required lock after requiring the
//     stated outcome to either match a live Cloudflare check, or be
//     explicitly forced.
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
    if (result.recoveryRequired) {
      console.log("Lock is in recovery_required state — NOT released. Manual recovery is needed (see RECOVERY.md) before any deploy can proceed.");
    } else if (!result.releasedByUs) {
      console.log("Lock was not held by this run at release time (already lost or never held) — nothing to release.");
    } else {
      console.log("Lock released.");
    }
    process.exit(result.ok ? 0 : 1);
  } else if (action === "deploy") {
    const [, runId, deployTimeoutMsStr, deployTag, sep, ...command] = args;
    if (!deployTag || sep !== "--" || command.length === 0) {
      console.error("usage: productionDeployLock.mjs deploy <runId> <deployTimeoutMs> <deployTag> -- <command> [args...]");
      process.exit(2);
    }
    const deployTimeoutMs = Number(deployTimeoutMsStr);
    assertSafeDeadline(deployTimeoutMs, DEFAULT_LEASE_MS);

    if (!verifyOwnership(gitIface, runId)) {
      console.error(`::error::Lock ownership verification failed for run ${runId} immediately before deploy — refusing to deploy.`);
      process.exit(1);
    }

    const markStart = setDeployTag(gitIface, runId, deployTag);
    if (!markStart.ok) {
      console.error(
        `::error::Could not record the deploy tag before starting (${markStart.reason ?? "write rejected"}) — ownership may have been lost. Refusing to deploy.`
      );
      process.exit(1);
    }

    const abortController = new AbortController();
    const onSignal = (sig) => {
      console.error(`::warning::Received ${sig} — forwarding termination to the deploy command. Outcome will be treated as AMBIGUOUS, not a confirmed failure.`);
      abortController.abort();
    };
    process.once("SIGINT", () => onSignal("SIGINT"));
    process.once("SIGTERM", () => onSignal("SIGTERM"));

    try {
      await runDeployCommand(command[0], command.slice(1), { deployTimeoutMs, abortSignal: abortController.signal });
    } catch (err) {
      if (err instanceof AmbiguousDeployOutcomeError) {
        console.error(`::error::${err.message}`);
        const result = markRecoveryRequired(gitIface, runId, deployTag, err.reason);
        if (!result.ok) {
          console.error(
            "::error::Additionally failed to record recovery_required state — lock ownership may already have changed. Check lock state manually before any further deploy attempt."
          );
        } else {
          console.error(
            `::error::Production deploy lock is now RECOVERY_REQUIRED (reason: ${err.reason}, tag: ${deployTag}). No automated deploy will proceed until an operator runs the documented recovery procedure — see RECOVERY.md.`
          );
        }
        process.exit(1);
      }
      // ConfirmedDeployFailureError, or the child process failed to even
      // spawn: a clean, confirmed failure — nothing was ambiguous about it.
      // Safe to let the subsequent `release` step clear the lock normally.
      console.error(`::error::Deploy command failed (confirmed, not ambiguous): ${err?.message ?? err}`);
      process.exit(1);
    } finally {
      process.removeAllListeners("SIGINT");
      process.removeAllListeners("SIGTERM");
    }

    // Confirmed success: clear deployTag now, so the upcoming `release`
    // step closes out a fully clean state. This is what keeps the
    // reclaim-time "expired_with_in_flight_deploy" safety net from firing
    // needlessly on routine completions — it exists for crashes, not this
    // path.
    setDeployTag(gitIface, runId, null);

    if (!verifyOwnership(gitIface, runId)) {
      console.error(
        "::error::Lock ownership verification failed immediately AFTER deploy — the deploy already ran and cannot be undone, but the mutual-exclusion guarantee may have been violated during it. Verify production state manually."
      );
      process.exit(1);
    }
    console.log("Deploy completed successfully (confirmed) with lock ownership verified before and after.");
    process.exit(0);
  } else if (action === "check-tag") {
    const [, configPath, expectedTag] = args;
    if (!configPath || !expectedTag) {
      console.error("usage: productionDeployLock.mjs check-tag <configPath> <expectedTag>");
      process.exit(2);
    }
    const { activeVersionId, activeTag } = inspectLiveDeploymentTag(configPath);
    const verdict = describeRecoveryVerdict(activeTag, expectedTag);
    console.log(`Live active production version: ${activeVersionId ?? "none"} (tag: ${activeTag ?? "none"})`);
    console.log(`Expected tag: ${expectedTag}`);
    console.log(
      verdict === "success"
        ? "CONFIRMED: the expected tag IS the currently active production deployment."
        : "NOT ACTIVE: the expected tag is NOT the currently active production deployment."
    );
    process.exit(0);
  } else if (action === "recover") {
    const [, deployTagArg, confirmArg, ...rest] = args;
    const force = rest.includes("--force");
    const configIdx = rest.indexOf("--config");
    const configPath = configIdx !== -1 ? rest[configIdx + 1] : "wrangler.production.jsonc";
    if (!deployTagArg || !["success", "failure"].includes(confirmArg)) {
      console.error("usage: productionDeployLock.mjs recover <deployTag> <success|failure> [--force] [--config <path>]");
      process.exit(2);
    }

    const { sha, state } = gitIface.read();
    if (!isRecoveryRequired(state)) {
      console.log("Lock is not in recovery_required state — nothing to recover.");
      process.exit(0);
    }
    if (state.recovery?.deployTag !== deployTagArg) {
      console.error(
        `::error::Tag mismatch: the lock is flagged for recovery of "${state.recovery?.deployTag}", but "${deployTagArg}" was given. Refusing — this looks like the wrong incident.`
      );
      process.exit(1);
    }

    let liveVerdict = null;
    if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) {
      try {
        const { activeVersionId, activeTag } = inspectLiveDeploymentTag(configPath);
        liveVerdict = describeRecoveryVerdict(activeTag, deployTagArg);
        console.log(`Live check: active version ${activeVersionId ?? "none"}, tag ${activeTag ?? "none"} -> verdict: ${liveVerdict}`);
      } catch (err) {
        console.error(`::warning::Could not perform live Cloudflare verification: ${err?.message ?? err}`);
      }
    } else {
      console.error("::warning::CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID not set in this shell — skipping live verification.");
    }

    if (liveVerdict && liveVerdict !== confirmArg && !force) {
      console.error(
        `::error::Live Cloudflare check says "${liveVerdict}" but you confirmed "${confirmArg}". Refusing to recover — re-check, or pass --force if you are certain the live check is misleading.`
      );
      process.exit(1);
    }
    if (!liveVerdict && !force) {
      console.error(
        "::error::No live verification was possible and --force was not given. Refusing to recover blind — run `check-tag` yourself first, or pass --force once you've verified independently."
      );
      process.exit(1);
    }

    const clearedState = { status: "unlocked", holder: null, runId: null, acquiredAt: null, expiresAt: 0, deployTag: null, recovery: null };
    const result = gitIface.write(sha, clearedState);
    if (!result.ok) {
      console.error("::error::Recovery write was rejected (lock state changed concurrently) — re-run `recover` to retry against the current state.");
      process.exit(1);
    }
    console.log(`Recovery complete: lock cleared, confirmed outcome was "${confirmArg}".`);
    process.exit(0);
  } else {
    console.error("usage: productionDeployLock.mjs <acquire|release|verify|deploy|check-tag|recover> ...");
    process.exit(2);
  }
}

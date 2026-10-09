import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  AmbiguousDeployOutcomeError,
  ConfirmedDeployFailureError,
  MIN_RECOVERY_SETTLE_MS,
  acquireLock,
  assertSafeDeadline,
  describeRecoveryVerdict,
  isExpired,
  isHeldBy,
  isRecoveryRequired,
  markRecoveryRequired,
  releaseLock,
  runDeployCommand,
  setDeployTag,
  verifyOwnership,
} from "../scripts/deploy/productionDeployLock.mjs";

interface LockState {
  status: "unlocked" | "held" | "recovery_required";
  holder: string | null;
  runId: string | null;
  acquiredAt: number | null;
  expiresAt: number;
  deployTag: string | null;
  recovery: { reason: string; holder: string | null; runId: string | null; deployTag: string | null; at: number } | null;
}
interface RemoteState {
  sha: string | null;
  state: LockState | null;
}

/** In-memory fake of acquireLock's expected result shape — narrows the
 * union so tests can assert on `.state` after checking `.ok`. */
function expectAcquired(result: { ok: boolean; state?: { status: string; holder: string | null; runId: string | null }; reason?: string }): LockState {
  expect(result.ok).toBe(true);
  expect(result.state).toBeDefined();
  return result.state as unknown as LockState;
}

/** An in-memory fake of the git branch: a single (sha, state) pair, with a
 * real compare-and-swap (write only succeeds if baseSha matches current
 * sha) so these tests exercise the same race semantics a real git push
 * would — not just the happy path. */
function fakeRemote(initial: RemoteState = { sha: null, state: null }) {
  let current: RemoteState = { ...initial };
  let shaCounter = 0;
  return {
    read: (): RemoteState => ({ ...current }),
    write: (baseSha: string | null, nextState: LockState) => {
      if (baseSha !== current.sha) return { ok: false };
      shaCounter += 1;
      current = { sha: `sha-${shaCounter}`, state: nextState };
      return { ok: true };
    },
    _peek: () => current,
  };
}

const NOW = 1_000_000;
const fixedNow = () => NOW;
const noSleep = () => Promise.resolve();

describe("isExpired / isHeldBy / isRecoveryRequired", () => {
  it("treats a null state as expired", () => {
    expect(isExpired(null, NOW)).toBe(true);
  });
  it("treats a past expiresAt as expired", () => {
    expect(isExpired({ expiresAt: NOW - 1 }, NOW)).toBe(true);
  });
  it("treats a future expiresAt as not expired", () => {
    expect(isExpired({ expiresAt: NOW + 1 }, NOW)).toBe(false);
  });
  it("isHeldBy is false for an expired lock even with a matching runId", () => {
    expect(isHeldBy({ holder: "daily", runId: "daily-run-1", expiresAt: NOW - 1 }, "daily-run-1", NOW)).toBe(false);
  });
  it("isHeldBy is true only for the exact matching, unexpired runId — not the role name", () => {
    expect(isHeldBy({ holder: "daily", runId: "daily-run-1", expiresAt: NOW + 1 }, "daily-run-1", NOW)).toBe(true);
    expect(isHeldBy({ holder: "daily", runId: "daily-run-1", expiresAt: NOW + 1 }, "release-run-2", NOW)).toBe(false);
    // The role string itself ("daily") must never be mistaken for a runId.
    expect(isHeldBy({ holder: "daily", runId: "daily-run-1", expiresAt: NOW + 1 }, "daily", NOW)).toBe(false);
  });
  it("isRecoveryRequired is true only for status === recovery_required", () => {
    expect(isRecoveryRequired(null)).toBe(false);
    expect(isRecoveryRequired({ status: "held" })).toBe(false);
    expect(isRecoveryRequired({ status: "recovery_required" })).toBe(true);
  });
  it("isHeldBy is false for a recovery_required lock even with a matching runId and a future expiresAt", () => {
    // This is the core "sticky" property: recovery_required must never look
    // like a normal, usable "held" lock to anyone checking ownership.
    expect(
      isHeldBy(
        { status: "recovery_required", holder: "daily", runId: "daily-run-1", expiresAt: Number.MAX_SAFE_INTEGER },
        "daily-run-1",
        NOW
      )
    ).toBe(false);
  });
});

describe("assertSafeDeadline", () => {
  it("throws if the deploy timeout is not strictly less than the lease", () => {
    expect(() => assertSafeDeadline(300_000, 300_000)).toThrow();
    expect(() => assertSafeDeadline(300_001, 300_000)).toThrow();
  });
  it("passes when the deploy timeout is comfortably under the lease", () => {
    expect(() => assertSafeDeadline(120_000, 300_000)).not.toThrow();
  });
});

describe("describeRecoveryVerdict", () => {
  it("is success when the tagged version is the active one — immediate, no time gating needed", () => {
    expect(describeRecoveryVerdict({ taggedVersionExists: true, taggedVersionIsActive: true }, 0)).toBe("success");
    // Even with zero elapsed time, a positive observation is final.
  });

  it("is INCONCLUSIVE — not failure — when the tag was uploaded but is not currently active, no matter how long has elapsed", () => {
    // This is the exact mistake requirement #3 of the final review flagged:
    // 'not active' must never be treated as 'failed'. An uploaded version
    // could still be activated later.
    expect(describeRecoveryVerdict({ taggedVersionExists: true, taggedVersionIsActive: false }, 0)).toBe("inconclusive");
    expect(describeRecoveryVerdict({ taggedVersionExists: true, taggedVersionIsActive: false }, MIN_RECOVERY_SETTLE_MS * 10)).toBe(
      "inconclusive"
    );
  });

  it("is too_soon when the tag doesn't exist yet but not enough time has passed to trust that absence", () => {
    expect(describeRecoveryVerdict({ taggedVersionExists: false, taggedVersionIsActive: false }, 0)).toBe("too_soon");
    expect(describeRecoveryVerdict({ taggedVersionExists: false, taggedVersionIsActive: false }, MIN_RECOVERY_SETTLE_MS - 1)).toBe(
      "too_soon"
    );
  });

  it("is failure only once the tag doesn't exist AND enough settling time has passed", () => {
    expect(describeRecoveryVerdict({ taggedVersionExists: false, taggedVersionIsActive: false }, MIN_RECOVERY_SETTLE_MS)).toBe(
      "failure"
    );
    expect(describeRecoveryVerdict({ taggedVersionExists: false, taggedVersionIsActive: false }, MIN_RECOVERY_SETTLE_MS * 100)).toBe(
      "failure"
    );
  });
});

describe("acquireLock — basic cases", () => {
  it("acquires immediately when the branch doesn't exist yet (bootstrap)", async () => {
    const remote = fakeRemote();
    const result = await acquireLock(remote, "run-1", "daily", { now: fixedNow, sleep: noSleep });
    const state = expectAcquired(result);
    expect(state.holder).toBe("daily");
    expect(state.runId).toBe("run-1");
    expect(state.status).toBe("held");
    expect(state.deployTag).toBeNull();
  });

  it("reclaims an expired lock left by a crashed/cancelled run that never started a deploy", async () => {
    const remote = fakeRemote({
      sha: "sha-stale",
      state: { status: "held", holder: "release", runId: "crashed-run", acquiredAt: NOW - 999_000, expiresAt: NOW - 1, deployTag: null, recovery: null },
    });
    const result = await acquireLock(remote, "run-2", "daily", { now: fixedNow, sleep: noSleep });
    const state = expectAcquired(result);
    expect(state.runId).toBe("run-2");
  });

  it("waits and times out if the lock is genuinely held and never freed", async () => {
    const remote = fakeRemote({
      sha: "sha-1",
      state: { status: "held", holder: "release", runId: "still-running", acquiredAt: NOW, expiresAt: NOW + 10_000, deployTag: null, recovery: null },
    });
    let t = NOW;
    const result = await acquireLock(remote, "run-2", "daily", {
      now: () => t,
      sleep: (ms) => {
        t += ms;
        return Promise.resolve();
      },
      timeoutMs: 5_000,
      retryDelayMs: 1_000,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/held by "release"/);
  });

  it("does NOT reclaim an expired lock whose deployTag is still set — flips to recovery_required instead (the crash/SIGKILL safety net)", async () => {
    const remote = fakeRemote({
      sha: "sha-abandoned",
      state: {
        status: "held",
        holder: "release",
        runId: "hard-killed-run",
        acquiredAt: NOW - 999_000,
        expiresAt: NOW - 1,
        deployTag: "sha:abandoned-deploy",
        recovery: null,
      },
    });
    let t = NOW;
    const result = await acquireLock(remote, "run-2", "daily", {
      now: () => t,
      sleep: (ms) => {
        t += ms;
        return Promise.resolve();
      },
      timeoutMs: 3_000,
      retryDelayMs: 1_000,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/recovery_required/);

    const { state } = remote.read();
    expect(state?.status).toBe("recovery_required");
    expect(state?.deployTag).toBe("sha:abandoned-deploy");
    expect(state?.recovery?.reason).toBe("expired_with_in_flight_deploy");
    // The lock must NOT have been silently handed to run-2.
    expect(state?.runId).not.toBe("run-2");
  });

  it("blocks immediately on a recovery_required lock, regardless of how far in the future expiresAt claims to be", async () => {
    const remote = fakeRemote({
      sha: "sha-recovering",
      state: {
        status: "recovery_required",
        holder: "daily",
        runId: "ambiguous-run",
        acquiredAt: NOW - 1000,
        expiresAt: Number.MAX_SAFE_INTEGER,
        deployTag: "sha:ambiguous",
        recovery: { reason: "timeout", holder: "daily", runId: "ambiguous-run", deployTag: "sha:ambiguous", at: NOW },
      },
    });
    const result = await acquireLock(remote, "run-3", "release", { now: fixedNow, sleep: noSleep, timeoutMs: 0 });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/recovery_required/);
  });
});

describe("acquireLock — both deployment orderings under real contention", () => {
  it("release-acquires-first: daily waits, then acquires only after release's lock expires/releases", async () => {
    const remote = fakeRemote();
    // Simulate: release wins the first race.
    const releaseResult = await acquireLock(remote, "release-run", "release", { now: fixedNow, sleep: noSleep });
    expect(releaseResult.ok).toBe(true);

    // Daily tries while release still holds it — must not succeed instantly.
    let t = NOW;
    const dailyAttempt = acquireLock(remote, "daily-run", "daily", {
      now: () => t,
      sleep: async (ms) => {
        t += ms;
        // Release finishes and releases partway through daily's wait.
        if (t >= NOW + 2_000) {
          releaseLock(remote, "release-run", () => t);
        }
      },
      timeoutMs: 20_000,
      retryDelayMs: 1_000,
    });
    const dailyResult = await dailyAttempt;
    const state = expectAcquired(dailyResult);
    expect(state.runId).toBe("daily-run");
  });

  it("daily-acquires-first: release waits for daily to finish, then proceeds normally", async () => {
    const remote = fakeRemote();
    const dailyResult = await acquireLock(remote, "daily-run", "daily", { now: fixedNow, sleep: noSleep });
    expect(dailyResult.ok).toBe(true);

    let t = NOW;
    const releaseAttempt = acquireLock(remote, "release-run", "release", {
      now: () => t,
      sleep: async (ms) => {
        t += ms;
        if (t >= NOW + 3_000) {
          releaseLock(remote, "daily-run", () => t);
        }
      },
      timeoutMs: 20_000,
      retryDelayMs: 1_000,
    });
    const releaseResult = await releaseAttempt;
    const state = expectAcquired(releaseResult);
    expect(state.runId).toBe("release-run");
  });

  it("concurrent acquisition: only one of two simultaneous attempts wins the compare-and-swap", async () => {
    const remote = fakeRemote();
    // Both read the same (empty) state "simultaneously" before either writes —
    // simulate by calling write() directly with the same baseSha for both.
    const { sha } = remote.read();
    const a = remote.write(sha, { status: "held", holder: "daily", runId: "a", acquiredAt: NOW, expiresAt: NOW + 1000, deployTag: null, recovery: null });
    const b = remote.write(sha, { status: "held", holder: "release", runId: "b", acquiredAt: NOW, expiresAt: NOW + 1000, deployTag: null, recovery: null });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false); // lost the CAS — this is the mechanism, not a coincidence
    expect(remote._peek().state?.runId).toBe("a");
  });
});

describe("verifyOwnership", () => {
  it("is true immediately after acquiring", async () => {
    const remote = fakeRemote();
    const result = await acquireLock(remote, "run-1", "daily", { now: fixedNow, sleep: noSleep });
    expect(result.ok).toBe(true);
    expect(verifyOwnership(remote, "run-1", fixedNow)).toBe(true);
  });

  it("is false once the lease has expired, even for the original holder (ownership loss)", async () => {
    const remote = fakeRemote();
    await acquireLock(remote, "run-1", "daily", { now: () => NOW, sleep: noSleep, leaseMs: 1000 });
    expect(verifyOwnership(remote, "run-1", () => NOW + 2000)).toBe(false);
  });

  it("is false once someone else has reclaimed the lock out from under the original holder", async () => {
    const remote = fakeRemote();
    await acquireLock(remote, "run-1", "daily", { now: () => NOW, sleep: noSleep, leaseMs: 1000 });
    // Lease expires, a second run reclaims it.
    await acquireLock(remote, "run-2", "release", { now: () => NOW + 2000, sleep: noSleep });
    expect(verifyOwnership(remote, "run-1", () => NOW + 2500)).toBe(false);
    expect(verifyOwnership(remote, "run-2", () => NOW + 2500)).toBe(true);
  });

  it("is false while the lock is recovery_required, even for the runId that caused it", async () => {
    const remote = fakeRemote();
    await acquireLock(remote, "run-1", "daily", { now: fixedNow, sleep: noSleep });
    markRecoveryRequired(remote, "run-1", "sha:ambiguous", "timeout", fixedNow);
    expect(verifyOwnership(remote, "run-1", fixedNow)).toBe(false);
  });
});

describe("setDeployTag", () => {
  it("writes the tag onto a currently-held lock", async () => {
    const remote = fakeRemote();
    await acquireLock(remote, "run-1", "daily", { now: fixedNow, sleep: noSleep });
    const result = setDeployTag(remote, "run-1", "sha:abc", fixedNow);
    expect(result.ok).toBe(true);
    expect(remote.read().state?.deployTag).toBe("sha:abc");
  });

  it("clears the tag back to null (the post-success cleanup path)", async () => {
    const remote = fakeRemote();
    await acquireLock(remote, "run-1", "daily", { now: fixedNow, sleep: noSleep });
    setDeployTag(remote, "run-1", "sha:abc", fixedNow);
    setDeployTag(remote, "run-1", null, fixedNow);
    expect(remote.read().state?.deployTag).toBeNull();
  });

  it("refuses to write if this run no longer owns the lock", async () => {
    const remote = fakeRemote();
    await acquireLock(remote, "run-1", "daily", { now: () => NOW, sleep: noSleep, leaseMs: 1000 });
    const result = setDeployTag(remote, "run-1", "sha:abc", () => NOW + 2000);
    expect(result.ok).toBe(false);
  });
});

describe("markRecoveryRequired", () => {
  it("transitions a held lock to recovery_required, preserving holder/runId/deployTag", async () => {
    const remote = fakeRemote();
    await acquireLock(remote, "run-1", "daily", { now: fixedNow, sleep: noSleep });
    setDeployTag(remote, "run-1", "sha:abc", fixedNow);
    const result = markRecoveryRequired(remote, "run-1", "sha:abc", "cancelled", fixedNow);
    expect(result.ok).toBe(true);
    const { state } = remote.read();
    expect(state?.status).toBe("recovery_required");
    expect(state?.holder).toBe("daily");
    expect(state?.runId).toBe("run-1");
    expect(state?.deployTag).toBe("sha:abc");
    expect(state?.recovery).toEqual({ reason: "cancelled", holder: "daily", runId: "run-1", deployTag: "sha:abc", at: NOW });
  });

  it("refuses if the lock state no longer belongs to this run at all", () => {
    const remote = fakeRemote({ sha: "sha-1", state: { status: "held", holder: "release", runId: "someone-else", acquiredAt: NOW, expiresAt: NOW + 1000, deployTag: "sha:x", recovery: null } });
    const result = markRecoveryRequired(remote, "run-1", "sha:abc", "timeout", fixedNow);
    expect(result.ok).toBe(false);
  });

  it("does not require the lease to still be unexpired — it can race the lease's own expiry and still win", async () => {
    const remote = fakeRemote();
    await acquireLock(remote, "run-1", "daily", { now: () => NOW, sleep: noSleep, leaseMs: 1000 });
    setDeployTag(remote, "run-1", "sha:abc", () => NOW);
    // Lease has now expired from run-1's perspective, but no one else has
    // acted on it yet — markRecoveryRequired must still succeed.
    const result = markRecoveryRequired(remote, "run-1", "sha:abc", "timeout", () => NOW + 5000);
    expect(result.ok).toBe(true);
    expect(remote.read().state?.status).toBe("recovery_required");
  });
});

describe("releaseLock", () => {
  it("releases a lock this run holds", async () => {
    const remote = fakeRemote();
    await acquireLock(remote, "run-1", "daily", { now: fixedNow, sleep: noSleep });
    const result = releaseLock(remote, "run-1", fixedNow);
    expect(result).toEqual({ ok: true, releasedByUs: true });
    expect(isExpired(remote.read().state, NOW)).toBe(true);
  });

  it("never releases a lock held by someone else — safe no-op, not an error", async () => {
    const remote = fakeRemote();
    await acquireLock(remote, "owner-run", "release", { now: fixedNow, sleep: noSleep });
    const result = releaseLock(remote, "imposter-run", fixedNow);
    expect(result).toEqual({ ok: true, releasedByUs: false });
    // The real owner's lock is untouched.
    expect(isHeldBy(remote.read().state, "owner-run", NOW)).toBe(true);
  });

  it("is a safe no-op if this run's own lease already expired and nothing reclaimed it yet", async () => {
    const remote = fakeRemote();
    await acquireLock(remote, "run-1", "daily", { now: () => NOW, sleep: noSleep, leaseMs: 1000 });
    const result = releaseLock(remote, "run-1", () => NOW + 5000);
    expect(result.releasedByUs).toBe(false);
  });

  it("refuses to clear a recovery_required lock — even for the exact runId that caused it", async () => {
    const remote = fakeRemote();
    await acquireLock(remote, "run-1", "daily", { now: fixedNow, sleep: noSleep });
    markRecoveryRequired(remote, "run-1", "sha:abc", "timeout", fixedNow);
    const result = releaseLock(remote, "run-1", fixedNow);
    expect(result).toEqual({ ok: true, releasedByUs: false, recoveryRequired: true });
    expect(remote.read().state?.status).toBe("recovery_required");
  });
});

describe("runDeployCommand — the actual prevention mechanism, not just a documented intent", () => {
  it("kills a command that runs longer than deployTimeoutMs, and classifies it as AMBIGUOUS (not confirmed failure)", async () => {
    const start = Date.now();
    await expect(runDeployCommand("sleep", ["10"], { deployTimeoutMs: 1000 })).rejects.toMatchObject({
      name: "AmbiguousDeployOutcomeError",
      reason: "timeout",
    });
    const elapsed = Date.now() - start;
    // Generous upper bound — this must be killed promptly, nowhere near the
    // full 10s sleep duration. If this ever regresses to "waits it out",
    // the whole lease-safety argument in this file's header comment is false.
    expect(elapsed).toBeLessThan(5000);
  }, 10_000);

  it("does not throw for a command that finishes comfortably within the timeout", async () => {
    await expect(runDeployCommand("sleep", ["0.1"], { deployTimeoutMs: 5000 })).resolves.toBeUndefined();
  });

  it("classifies a clean non-zero exit as CONFIRMED failure, not ambiguous", async () => {
    await expect(runDeployCommand("sh", ["-c", "exit 1"], { deployTimeoutMs: 5000 })).rejects.toMatchObject({
      name: "ConfirmedDeployFailureError",
    });
  });

  it("classifies an externally aborted command as AMBIGUOUS with reason 'cancelled' — the GitHub Actions cancellation path", async () => {
    const controller = new AbortController();
    const promise = runDeployCommand("sleep", ["10"], { deployTimeoutMs: 30_000, abortSignal: controller.signal });
    setTimeout(() => controller.abort(), 200);
    const start = Date.now();
    await expect(promise).rejects.toMatchObject({ name: "AmbiguousDeployOutcomeError", reason: "cancelled" });
    expect(Date.now() - start).toBeLessThan(5000);
  }, 10_000);

  it("kills the ENTIRE process tree on timeout, not just the direct child — the exact gap found empirically before this fix existed", async () => {
    // A command that backgrounds a grandchild and waits on it. Before the
    // detached-process-group fix, killing only the direct child left this
    // grandchild running, re-parented to PID 1, unaffected by the "kill" —
    // confirmed by this exact repro against the OLD implementation first.
    const marker = `/tmp/deploy-lock-tree-kill-test-${process.pid}-${Date.now()}.pid`;
    const script = `sleep 15 & child=$!; echo $child > ${marker}; wait $child`;
    await expect(runDeployCommand("sh", ["-c", script], { deployTimeoutMs: 1000 })).rejects.toThrow();

    const fs = await import("node:fs");
    const childPid: string | null = fs.existsSync(marker) ? fs.readFileSync(marker, "utf8").trim() : null;
    expect(childPid).toBeTruthy(); // sanity: the grandchild did actually start before being killed
    if (!childPid) throw new Error("unreachable: asserted truthy above");

    // Brief grace period for OS-level process reaping after SIGKILL —
    // avoids a flaky false pass/fail right at the instant of the signal.
    await new Promise((r) => setTimeout(r, 300));

    const { execFileSync } = await import("node:child_process");
    let stillAlive = true;
    try {
      execFileSync("ps", ["-p", childPid]);
    } catch {
      stillAlive = false; // ps exits non-zero once the pid no longer exists — this is the pass case
    }
    expect(stillAlive).toBe(false); // the whole tree must be gone, not just the shell we spawned directly

    try {
      fs.unlinkSync(marker);
    } catch {}
  }, 10_000);
});

describe("CLI, end-to-end against a real local git remote — not mocked", () => {
  // Every test above exercises the exported functions directly. None of
  // them would have caught a mismatch between how a workflow invokes the
  // CLI (argv) and how the CLI parses argv — exactly the class of bug a
  // live integration test found: `release daily "<runId>"` (3 args) was
  // silently misparsed, since the CLI's `release` action only expects
  // `release <runId>` (2 args), making the "holder" positional argument
  // get read as the runId instead. This suite runs the actual CLI as a
  // real subprocess against a real (local, throwaway) git remote, so a
  // regression here fails `npm test` directly, without needing CI.
  let tmpDir: string;

  beforeEach(async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-lock-cli-test-"));
    const originDir = path.join(tmpDir, "origin.git");
    execFileSync("git", ["init", "--bare", originDir]);
    execFileSync("git", ["clone", originDir, path.join(tmpDir, "work")]);
  });

  afterEach(async () => {
    const fs = await import("node:fs");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const scriptPath = path.resolve(__dirname, "../scripts/deploy/productionDeployLock.mjs");
  function runCli(args: string[]) {
    return execFileSync("node", [scriptPath, ...args], {
      cwd: path.join(tmpDir, "work"),
      encoding: "utf8",
    });
  }
  function runCliExpectFailure(args: string[]): string {
    try {
      runCli(args);
      throw new Error("expected CLI call to exit non-zero, but it succeeded");
    } catch (err: any) {
      if (typeof err.stdout === "string") return err.stdout + (err.stderr ?? "");
      throw err;
    }
  }
  function readLockJson(): any {
    const content = execFileSync("git", ["show", "origin/deploy-lock:lock.json"], {
      cwd: path.join(tmpDir, "work"),
      encoding: "utf8",
    });
    return JSON.parse(content);
  }

  it("acquire -> deploy -> release round-trips cleanly, and release actually clears the lock", () => {
    const runId = "test-run-1";
    runCli(["acquire", "release", runId]);
    runCli(["deploy", runId, "5000", "sha:test-1", "--", "true"]);
    const releaseOutput = runCli(["release", runId]);
    expect(releaseOutput).toContain("Lock released.");
    expect(releaseOutput).not.toContain("nothing to release");

    execFileSync("git", ["fetch", "origin", "deploy-lock"], { cwd: path.join(tmpDir, "work") });
    expect(readLockJson().deployTag).toBeNull();

    // Prove it's actually clear: a second run can acquire immediately,
    // with no retry/wait needed.
    const secondAcquire = runCli(["acquire", "daily", "test-run-2"]);
    expect(secondAcquire).toContain("Lock acquired by daily");
  }, 20_000);

  it("reproduces, and fails on, the exact historical argument-count mismatch", () => {
    const runId = "test-run-3";
    runCli(["acquire", "release", runId]);
    // The historical bug's exact call shape: an extra "release" positional
    // argument before the real runId.
    const buggyRelease = runCli(["release", "release", runId]);
    expect(buggyRelease).toContain("nothing to release");
    // The lock is still genuinely held — the buggy call did not release
    // it, confirmed from a second, independent angle (not just the log
    // line above): a correctly-shaped verify for the real runId still
    // succeeds.
    expect(() => runCli(["verify", runId])).not.toThrow();
    runCli(["release", runId]); // clean up for real
  }, 20_000);

  it("a deploy command that times out moves the lock to recovery_required, not a plain release-able 'held' state", () => {
    const runId = "test-run-ambiguous-timeout";
    runCli(["acquire", "daily", runId]);
    expect(() => runCli(["deploy", runId, "500", "sha:ambiguous-tag", "--", "sleep", "5"])).toThrow();

    execFileSync("git", ["fetch", "origin", "deploy-lock"], { cwd: path.join(tmpDir, "work") });
    const state = readLockJson();
    expect(state.status).toBe("recovery_required");
    expect(state.deployTag).toBe("sha:ambiguous-tag");
    expect(state.recovery.reason).toBe("timeout");

    // A plain release must refuse — this is the entire point.
    const releaseOutput = runCli(["release", runId]);
    expect(releaseOutput).toContain("NOT released");
    execFileSync("git", ["fetch", "origin", "deploy-lock"], { cwd: path.join(tmpDir, "work") });
    expect(readLockJson().status).toBe("recovery_required");
  }, 20_000);

  it("a confirmed (non-ambiguous) deploy failure does NOT enter recovery_required, and release still clears it normally", () => {
    const runId = "test-run-confirmed-failure";
    runCli(["acquire", "release", runId]);
    expect(() => runCli(["deploy", runId, "5000", "sha:confirmed-fail", "--", "sh", "-c", "exit 7"])).toThrow();

    execFileSync("git", ["fetch", "origin", "deploy-lock"], { cwd: path.join(tmpDir, "work") });
    expect(readLockJson().status).toBe("held"); // unchanged — not recovery_required

    const releaseOutput = runCli(["release", runId]);
    expect(releaseOutput).toContain("Lock released.");
  }, 20_000);

  it("recover refuses a deployTag that doesn't match the recorded incident", () => {
    const runId = "test-run-wrong-tag";
    runCli(["acquire", "daily", runId]);
    expect(() => runCli(["deploy", runId, "500", "sha:real-incident", "--", "sleep", "5"])).toThrow();

    const output = runCliExpectFailure(["recover", "sha:wrong-tag", "success", "--force"]);
    expect(output).toContain("Tag mismatch");

    execFileSync("git", ["fetch", "origin", "deploy-lock"], { cwd: path.join(tmpDir, "work") });
    expect(readLockJson().status).toBe("recovery_required"); // still stuck — refusal did not clear it
  }, 20_000);

  it("recover refuses to proceed blind without --force when no Cloudflare credentials are available", () => {
    const runId = "test-run-no-force";
    runCli(["acquire", "release", runId]);
    expect(() => runCli(["deploy", runId, "500", "sha:needs-force", "--", "sleep", "5"])).toThrow();

    const output = runCliExpectFailure(["recover", "sha:needs-force", "success"]);
    expect(output).toContain("Refusing to recover blind");
  }, 20_000);

  it("recover with --force clears a matching recovery_required lock and lets the next acquire proceed immediately", () => {
    const runId = "test-run-recovered";
    runCli(["acquire", "daily", runId]);
    expect(() => runCli(["deploy", runId, "500", "sha:recoverable", "--", "sleep", "5"])).toThrow();

    const recoverOutput = runCli(["recover", "sha:recoverable", "failure", "--force"]);
    expect(recoverOutput).toContain("Recovery complete");

    execFileSync("git", ["fetch", "origin", "deploy-lock"], { cwd: path.join(tmpDir, "work") });
    const cleared = readLockJson();
    expect(cleared.status).toBe("unlocked");
    expect(cleared.deployTag).toBeNull();
    expect(cleared.recovery).toBeNull();

    const nextAcquire = runCli(["acquire", "release", "test-run-after-recovery"]);
    expect(nextAcquire).toContain("Lock acquired by release");
  }, 20_000);
});

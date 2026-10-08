import { describe, expect, it, vi } from "vitest";
import {
  acquireLock,
  assertSafeDeadline,
  isExpired,
  isHeldBy,
  releaseLock,
  runDeployCommand,
  verifyOwnership,
} from "../scripts/deploy/productionDeployLock.mjs";

interface LockState {
  holder: string | null;
  runId: string | null;
  acquiredAt: number | null;
  expiresAt: number;
}
interface RemoteState {
  sha: string | null;
  state: LockState | null;
}

/** In-memory fake of acquireLock's expected result shape — narrows the
 * union so tests can assert on `.state` after checking `.ok`. */
function expectAcquired(result: { ok: boolean; state?: LockState; reason?: string }): LockState {
  expect(result.ok).toBe(true);
  expect(result.state).toBeDefined();
  return result.state as LockState;
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

describe("isExpired / isHeldBy", () => {
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

describe("acquireLock — basic cases", () => {
  it("acquires immediately when the branch doesn't exist yet (bootstrap)", async () => {
    const remote = fakeRemote();
    const result = await acquireLock(remote, "run-1", "daily", { now: fixedNow, sleep: noSleep });
    const state = expectAcquired(result);
    expect(state.holder).toBe("daily");
    expect(state.runId).toBe("run-1");
  });

  it("reclaims an expired lock left by a crashed/cancelled run", async () => {
    const remote = fakeRemote({
      sha: "sha-stale",
      state: { holder: "release", runId: "crashed-run", acquiredAt: NOW - 999_000, expiresAt: NOW - 1 },
    });
    const result = await acquireLock(remote, "run-2", "daily", { now: fixedNow, sleep: noSleep });
    const state = expectAcquired(result);
    expect(state.runId).toBe("run-2");
  });

  it("waits and times out if the lock is genuinely held and never freed", async () => {
    const remote = fakeRemote({
      sha: "sha-1",
      state: { holder: "release", runId: "still-running", acquiredAt: NOW, expiresAt: NOW + 10_000 },
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
    const a = remote.write(sha, { holder: "daily", runId: "a", acquiredAt: NOW, expiresAt: NOW + 1000 });
    const b = remote.write(sha, { holder: "release", runId: "b", acquiredAt: NOW, expiresAt: NOW + 1000 });
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
});

describe("runDeployCommand — the actual prevention mechanism, not just a documented intent", () => {
  it("kills a command that runs longer than deployTimeoutMs, rather than waiting for it", () => {
    const start = Date.now();
    expect(() => runDeployCommand("sleep", ["10"], { deployTimeoutMs: 1000 })).toThrow();
    const elapsed = Date.now() - start;
    // Generous upper bound — this must be killed promptly, nowhere near the
    // full 10s sleep duration. If this ever regresses to "waits it out",
    // the whole lease-safety argument in this file's header comment is false.
    expect(elapsed).toBeLessThan(5000);
  }, 10_000);

  it("does not throw for a command that finishes comfortably within the timeout", () => {
    expect(() => runDeployCommand("sleep", ["0.1"], { deployTimeoutMs: 5000 })).not.toThrow();
  });

  it("throws for a command that exits non-zero even without timing out", () => {
    expect(() => runDeployCommand("sh", ["-c", "exit 1"], { deployTimeoutMs: 5000 })).toThrow();
  });
});

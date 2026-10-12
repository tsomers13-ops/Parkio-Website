import { afterEach, describe, expect, it, vi } from "vitest";
import { handleDispatchTick, type Env } from "../src/index";
import { DispatchGuard, type DurableObjectStorageLike } from "../src/dispatchGuard";

/**
 * End-to-end coverage for the exact question the final review raised:
 * "what happens when GitHub accepts a dispatch but the HTTP response is
 * lost?" and "verify retries cannot accidentally trigger duplicate
 * production workflows." These tests drive handleDispatchTick itself
 * (not just the lower-level dispatchWorkflow unit tests) so the full
 * claim/release/no-retry interaction is proven together, against ONE
 * shared Durable Object instance across two separate invocations — the
 * same shape as the real dispatch cron firing more than once.
 */

class FakeStorage implements DurableObjectStorageLike {
  private values = new Map<string, string>();
  async get(key: string): Promise<string | undefined> {
    return this.values.get(key);
  }
  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

function makeSharedDispatchGuardNamespace() {
  // ONE guard instance, reused across every call this function's result
  // is passed to — mirrors the real DispatchGuard DO, which is always
  // addressed by the same fixed, well-known instance id.
  const guard = new DispatchGuard({ storage: new FakeStorage() });
  return {
    idFromName: (_name: string) => "fixed-id",
    get: (_id: string) => ({
      fetch: (url: string) => guard.fetch(new Request(url)),
    }),
  } as unknown as DurableObjectNamespace;
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    GITHUB_DISPATCH_TOKEN: "github_pat_test_token",
    DISPATCH_GUARD: makeSharedDispatchGuardNamespace(),
    GITHUB_OWNER: "tsomers13-ops",
    GITHUB_REPO: "Parkio-Website",
    GITHUB_REF: "main",
    GITHUB_WORKFLOW_FILE: "parkio-daily.yml",
    HEALTH_CHECK_WORKFLOW_FILE: "parkio-daily-health-check.yml",
    TARGET_HOUR_ET: "6",
    TARGET_MINUTE_ET: "45",
    HEALTH_CHECK_HOUR_ET: "7",
    HEALTH_CHECK_MINUTE_ET: "15",
    ...overrides,
  };
}

const DISPATCH_MOMENT = new Date("2026-07-15T10:45:00Z"); // 6:45 AM EDT

describe("duplicate-dispatch prevention under a lost/ambiguous response", () => {
  const originalFetch = globalThis.fetch;
  // These paths deliberately log via console.error (see index.ts) —
  // expected, already covered by test/credentialHandling.test.ts;
  // silenced here just to keep this file's own output focused on
  // assertions.
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  afterEach(() => {
    globalThis.fetch = originalFetch;
    errorSpy.mockClear();
  });

  it("an ambiguous failure (response lost) makes exactly one GitHub call, and a SECOND tick for the same date does not call GitHub again — the claim stays held rather than inviting a possible duplicate", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error("network unreachable"));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const env = makeEnv();

    await handleDispatchTick(DISPATCH_MOMENT, env);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // A second tick for the same Eastern date — e.g. the other DST bracket
    // somehow also matching, or a Cloudflare at-least-once re-invocation.
    await handleDispatchTick(DISPATCH_MOMENT, env);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // still 1 — no second GitHub call
  });

  it("a confirmed failure (GitHub definitively rejected it) makes exactly one call per tick, and DOES allow a second tick to try again — because we know for certain nothing was created the first time", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "Bad credentials" });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const env = makeEnv();

    await handleDispatchTick(DISPATCH_MOMENT, env);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await handleDispatchTick(DISPATCH_MOMENT, env);
    expect(fetchSpy).toHaveBeenCalledTimes(2); // claim was released, so this DID retry
  });

  it("a successful dispatch makes exactly one call, and a second same-day tick never calls GitHub again", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => "" });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const env = makeEnv();

    await handleDispatchTick(DISPATCH_MOMENT, env);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await handleDispatchTick(DISPATCH_MOMENT, env);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // still 1 — already dispatched today
  });

  it("a NEW Eastern calendar date correctly gets its own fresh dispatch, even after an earlier ambiguous outcome on a previous date", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error("network unreachable"));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const env = makeEnv();

    await handleDispatchTick(new Date("2026-07-14T10:45:00Z"), env); // 2026-07-14
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockResolvedValue({ ok: true, status: 204, text: async () => "" });
    await handleDispatchTick(new Date("2026-07-15T10:45:00Z"), env); // 2026-07-15, a new date
    expect(fetchSpy).toHaveBeenCalledTimes(2); // the new date got its own attempt
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { handleHealthCheckTick, handleDispatchTick, type Env } from "../src/index";
import { DispatchGuard, type DurableObjectStorageLike } from "../src/dispatchGuard";

/**
 * Covers review item: "confirm duplicate health checks cannot cause
 * duplicate publication" (and, more directly, cannot cause duplicate
 * GitHub dispatches of the health-check workflow). Since the email path
 * is gone, the health check is now just a second use of the exact same
 * dispatch-with-duplicate-prevention mechanism the real Parkio Daily
 * trigger already uses — handleHealthCheckTick dispatches
 * parkio-daily-health-check.yml under the independent "alert" purpose,
 * via the same DispatchGuard instance the "dispatch" purpose uses.
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

const HEALTH_CHECK_MOMENT = new Date("2026-07-15T11:15:00Z"); // 7:15 AM EDT
const DISPATCH_MOMENT = new Date("2026-07-15T10:45:00Z"); // 6:45 AM EDT

describe("health-check dispatch deduplication", () => {
  const originalFetch = globalThis.fetch;
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  afterEach(() => {
    globalThis.fetch = originalFetch;
    errorSpy.mockClear();
  });

  it("dispatches the health-check workflow exactly once across two ticks for the same day", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => "" });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const env = makeEnv();

    await handleHealthCheckTick(HEALTH_CHECK_MOMENT, env);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toContain("parkio-daily-health-check.yml");

    // A second tick for the SAME Eastern date — the other DST bracket, or
    // a Cloudflare at-least-once re-invocation.
    await handleHealthCheckTick(HEALTH_CHECK_MOMENT, env);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // still 1 — deduped
  });

  it("a new day's health check still gets its own dispatch, independent of a previous day's", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => "" });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const env = makeEnv();

    await handleHealthCheckTick(new Date("2026-07-14T11:15:00Z"), env); // 2026-07-14
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await handleHealthCheckTick(new Date("2026-07-15T11:15:00Z"), env); // 2026-07-15, a new date
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("the health-check dedupe is independent of the real dispatch dedupe — both can legitimately fire the same day without contending for the same claim", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => "" });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const sharedGuard = makeSharedDispatchGuardNamespace();
    const env = makeEnv({ DISPATCH_GUARD: sharedGuard });

    await handleDispatchTick(DISPATCH_MOMENT, env);
    await handleHealthCheckTick(HEALTH_CHECK_MOMENT, env);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const dispatchedFiles = fetchSpy.mock.calls.map((call) => String(call[0]));
    expect(dispatchedFiles.some((url) => url.includes("parkio-daily.yml"))).toBe(true);
    expect(dispatchedFiles.some((url) => url.includes("parkio-daily-health-check.yml"))).toBe(true);
  });

  it("an ambiguous health-check dispatch outcome is never auto-retried, same as the real dispatch path", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error("network unreachable"));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const env = makeEnv();

    await handleHealthCheckTick(HEALTH_CHECK_MOMENT, env);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await handleHealthCheckTick(HEALTH_CHECK_MOMENT, env);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // claim left in place, no second attempt
  });

  it("a non-target-minute tick never dispatches the health-check workflow at all", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const env = makeEnv();

    await handleHealthCheckTick(new Date("2026-07-15T18:00:00Z"), env); // nowhere near 7:15 AM ET
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

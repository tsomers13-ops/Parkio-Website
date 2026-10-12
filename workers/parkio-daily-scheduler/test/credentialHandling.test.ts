import { afterEach, describe, expect, it, vi } from "vitest";
import { handleDispatchTick, type Env } from "../src/index";
import { DispatchGuard, type DurableObjectStorageLike } from "../src/dispatchGuard";

const SECRET_TOKEN = "github_pat_SUPER_SECRET_VALUE_should_never_leak_98765";

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

/** Minimal fake of DurableObjectNamespace, backed by one real DispatchGuard. */
function makeFakeDispatchGuardNamespace() {
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
    GITHUB_DISPATCH_TOKEN: SECRET_TOKEN,
    DISPATCH_GUARD: makeFakeDispatchGuardNamespace(),
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

describe("credential handling — the GitHub token never appears outside the one Authorization header it belongs in", () => {
  const originalFetch = globalThis.fetch;
  const consoleSpies = ["log", "error", "warn", "info"].map((level) =>
    vi.spyOn(console, level as "log").mockImplementation(() => {})
  );

  afterEach(() => {
    globalThis.fetch = originalFetch;
    consoleSpies.forEach((spy) => spy.mockClear());
  });

  it("the token appears ONLY in the Authorization header of the GitHub dispatch call — never in the DO call, never logged, never in any URL", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, headers: (init?.headers as Record<string, string>) ?? {} });
      return { ok: true, status: 204, text: async () => "" } as Response;
    }) as unknown as typeof fetch;

    // 2026-07-15T10:45:00Z = 6:45 AM EDT — the real dispatch moment.
    await handleDispatchTick(new Date("2026-07-15T10:45:00Z"), makeEnv());

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://api.github.com/repos/tsomers13-ops/Parkio-Website/actions/workflows/parkio-daily.yml/dispatches"
    );
    expect(calls[0].headers.Authorization).toBe(`Bearer ${SECRET_TOKEN}`);

    // Nothing printed anywhere during a clean run should ever contain the
    // raw token, including the one successful dispatch call's own url.
    expect(calls[0].url).not.toContain(SECRET_TOKEN);
    for (const spy of consoleSpies) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(SECRET_TOKEN);
      }
    }
  });

  it("even on a GitHub API failure (token redacted internally), nothing logged contains the raw token", async () => {
    globalThis.fetch = vi.fn(async () => {
      return { ok: false, status: 401, text: async () => `token ${SECRET_TOKEN} rejected` } as Response;
    }) as unknown as typeof fetch;

    await handleDispatchTick(new Date("2026-07-15T10:45:00Z"), makeEnv());

    for (const spy of consoleSpies) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(SECRET_TOKEN);
      }
    }
  });

  it("even on an ambiguous (network-throw) outcome, nothing logged contains the raw token", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error(`connection reset, token=${SECRET_TOKEN}`);
    }) as unknown as typeof fetch;

    await handleDispatchTick(new Date("2026-07-15T10:45:00Z"), makeEnv());

    for (const spy of consoleSpies) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(SECRET_TOKEN);
      }
    }
  });

  it("a non-target-minute tick never even reads fetch or the token path at all", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    // 6:00 PM UTC on a July day is nowhere near 6:45 AM Eastern.
    await handleDispatchTick(new Date("2026-07-15T18:00:00Z"), makeEnv());

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

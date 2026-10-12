import { afterEach, describe, expect, it, vi } from "vitest";
import { handleFallbackCheckTick, type Env } from "../src/index";
import { DispatchGuard, type DurableObjectStorageLike } from "../src/dispatchGuard";

/**
 * Covers review item: "confirm alerts cannot generate excessive duplicate
 * emails." The fallback-check cron is bracketed for EDT/EST exactly like
 * the dispatch cron, and Cloudflare's own at-least-once cron delivery
 * means a single tick could in rare cases invoke the Worker more than
 * once — without its own dedupe, that would mean more than one email for
 * the same missed day. These tests drive handleFallbackCheckTick against
 * one shared DispatchGuard instance (the "alert" purpose, independent of
 * "dispatch") across repeated invocations for the same Eastern date.
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

const SEND_EMAIL_STUB = { send: vi.fn().mockResolvedValue(undefined) };

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    GITHUB_DISPATCH_TOKEN: "github_pat_test_token",
    DISPATCH_GUARD: makeSharedDispatchGuardNamespace(),
    GITHUB_OWNER: "tsomers13-ops",
    GITHUB_REPO: "Parkio-Website",
    GITHUB_WORKFLOW_FILE: "parkio-daily.yml",
    GITHUB_REF: "main",
    TARGET_HOUR_ET: "6",
    TARGET_MINUTE_ET: "45",
    FALLBACK_CHECK_HOUR_ET: "7",
    FALLBACK_CHECK_MINUTE_ET: "15",
    ALERT_FROM_ADDRESS: "alerts@parkio.info",
    ALERT_TO_ADDRESS: "tsomers13@gmail.com",
    SEND_EMAIL: SEND_EMAIL_STUB,
    ...overrides,
  };
}

const FALLBACK_MOMENT = new Date("2026-07-15T11:15:00Z"); // 7:15 AM EDT
const FEED_WITHOUT_TODAY = `<?xml version="1.0"?><rss><channel>
  <item><title>Parkio Daily for July 14, 2026</title></item>
</channel></rss>`;
const FEED_WITH_TODAY = `<?xml version="1.0"?><rss><channel>
  <item><title>Parkio Daily for July 15, 2026</title><link>https://parkio.info/guide/parkio-daily-2026-07-15/</link></item>
</channel></rss>`;

describe("missed-publication alert deduplication", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    SEND_EMAIL_STUB.send.mockClear();
  });

  it("sends exactly one email across two ticks for the same missed day, even though the article is still missing both times", async () => {
    globalThis.fetch = vi.fn(async () => ({ text: async () => FEED_WITHOUT_TODAY })) as unknown as typeof fetch;
    const env = makeEnv();

    await handleFallbackCheckTick(FALLBACK_MOMENT, env);
    expect(SEND_EMAIL_STUB.send).toHaveBeenCalledTimes(1);

    // A second tick for the SAME Eastern date — the other DST bracket
    // somehow also matching, or a Cloudflare at-least-once re-invocation.
    await handleFallbackCheckTick(FALLBACK_MOMENT, env);
    expect(SEND_EMAIL_STUB.send).toHaveBeenCalledTimes(1); // still 1 — deduped
  });

  it("sends no email at all if the article is actually live", async () => {
    globalThis.fetch = vi.fn(async () => ({ text: async () => FEED_WITH_TODAY })) as unknown as typeof fetch;
    const env = makeEnv();

    await handleFallbackCheckTick(FALLBACK_MOMENT, env);
    expect(SEND_EMAIL_STUB.send).not.toHaveBeenCalled();
  });

  it("a NEW day's missed publication still gets its own alert, independent of a previous day's alert having already fired", async () => {
    globalThis.fetch = vi.fn(async () => ({ text: async () => FEED_WITHOUT_TODAY })) as unknown as typeof fetch;
    const env = makeEnv();

    await handleFallbackCheckTick(new Date("2026-07-14T11:15:00Z"), env); // 2026-07-14
    expect(SEND_EMAIL_STUB.send).toHaveBeenCalledTimes(1);

    await handleFallbackCheckTick(new Date("2026-07-15T11:15:00Z"), env); // 2026-07-15, a new date
    expect(SEND_EMAIL_STUB.send).toHaveBeenCalledTimes(2);
  });

  it("the alert dedupe is independent of the dispatch dedupe — both can legitimately fire on the same day without contending for the same claim", async () => {
    const { handleDispatchTick } = await import("../src/index");
    const sharedGuard = makeSharedDispatchGuardNamespace();
    const env = makeEnv({ DISPATCH_GUARD: sharedGuard });

    globalThis.fetch = vi.fn(async (url: string): Promise<{ ok: boolean; status: number; text: () => Promise<string> }> => {
      if (typeof url === "string" && url.includes("github.com")) {
        return { ok: true, status: 204, text: async () => "" };
      }
      return { ok: true, status: 200, text: async () => FEED_WITHOUT_TODAY };
    }) as unknown as typeof fetch;

    await handleDispatchTick(new Date("2026-07-15T10:45:00Z"), env);
    await handleFallbackCheckTick(FALLBACK_MOMENT, env);

    expect(SEND_EMAIL_STUB.send).toHaveBeenCalledTimes(1);
  });
});

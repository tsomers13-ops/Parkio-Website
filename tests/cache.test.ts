import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CACHE_TTL,
  cacheDelete,
  cacheGet,
  cacheSet,
  getOrFetch,
} from "@/lib/cache";

// Keys are unique per test so the module-level store can't leak state.
let n = 0;
function key(): string {
  return `test-key-${n++}`;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-04T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("cacheGet / cacheSet", () => {
  it("returns undefined for an unknown key", () => {
    expect(cacheGet(key())).toBeUndefined();
  });

  it("round-trips a value within its TTL", () => {
    const k = key();
    cacheSet(k, { hello: "world" }, 60);
    expect(cacheGet<{ hello: string }>(k)).toEqual({ hello: "world" });
  });

  it("expires the entry once the TTL elapses", () => {
    const k = key();
    cacheSet(k, "value", 60);
    vi.advanceTimersByTime(59_999);
    expect(cacheGet(k)).toBe("value");
    vi.advanceTimersByTime(1);
    expect(cacheGet(k)).toBeUndefined();
  });

  it("overwrites an existing key", () => {
    const k = key();
    cacheSet(k, "first", 60);
    cacheSet(k, "second", 60);
    expect(cacheGet(k)).toBe("second");
  });
});

describe("cacheDelete", () => {
  it("removes an entry", () => {
    const k = key();
    cacheSet(k, "value", 60);
    cacheDelete(k);
    expect(cacheGet(k)).toBeUndefined();
  });

  it("is a no-op for a missing key", () => {
    expect(() => cacheDelete(key())).not.toThrow();
  });
});

describe("getOrFetch", () => {
  it("calls the fetcher exactly once on a miss then serves from cache", async () => {
    const k = key();
    const fetcher = vi.fn().mockResolvedValue({ n: 1 });
    await expect(getOrFetch(k, 60, fetcher)).resolves.toEqual({ n: 1 });
    await expect(getOrFetch(k, 60, fetcher)).resolves.toEqual({ n: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refetches after the TTL expires", async () => {
    const k = key();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce("first")
      .mockResolvedValueOnce("second");
    await getOrFetch(k, 10, fetcher);
    vi.advanceTimersByTime(10_000);
    await expect(getOrFetch(k, 10, fetcher)).resolves.toBe("second");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("propagates fetcher errors and caches nothing", async () => {
    const k = key();
    const fetcher = vi.fn().mockRejectedValue(new Error("upstream down"));
    await expect(getOrFetch(k, 60, fetcher)).rejects.toThrow("upstream down");
    expect(cacheGet(k)).toBeUndefined();
  });
});

describe("CACHE_TTL", () => {
  it("keeps live TTL at 5 minutes to stay inside the D1 write budget", () => {
    expect(CACHE_TTL.live).toBe(300);
    expect(CACHE_TTL.parkStatus).toBe(120);
    expect(CACHE_TTL.hours).toBe(1800);
    expect(CACHE_TTL.park).toBe(3600);
  });
});

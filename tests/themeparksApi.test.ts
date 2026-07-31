import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ThemeparksError,
  getEntity,
  getEntityChildren,
  getEntityLive,
  getEntitySchedule,
} from "@/lib/themeparksApi";

const BASE_URL = "https://api.themeparks.wiki/v1";

function mockFetch(response: Partial<Response> & { json?: () => unknown }) {
  const fetchMock = vi.fn().mockResolvedValue(response as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("endpoint wrappers", () => {
  it.each([
    ["getEntity", getEntity, "/entity/abc"],
    ["getEntityLive", getEntityLive, "/entity/abc/live"],
    ["getEntitySchedule", getEntitySchedule, "/entity/abc/schedule"],
    ["getEntityChildren", getEntityChildren, "/entity/abc/children"],
  ])("%s hits the right path", async (_name, fn, path) => {
    const fetchMock = mockFetch(okJson({ id: "abc", name: "Park" }));
    await expect(
      (fn as (id: string) => Promise<unknown>)("abc"),
    ).resolves.toEqual({
      id: "abc",
      name: "Park",
    });
    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}${path}`, {
      cache: "no-store",
      signal: undefined,
      headers: { Accept: "application/json" },
    });
  });

  it("forwards the abort signal", async () => {
    const fetchMock = mockFetch(okJson({}));
    const controller = new AbortController();
    await getEntityLive("abc", controller.signal);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });
});

describe("error handling", () => {
  it("throws a ThemeparksError carrying status and endpoint", async () => {
    mockFetch({ ok: false, status: 503, json: async () => ({}) });
    const error = await getEntityLive("abc").catch((e) => e);
    expect(error).toBeInstanceOf(ThemeparksError);
    expect(error).toMatchObject({
      name: "ThemeparksError",
      status: 503,
      endpoint: "/entity/abc/live",
    });
    expect((error as Error).message).toContain("503");
  });

  it("propagates network failures untouched", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    await expect(getEntity("abc")).rejects.toThrow("ECONNRESET");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ParkioApiError,
  fetchPark,
  fetchParkHours,
  fetchParkLive,
  fetchParksList,
} from "@/lib/parkioClient";

function stubFetch(response: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(response as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("route helpers", () => {
  it.each([
    ["fetchParksList", () => fetchParksList(), "/api/parks"],
    ["fetchPark", () => fetchPark("epcot"), "/api/parks/epcot"],
    ["fetchParkLive", () => fetchParkLive("epcot"), "/api/parks/epcot/live"],
    ["fetchParkHours", () => fetchParkHours("epcot"), "/api/parks/epcot/hours"],
  ])("%s requests the right path", async (_name, call, path) => {
    const fetchMock = stubFetch({ ok: true, json: async () => ({ ok: 1 }) });
    await expect(call()).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledWith(path, {
      headers: { Accept: "application/json" },
      signal: undefined,
    });
  });

  it("url-encodes the slug", async () => {
    const fetchMock = stubFetch({ ok: true, json: async () => ({}) });
    await fetchPark("a b/c");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/parks/a%20b%2Fc");
  });

  it("forwards the abort signal", async () => {
    const fetchMock = stubFetch({ ok: true, json: async () => ({}) });
    const controller = new AbortController();
    await fetchParkLive("epcot", controller.signal);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });
});

describe("ParkioApiError", () => {
  it("uses the error body's message when present", async () => {
    stubFetch({
      ok: false,
      status: 404,
      json: async () => ({
        error: "not_found",
        message: "Unknown park slug",
        status: 404,
      }),
    });
    const error = await fetchPark("nope").catch((e) => e);
    expect(error).toBeInstanceOf(ParkioApiError);
    expect(error.status).toBe(404);
    expect(error.message).toBe("Unknown park slug");
    expect(error.body).toMatchObject({ error: "not_found" });
  });

  it("falls back to a generic message on a non-JSON error response", async () => {
    stubFetch({
      ok: false,
      status: 500,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    });
    const error = await fetchParksList().catch((e) => e);
    expect(error).toBeInstanceOf(ParkioApiError);
    expect(error.body).toBeNull();
    expect(error.message).toBe("Parkio API error: 500");
  });
});

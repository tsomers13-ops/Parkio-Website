// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiAttraction, ApiPark, ApiParkLive } from "@/lib/types";
import { useAllLive } from "@/lib/useAllLive";

const { fetchParksList, fetchParkLive } = vi.hoisted(() => ({
  fetchParksList: vi.fn(),
  fetchParkLive: vi.fn(),
}));

vi.mock("@/lib/parkioClient", () => ({ fetchParksList, fetchParkLive }));

function park(slug: string, name: string, status: ApiPark["status"] = "OPEN"): ApiPark {
  return {
    id: `ext-${slug}`,
    slug,
    name,
    resortSlug: "walt-disney-world",
    status,
    timezone: "America/New_York",
    todayHours: null,
    lastUpdated: "2026-05-04T18:00:00.000Z",
  };
}

function attraction(
  slug: string,
  waitMinutes: number | null,
  status: ApiAttraction["status"] = "OPERATING",
): ApiAttraction {
  return {
    id: `ext-${slug}`,
    slug,
    parkSlug: "magic-kingdom",
    name: slug,
    status,
    waitMinutes,
    coordinates: null,
    lastUpdated: "2026-05-04T18:00:00.000Z",
  };
}

function liveResponse(
  parkSlug: string,
  attractions: ApiAttraction[],
  live = true,
): ApiParkLive {
  return {
    parkSlug,
    lastUpdated: "2026-05-04T18:00:00.000Z",
    live,
    attractions,
    events: [],
  };
}

beforeEach(() => {
  fetchParksList.mockReset();
  fetchParkLive.mockReset();
});

afterEach(() => {
  // Unmount hooks explicitly: without RTL's global auto-cleanup, a hook
  // left mounted keeps polling into the next test's fake-timer clock.
  cleanup();
  vi.useRealTimers();
});

describe("useAllLive", () => {
  it("starts in the loading state", () => {
    fetchParksList.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAllLive());
    expect(result.current.status).toBe("loading");
    expect(result.current.parks).toEqual([]);
    expect(result.current.averageWait).toBeNull();
  });

  it("aggregates waits across parks once loaded", async () => {
    fetchParksList.mockResolvedValue({
      parks: [park("magic-kingdom", "Magic Kingdom"), park("epcot", "EPCOT")],
      count: 2,
      lastUpdated: "2026-05-04T18:00:00.000Z",
    });
    fetchParkLive.mockImplementation(async (slug: string) =>
      slug === "magic-kingdom"
        ? liveResponse(slug, [
            attraction("mk-a", 10),
            attraction("mk-b", 50),
            attraction("mk-down", 999, "DOWN"),
            attraction("mk-nowait", null),
          ])
        : liveResponse(slug, [attraction("ep-a", 20), attraction("ep-b", 30)]),
    );

    const { result } = renderHook(() => useAllLive());
    await waitFor(() => expect(result.current.status).toBe("live"));

    expect(result.current.lastUpdated).toBe("2026-05-04T18:00:00.000Z");
    expect(result.current.liveByPark.size).toBe(2);
    expect(result.current.averageWait).toBe(28);
    expect(result.current.busiestPark).toEqual({
      slug: "magic-kingdom",
      name: "Magic Kingdom",
      avg: 30,
    });
    expect(result.current.quietestPark).toEqual({
      slug: "epcot",
      name: "EPCOT",
      avg: 25,
    });
    expect(result.current.shortestWaits.map((r) => r.attraction.slug)).toEqual([
      "mk-a",
      "ep-a",
      "ep-b",
    ]);
    expect(result.current.longestWaits.map((r) => r.attraction.slug)).toEqual([
      "mk-b",
      "ep-b",
      "ep-a",
    ]);
    expect(result.current.longestWaits[0]?.attraction.waitMinutes).toBe(50);
    expect(result.current.shortestWaits[0]?.parkName).toBe("Magic Kingdom");
    expect(result.current.openParkCount).toBe(2);
  });

  it("caps the shortest/longest rails at three rides", async () => {
    fetchParksList.mockResolvedValue({
      parks: [park("magic-kingdom", "Magic Kingdom")],
      count: 1,
      lastUpdated: "2026-05-04T18:00:00.000Z",
    });
    fetchParkLive.mockResolvedValue(
      liveResponse(
        "magic-kingdom",
        Array.from({ length: 8 }, (_, i) => attraction(`mk-${i}`, i * 10)),
      ),
    );

    const { result } = renderHook(() => useAllLive());
    await waitFor(() => expect(result.current.status).toBe("live"));
    expect(result.current.shortestWaits).toHaveLength(3);
    expect(result.current.longestWaits).toHaveLength(3);
  });

  it("reports estimates when no park returned live data", async () => {
    fetchParksList.mockResolvedValue({
      parks: [park("epcot", "EPCOT", "CLOSED")],
      count: 1,
      lastUpdated: "2026-05-04T18:00:00.000Z",
    });
    fetchParkLive.mockResolvedValue(liveResponse("epcot", [], false));

    const { result } = renderHook(() => useAllLive());
    await waitFor(() => expect(result.current.status).toBe("estimates"));
    expect(result.current.averageWait).toBeNull();
    expect(result.current.busiestPark).toBeNull();
    expect(result.current.quietestPark).toBeNull();
    expect(result.current.openParkCount).toBe(0);
  });

  it("skips parks whose live fetch failed", async () => {
    fetchParksList.mockResolvedValue({
      parks: [park("magic-kingdom", "Magic Kingdom"), park("epcot", "EPCOT")],
      count: 2,
      lastUpdated: "2026-05-04T18:00:00.000Z",
    });
    fetchParkLive.mockImplementation(async (slug: string) => {
      if (slug === "epcot") throw new Error("500");
      return liveResponse(slug, [attraction("mk-a", 15)]);
    });

    const { result } = renderHook(() => useAllLive());
    await waitFor(() => expect(result.current.status).toBe("live"));
    expect(result.current.liveByPark.has("epcot")).toBe(false);
    expect(result.current.averageWait).toBe(15);
  });

  it("falls back to estimates when the parks list fetch fails", async () => {
    fetchParksList.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useAllLive());
    await waitFor(() => expect(result.current.status).toBe("estimates"));
    expect(result.current.parks).toEqual([]);
  });

  it("ignores an AbortError from an unmounted poll", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    fetchParksList.mockRejectedValue(abort);
    const { result } = renderHook(() => useAllLive());
    await Promise.resolve();
    expect(result.current.status).toBe("loading");
  });

  it("polls again after 60 seconds while the tab is visible", async () => {
    vi.useFakeTimers();
    fetchParksList.mockResolvedValue({
      parks: [park("magic-kingdom", "Magic Kingdom")],
      count: 1,
      lastUpdated: "2026-05-04T18:00:00.000Z",
    });
    fetchParkLive.mockResolvedValue(
      liveResponse("magic-kingdom", [attraction("mk-a", 15)]),
    );

    renderHook(() => useAllLive());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchParksList).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchParksList).toHaveBeenCalledTimes(2);
  });

  it("pauses polling while hidden and refreshes when the tab returns", async () => {
    vi.useFakeTimers();
    fetchParksList.mockResolvedValue({
      parks: [park("magic-kingdom", "Magic Kingdom")],
      count: 1,
      lastUpdated: "2026-05-04T18:00:00.000Z",
    });
    fetchParkLive.mockResolvedValue(
      liveResponse("magic-kingdom", [attraction("mk-a", 15)]),
    );

    let visibility: DocumentVisibilityState = "visible";
    const original = Object.getOwnPropertyDescriptor(
      Document.prototype,
      "visibilityState",
    );
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });

    renderHook(() => useAllLive());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    visibility = "hidden";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(fetchParksList).toHaveBeenCalledTimes(1);

    visibility = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchParksList).toHaveBeenCalledTimes(2);

    delete (document as unknown as Record<string, unknown>).visibilityState;
    if (original) {
      Object.defineProperty(Document.prototype, "visibilityState", original);
    }
  });

  it("stops polling after unmount", async () => {
    vi.useFakeTimers();
    fetchParksList.mockResolvedValue({
      parks: [park("magic-kingdom", "Magic Kingdom")],
      count: 1,
      lastUpdated: "2026-05-04T18:00:00.000Z",
    });
    fetchParkLive.mockResolvedValue(
      liveResponse("magic-kingdom", [attraction("mk-a", 15)]),
    );

    const { unmount } = renderHook(() => useAllLive());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });
    expect(fetchParksList).toHaveBeenCalledTimes(1);
  });
});

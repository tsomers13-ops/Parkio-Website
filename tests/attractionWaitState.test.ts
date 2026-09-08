// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AttractionWaitState } from "@/components/attraction/AttractionWaitState";
import { getRide } from "@/lib/data";
import type { ApiAttraction } from "@/lib/types";

/**
 * These tests prove the attraction page CONSUMES the shared wait-state
 * model correctly. The derivation rules themselves are covered by
 * tests/waitState.test.ts and are deliberately not re-tested here.
 */

const ride = getRide("ep-guardians")!; // baseWait 90

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function apiResponse(body: ApiAttraction) {
  return {
    ok: true,
    json: async () => body,
  } as unknown as Response;
}

function attraction(overrides: Partial<ApiAttraction>): ApiAttraction {
  return {
    id: ride.externalId,
    slug: ride.id,
    parkSlug: ride.parkId,
    name: ride.name,
    status: "OPERATING",
    waitMinutes: null,
    coordinates: { lat: ride.lat, lng: ride.lng },
    lastUpdated: "2026-09-07T12:00:00.000Z",
    ...overrides,
  };
}

function renderWait() {
  return render(createElement(AttractionWaitState, { ride }));
}

describe("AttractionWaitState", () => {
  it("shows a posted wait as live", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        apiResponse(attraction({ status: "OPERATING", waitMinutes: 45 })),
      ),
    );
    renderWait();
    await waitFor(() => expect(screen.getByText("45 min")).toBeTruthy());
    expect(screen.getByText(/posted by the park/i)).toBeTruthy();
  });

  it("labels the fallback as a Parkio estimate, never as posted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        apiResponse(attraction({ status: "UNKNOWN", waitMinutes: null })),
      ),
    );
    renderWait();
    await waitFor(() =>
      expect(screen.getByText("Typically ~90 min")).toBeTruthy(),
    );
    expect(screen.getByText(/parkio estimate/i)).toBeTruthy();
    expect(screen.queryByText(/posted by the park/i)).toBeNull();
  });

  it("never fabricates a number when no wait is posted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        apiResponse(attraction({ status: "OPERATING", waitMinutes: null })),
      ),
    );
    renderWait();
    await waitFor(() => expect(screen.getByText("No wait posted")).toBeTruthy());
    expect(screen.queryByText(/~\d+ min/)).toBeNull();
  });

  it("shows the operational status when the ride is not running", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        apiResponse(attraction({ status: "REFURBISHMENT", waitMinutes: null })),
      ),
    );
    renderWait();
    await waitFor(() => expect(screen.getByText("In refurb")).toBeTruthy());
  });

  it("degrades to the deterministic estimate when the API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    renderWait();
    await waitFor(() =>
      expect(screen.getByText("Typically ~90 min")).toBeTruthy(),
    );
    expect(screen.getByText(/parkio estimate/i)).toBeTruthy();
  });

  it("renders the estimate on first paint, before any response arrives", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    renderWait();
    // No spinner, no empty state — the evergreen answer is already useful.
    expect(screen.getByText("Typically ~90 min")).toBeTruthy();
  });

  it("does not rely on colour alone to separate live from estimated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        apiResponse(attraction({ status: "OPERATING", waitMinutes: 45 })),
      ),
    );
    const { container } = renderWait();
    await waitFor(() => expect(screen.getByText("45 min")).toBeTruthy());
    // The distinction is carried in words, not just styling.
    expect(container.textContent).toMatch(/posted by the park/i);
  });
});

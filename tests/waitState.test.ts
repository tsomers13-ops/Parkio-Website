import { describe, expect, it } from "vitest";

import { RIDES } from "@/lib/data";
import type { Ride } from "@/lib/types";
import {
  deriveWaitState,
  typicalWait,
  waitStateCompactLabel,
  waitStateLabel,
} from "@/lib/waitState";

function ride(overrides: Partial<Ride> = {}): Ride {
  return {
    id: "mk-pirates",
    parkId: "magic-kingdom",
    name: "Pirates of the Caribbean",
    land: "Adventureland",
    category: "family",
    description: "Yo ho.",
    lat: 28.4183,
    lng: -81.5849,
    baseWait: 35,
    trend: "flat",
    lightningLane: true,
    externalId: "ext-pirates",
    ...overrides,
  };
}

describe("typicalWait", () => {
  it("is deterministic — the clock never changes the answer", () => {
    const r = ride();
    const first = typicalWait(r);
    for (let i = 0; i < 100; i++) {
      expect(typicalWait(r)).toBe(first);
    }
  });

  it("returns a multiple of 5, at least 5, for every real ride", () => {
    for (const r of RIDES) {
      const value = typicalWait(r);
      expect(value % 5, r.id).toBe(0);
      expect(value, r.id).toBeGreaterThanOrEqual(5);
    }
  });

  it("clamps a tiny base wait to the five-minute floor", () => {
    expect(typicalWait(ride({ baseWait: 0 }))).toBe(5);
    expect(typicalWait(ride({ baseWait: 1 }))).toBe(5);
  });

  it("stays anchored to the ride's own base wait", () => {
    expect(typicalWait(ride({ baseWait: 35 }))).toBe(35);
    expect(typicalWait(ride({ baseWait: 63 }))).toBe(65);
  });
});

describe("deriveWaitState", () => {
  const r = ride();

  it("reports a posted standby wait as live", () => {
    expect(deriveWaitState(r, { status: "OPERATING", waitMinutes: 25 })).toEqual({
      kind: "live",
      wait: 25,
      status: "OPERATING",
    });
  });

  it("treats a zero-minute posted wait as live, not as missing", () => {
    expect(
      deriveWaitState(r, { status: "OPERATING", waitMinutes: 0 }).kind,
    ).toBe("live");
  });

  it("falls back to a typical estimate when there is no live row", () => {
    expect(deriveWaitState(r, null)).toEqual({
      kind: "typical",
      wait: 35,
      status: "OPERATING",
    });
    expect(deriveWaitState(r, undefined).kind).toBe("typical");
  });

  it("falls back to a typical estimate when upstream status is UNKNOWN", () => {
    expect(
      deriveWaitState(r, { status: "UNKNOWN", waitMinutes: null }),
    ).toEqual({ kind: "typical", wait: 35, status: "OPERATING" });
  });

  it("never invents a number when operating with no posted wait", () => {
    expect(
      deriveWaitState(r, { status: "OPERATING", waitMinutes: null }),
    ).toEqual({ kind: "unavailable", wait: null, status: "OPERATING" });
  });

  it("never invents a number for a ride that is not running", () => {
    for (const status of ["DOWN", "CLOSED", "REFURBISHMENT"] as const) {
      const state = deriveWaitState(r, { status, waitMinutes: null });
      expect(state.kind, status).toBe("unavailable");
      expect(state.wait, status).toBeNull();
      expect(state.status, status).toBe(status);
    }
  });

  it("produces the same state for the same inputs, always", () => {
    const a = deriveWaitState(r, null);
    const b = deriveWaitState(r, null);
    expect(a).toEqual(b);
  });
});

describe("wait-state labels", () => {
  const r = ride();

  it("labels live waits as a plain posted number", () => {
    const live = deriveWaitState(r, { status: "OPERATING", waitMinutes: 25 });
    expect(waitStateLabel(live)).toBe("25 min");
    expect(waitStateCompactLabel(live)).toBe("25 min");
  });

  it("marks a typical wait as an estimate on every surface", () => {
    const typical = deriveWaitState(r, null);
    expect(waitStateLabel(typical)).toBe("Typically ~35 min");
    expect(waitStateCompactLabel(typical)).toBe("~35 min");
  });

  it("says plainly when no wait is posted", () => {
    const none = deriveWaitState(r, {
      status: "OPERATING",
      waitMinutes: null,
    });
    expect(waitStateLabel(none)).toBe("No wait posted");
  });

  it("shows the operational status when the ride is not running", () => {
    const closed = deriveWaitState(r, { status: "CLOSED", waitMinutes: null });
    expect(waitStateLabel(closed)).toBe("Closed");
  });

  it("never leaks implementation vocabulary to guests", () => {
    const states = [
      deriveWaitState(r, { status: "OPERATING", waitMinutes: 25 }),
      deriveWaitState(r, null),
      deriveWaitState(r, { status: "OPERATING", waitMinutes: null }),
      deriveWaitState(r, { status: "DOWN", waitMinutes: null }),
    ];
    for (const state of states) {
      for (const label of [
        waitStateLabel(state),
        waitStateCompactLabel(state),
      ]) {
        expect(label).not.toMatch(/baseWait|simulat|fallback|isLive/i);
      }
    }
  });
});

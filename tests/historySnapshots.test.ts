import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { persistLiveSnapshots } from "@/lib/historySnapshots";
import type { ApiAttraction, ApiParkLive } from "@/lib/types";

const TAKEN_AT = "2026-05-04T18:00:00.000Z";

function attraction(overrides: Partial<ApiAttraction> = {}): ApiAttraction {
  return {
    id: "ext-1",
    slug: "mk-pirates",
    parkSlug: "magic-kingdom",
    name: "Pirates of the Caribbean",
    status: "OPERATING",
    waitMinutes: 35,
    coordinates: null,
    lastUpdated: "2026-05-04T17:55:00.000Z",
    ...overrides,
  };
}

function payload(attractions: ApiAttraction[]): ApiParkLive {
  return {
    parkSlug: "magic-kingdom",
    lastUpdated: TAKEN_AT,
    live: true,
    attractions,
    events: [],
  };
}

/** Records every bind() call so we can assert on the row values. */
function fakeDb(batch: () => Promise<unknown> = async () => undefined) {
  const binds: unknown[][] = [];
  const stmt = {
    bind: (...values: unknown[]) => {
      binds.push(values);
      return { ...stmt, bound: values };
    },
    run: async () => undefined,
  };
  const db = {
    prepare: vi.fn(() => stmt),
    batch: vi.fn(batch),
  };
  return { db, binds };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(TAKEN_AT));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("persistLiveSnapshots", () => {
  it("no-ops when the binding is missing", async () => {
    await expect(
      persistLiveSnapshots(undefined, payload([attraction()])),
    ).resolves.toBeUndefined();
    await expect(
      persistLiveSnapshots({}, payload([attraction()])),
    ).resolves.toBeUndefined();
  });

  it("no-ops for an empty or missing payload", async () => {
    const { db } = fakeDb();
    await persistLiveSnapshots({ DB: db }, null);
    await persistLiveSnapshots({ DB: db }, undefined);
    await persistLiveSnapshots({ DB: db }, payload([]));
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("writes one bound row per attraction in a single batch", async () => {
    const { db, binds } = fakeDb();
    await persistLiveSnapshots(
      { DB: db },
      payload([attraction(), attraction({ id: "ext-2", slug: "mk-tron" })]),
    );
    expect(db.prepare).toHaveBeenCalledTimes(1);
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(binds).toHaveLength(2);
    expect(binds[0]).toEqual([
      TAKEN_AT,
      "magic-kingdom",
      "mk-pirates",
      "ext-1",
      35,
      "OPERATING",
      "2026-05-04T17:55:00.000Z",
    ]);
  });

  it("stores a null wait for rides that are not operating", async () => {
    const { db, binds } = fakeDb();
    await persistLiveSnapshots(
      { DB: db },
      payload([
        attraction({ status: "DOWN", waitMinutes: 45 }),
        attraction({ status: "OPERATING", waitMinutes: null }),
      ]),
    );
    expect(binds[0]?.[4]).toBeNull();
    expect(binds[1]?.[4]).toBeNull();
  });

  it("swallows batch failures and logs a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { db } = fakeDb(async () => {
      throw new Error("D1 unavailable");
    });
    await expect(
      persistLiveSnapshots({ DB: db }, payload([attraction()])),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("park=magic-kingdom"),
      "D1 unavailable",
    );
  });

  it("logs non-Error rejections as-is", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { db } = fakeDb(async () => {
      throw "boom";
    });
    await persistLiveSnapshots({ DB: db }, payload([attraction()]));
    expect(warn).toHaveBeenCalledWith(expect.any(String), "boom");
  });
});

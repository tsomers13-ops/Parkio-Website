import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RIDES } from "@/lib/data";
import {
  findAttractionBySlug,
  normalizeHours,
  normalizeLive,
  normalizePark,
} from "@/lib/parkioNormalizer";
import type {
  ThemeparksLiveResponse,
  ThemeparksScheduleEntry,
  ThemeparksScheduleResponse,
} from "@/lib/themeparksApi";

/** 2026-05-04 14:00 in New York (EDT, UTC-4). */
const NOON_ET = new Date("2026-05-04T18:00:00Z");

function schedule(
  entries: ThemeparksScheduleEntry[],
): ThemeparksScheduleResponse {
  return { id: "park-id", name: "Magic Kingdom", schedule: entries };
}

const OPEN_TODAY: ThemeparksScheduleEntry = {
  date: "2026-05-04",
  type: "OPERATING",
  openingTime: "2026-05-04T09:00:00-04:00",
  closingTime: "2026-05-04T22:00:00-04:00",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON_ET);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("normalizePark", () => {
  it("returns null for an unsupported park", () => {
    expect(normalizePark("tokyo-disneyland")).toBeNull();
  });

  it("maps static config onto the API shape", () => {
    const park = normalizePark("epcot", schedule([]));
    expect(park).toMatchObject({
      slug: "epcot",
      name: "EPCOT",
      resortSlug: "walt-disney-world",
      timezone: "America/New_York",
      id: "47f90d2c-e191-4239-a466-5892ef59a88b",
    });
    expect(park?.lastUpdated).toBe(NOON_ET.toISOString());
  });

  it("is OPEN inside today's operating window", () => {
    const park = normalizePark("magic-kingdom", schedule([OPEN_TODAY]));
    expect(park?.status).toBe("OPEN");
    expect(park?.todayHours).toEqual({
      open: "2026-05-04T09:00:00-04:00",
      close: "2026-05-04T22:00:00-04:00",
    });
  });

  it("is CLOSED before opening", () => {
    vi.setSystemTime(new Date("2026-05-04T11:00:00Z")); // 07:00 ET
    expect(normalizePark("magic-kingdom", schedule([OPEN_TODAY]))?.status).toBe(
      "CLOSED",
    );
  });

  it("is CLOSED when today's entry says CLOSED", () => {
    const park = normalizePark(
      "magic-kingdom",
      schedule([{ date: "2026-05-04", type: "CLOSED" }]),
    );
    expect(park?.status).toBe("CLOSED");
    expect(park?.todayHours).toBeNull();
  });

  it("stays OPEN while yesterday's window runs past midnight", () => {
    vi.setSystemTime(new Date("2026-05-04T04:30:00Z")); // 00:30 ET on the 4th
    const park = normalizePark(
      "magic-kingdom",
      schedule([
        {
          date: "2026-05-03",
          type: "OPERATING",
          openingTime: "2026-05-03T09:00:00-04:00",
          closingTime: "2026-05-04T01:00:00-04:00",
        },
      ]),
    );
    expect(park?.status).toBe("OPEN");
  });

  it("is UNKNOWN with no schedule at all", () => {
    expect(normalizePark("magic-kingdom")?.status).toBe("UNKNOWN");
    expect(normalizePark("magic-kingdom", null)?.status).toBe("UNKNOWN");
  });

  it("is UNKNOWN when today has no entries", () => {
    const park = normalizePark(
      "magic-kingdom",
      schedule([{ date: "2026-06-01", type: "OPERATING" }]),
    );
    expect(park?.status).toBe("UNKNOWN");
  });

  it("is UNKNOWN when today's only entry is an INFO row", () => {
    const park = normalizePark(
      "magic-kingdom",
      schedule([{ date: "2026-05-04", type: "INFO", description: "Party" }]),
    );
    expect(park?.status).toBe("UNKNOWN");
  });

  it("prefers the OPERATING row over an INFO row for the same day", () => {
    const park = normalizePark(
      "magic-kingdom",
      schedule([{ date: "2026-05-04", type: "INFO" }, OPEN_TODAY]),
    );
    expect(park?.status).toBe("OPEN");
    expect(park?.todayHours?.open).toBe("2026-05-04T09:00:00-04:00");
  });

  it("ignores an operating row with unparseable times", () => {
    const park = normalizePark(
      "magic-kingdom",
      schedule([
        {
          date: "2026-05-04",
          type: "OPERATING",
          openingTime: "not-a-date",
          closingTime: "also-not-a-date",
        },
      ]),
    );
    expect(park?.status).toBe("CLOSED");
  });

  it("uses the park's own timezone for the date key", () => {
    // 03:00 UTC on the 5th is still the 4th in California.
    vi.setSystemTime(new Date("2026-05-05T03:00:00Z"));
    const park = normalizePark(
      "disneyland",
      schedule([
        {
          date: "2026-05-04",
          type: "OPERATING",
          openingTime: "2026-05-04T08:00:00-07:00",
          closingTime: "2026-05-04T23:00:00-07:00",
        },
      ]),
    );
    expect(park?.status).toBe("OPEN");
  });
});

describe("normalizeHours", () => {
  it("returns null for an unsupported park", () => {
    expect(normalizeHours("nowhere")).toBeNull();
  });

  it("sorts the schedule by date and caps it at 14 days", () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({
      date: `2026-06-${String(20 - i).padStart(2, "0")}`,
      type: "OPERATING",
      openingTime: "2026-06-01T09:00:00-04:00",
      closingTime: "2026-06-01T22:00:00-04:00",
    }));
    const hours = normalizeHours("magic-kingdom", schedule(entries));
    expect(hours?.schedule).toHaveLength(14);
    expect(hours?.schedule[0]?.date).toBe("2026-06-01");
    expect(hours?.schedule[13]?.date).toBe("2026-06-14");
  });

  it("normalizes entry types and nulls missing times", () => {
    const hours = normalizeHours(
      "magic-kingdom",
      schedule([
        { date: "2026-05-04", type: "INFO" },
        { date: "2026-05-05", type: "EXTRA_HOURS" },
        { date: "2026-05-06", type: "SOMETHING_ELSE" },
        { date: "2026-05-07", type: "OPERATING" },
      ]),
    );
    expect(hours?.schedule.map((s) => s.type)).toEqual([
      "INFO",
      "EXTRA_HOURS",
      "CLOSED",
      "OPERATING",
    ]);
    expect(hours?.schedule[0]).toMatchObject({ open: null, close: null });
  });

  it("returns an empty schedule and null today when upstream is missing", () => {
    const hours = normalizeHours("epcot", null);
    expect(hours).toMatchObject({
      parkSlug: "epcot",
      timezone: "America/New_York",
      today: null,
      schedule: [],
    });
  });
});

describe("normalizeLive", () => {
  const mkRides = RIDES.filter((r) => r.parkId === "magic-kingdom");
  const spaceMountain = mkRides.find((r) => r.id === "mk-space-mountain")!;

  it("returns null for an unsupported park", () => {
    expect(normalizeLive("nowhere")).toBeNull();
  });

  it("falls back to UNKNOWN attractions when there is no live data", () => {
    const live = normalizeLive("magic-kingdom");
    expect(live?.live).toBe(false);
    expect(live?.attractions).toHaveLength(mkRides.length);
    expect(live?.attractions.every((a) => a.status === "UNKNOWN")).toBe(true);
    expect(live?.attractions.every((a) => a.waitMinutes === null)).toBe(true);
    expect(live?.events).toEqual([]);
  });

  it("layers live wait and status onto the static ride list", () => {
    const upstream: ThemeparksLiveResponse = {
      id: "park",
      name: "Magic Kingdom",
      entityType: "PARK",
      liveData: [
        {
          id: spaceMountain.externalId,
          name: "Space Mountain (upstream name)",
          entityType: "ATTRACTION",
          status: "OPERATING",
          queue: { STANDBY: { waitTime: 45 } },
          lastUpdated: "2026-05-04T17:55:00Z",
        },
      ],
    };
    const live = normalizeLive("magic-kingdom", upstream);
    const attraction = live?.attractions.find(
      (a) => a.slug === "mk-space-mountain",
    );
    expect(live?.live).toBe(true);
    expect(attraction).toMatchObject({
      id: spaceMountain.externalId,
      parkSlug: "magic-kingdom",
      name: "Space Mountain (upstream name)",
      status: "OPERATING",
      waitMinutes: 45,
      lastUpdated: "2026-05-04T17:55:00Z",
    });
    expect(attraction?.coordinates).toEqual({
      lat: spaceMountain.lat,
      lng: spaceMountain.lng,
    });
  });

  it("maps unrecognized or missing upstream statuses to UNKNOWN", () => {
    const live = normalizeLive("magic-kingdom", {
      id: "park",
      name: "Magic Kingdom",
      entityType: "PARK",
      liveData: [
        {
          id: spaceMountain.externalId,
          name: "Space Mountain",
          entityType: "ATTRACTION",
          status: "WEATHER_DELAY" as never,
        },
      ],
    });
    expect(
      live?.attractions.find((a) => a.slug === "mk-space-mountain")?.status,
    ).toBe("UNKNOWN");
  });

  it("nulls the wait when standby is absent", () => {
    const live = normalizeLive("magic-kingdom", {
      id: "park",
      name: "Magic Kingdom",
      entityType: "PARK",
      liveData: [
        {
          id: spaceMountain.externalId,
          name: "Space Mountain",
          entityType: "ATTRACTION",
          status: "DOWN",
          queue: { STANDBY: { waitTime: null } },
        },
      ],
    });
    const attraction = live?.attractions.find(
      (a) => a.slug === "mk-space-mountain",
    );
    expect(attraction?.status).toBe("DOWN");
    expect(attraction?.waitMinutes).toBeNull();
  });

  it("ignores upstream entities that are not in Parkio's ride list", () => {
    const live = normalizeLive("magic-kingdom", {
      id: "park",
      name: "Magic Kingdom",
      entityType: "PARK",
      liveData: [
        {
          id: "unknown-entity",
          name: "Some Restaurant",
          entityType: "RESTAURANT",
          status: "OPERATING",
        },
      ],
    });
    expect(live?.attractions).toHaveLength(mkRides.length);
    expect(live?.attractions.some((a) => a.name === "Some Restaurant")).toBe(
      false,
    );
  });

  it("only returns rides belonging to the requested park", () => {
    const live = normalizeLive("epcot");
    expect(live?.attractions.every((a) => a.parkSlug === "epcot")).toBe(true);
    expect(live?.attractions.every((a) => a.slug.startsWith("ep-"))).toBe(true);
  });

  describe("events", () => {
    function withShowtimes(
      name: string,
      startTimes: (string | undefined)[],
    ): ThemeparksLiveResponse {
      return {
        id: "park",
        name: "Magic Kingdom",
        entityType: "PARK",
        liveData: [
          {
            id: `ent-${name}`,
            name,
            entityType: "SHOW",
            showtimes: startTimes.map((startTime) => ({ startTime })),
          },
        ],
      };
    }

    it("drops past showtimes and sorts the remaining ascending", () => {
      const live = normalizeLive(
        "magic-kingdom",
        withShowtimes("Festival of Fantasy Parade", [
          "2026-05-04T21:00:00-04:00",
          "2026-05-04T09:00:00-04:00", // already past
          "2026-05-04T15:00:00-04:00",
        ]),
      );
      expect(live?.events).toHaveLength(1);
      expect(live?.events[0]?.showtimes).toEqual([
        "2026-05-04T15:00:00-04:00",
        "2026-05-04T21:00:00-04:00",
      ]);
    });

    it("omits entities with no upcoming showtimes", () => {
      const live = normalizeLive(
        "magic-kingdom",
        withShowtimes("Yesterday's Show", ["2026-05-01T21:00:00-04:00"]),
      );
      expect(live?.events).toEqual([]);
    });

    it("ignores blank and unparseable start times", () => {
      const live = normalizeLive(
        "magic-kingdom",
        withShowtimes("Weird Show", [
          undefined,
          "",
          "not-a-timestamp",
          "2026-05-04T20:00:00-04:00",
        ]),
      );
      expect(live?.events[0]?.showtimes).toEqual(["2026-05-04T20:00:00-04:00"]);
    });

    it("categorizes character experiences as meets and everything else as shows", () => {
      const meetNames = [
        "Meet Mickey",
        "Character Greeting at the Hub",
        "Disney Character Experience",
        "Princess Fairytale Hall",
        "Royal Hall",
        "Royal Theater",
        "Town Square Theater",
        "Pete's Silly Sideshow",
        "Epcot Character Spot",
      ];
      for (const name of meetNames) {
        const live = normalizeLive(
          "magic-kingdom",
          withShowtimes(name, ["2026-05-04T20:00:00-04:00"]),
        );
        expect(live?.events[0]?.type, name).toBe("meet");
      }
      const show = normalizeLive(
        "magic-kingdom",
        withShowtimes("Happily Ever After", ["2026-05-04T20:00:00-04:00"]),
      );
      expect(show?.events[0]?.type).toBe("show");
    });

    it("sorts events by their next start time", () => {
      const live = normalizeLive("magic-kingdom", {
        id: "park",
        name: "Magic Kingdom",
        entityType: "PARK",
        liveData: [
          {
            id: "late",
            name: "Fireworks",
            entityType: "SHOW",
            showtimes: [{ startTime: "2026-05-04T21:00:00-04:00" }],
          },
          {
            id: "early",
            name: "Parade",
            entityType: "SHOW",
            showtimes: [{ startTime: "2026-05-04T15:00:00-04:00" }],
          },
        ],
      });
      expect(live?.events.map((e) => e.name)).toEqual(["Parade", "Fireworks"]);
    });

    it("falls back to now for a missing lastUpdated", () => {
      const live = normalizeLive(
        "magic-kingdom",
        withShowtimes("Parade", ["2026-05-04T20:00:00-04:00"]),
      );
      expect(live?.events[0]?.lastUpdated).toBe(NOON_ET.toISOString());
    });
  });
});

describe("findAttractionBySlug", () => {
  it("returns null for an unknown slug", () => {
    expect(findAttractionBySlug("mk-nonexistent")).toBeNull();
  });

  it("returns the static shape for a known slug", () => {
    const ride = RIDES.find((r) => r.id === "mk-pirates")!;
    expect(findAttractionBySlug("mk-pirates")).toEqual({
      id: ride.externalId,
      slug: "mk-pirates",
      parkSlug: "magic-kingdom",
      name: ride.name,
      status: "UNKNOWN",
      waitMinutes: null,
      coordinates: { lat: ride.lat, lng: ride.lng },
      lastUpdated: NOON_ET.toISOString(),
    });
  });
});

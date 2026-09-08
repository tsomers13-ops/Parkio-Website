import { describe, expect, it } from "vitest";

import { startWithThese } from "@/components/park/StartWithThese";
import { attractionCanonicalPath, attractionStaticParams } from "@/lib/attractionRoute";
import { PARKS, RIDES, getPark, getRidesForPark } from "@/lib/data";
import { groupRidesByLand } from "@/lib/lands";
import { isTopRide } from "@/lib/popularity";
import type { Park, ParkId } from "@/lib/types";

/**
 * Mirrors exactly what AttractionsByLand emits: rides are sourced by park
 * inside the component, grouped, then linked with the Slice 2 canonical
 * path helper. Testing the same derivation keeps the invariants honest
 * without needing to render the component.
 */
function discoveryLinks(park: Park): string[] {
  return groupRidesByLand(getRidesForPark(park.id as ParkId))
    .flatMap((g) => g.rides)
    .map((ride) => attractionCanonicalPath(park.id, ride.id));
}

const epcot = getPark("epcot")!;
const dhs = getPark("hollywood-studios")!;

describe("EPCOT discovery", () => {
  it("exposes all 11 attractions exactly once", () => {
    const links = discoveryLinks(epcot);
    expect(links).toHaveLength(11);
    expect(new Set(links).size).toBe(11);
  });

  it("links only to EPCOT attraction URLs", () => {
    for (const href of discoveryLinks(epcot)) {
      expect(href.startsWith("/parks/epcot/attractions/"), href).toBe(true);
    }
  });

  it("includes every EPCOT ride and no others", () => {
    const linked = new Set(
      discoveryLinks(epcot).map((h) => h.split("/").filter(Boolean).pop()),
    );
    const expected = new Set(getRidesForPark("epcot").map((r) => r.id));
    expect(linked).toEqual(expected);
  });

  it("keeps a World Showcase ride's canonical pavilion intact", () => {
    // Grouped under "World Showcase", but the ride itself still knows Norway.
    const frozen = RIDES.find((r) => r.id === "ep-frozen")!;
    expect(frozen.land).toBe("World Showcase — Norway");
    expect(discoveryLinks(epcot)).toContain(
      "/parks/epcot/attractions/ep-frozen/",
    );
  });
});

describe("Hollywood Studios discovery", () => {
  it("exposes all 9 attractions exactly once", () => {
    const links = discoveryLinks(dhs);
    expect(links).toHaveLength(9);
    expect(new Set(links).size).toBe(9);
  });

  it("contains no EPCOT attraction", () => {
    for (const href of discoveryLinks(dhs)) {
      expect(href.includes("/parks/epcot/"), href).toBe(false);
      expect(href.startsWith("/parks/hollywood-studios/attractions/"), href).toBe(
        true,
      );
    }
  });

  it("links Rock 'n' Roller Coaster by its stable slug despite the rename", () => {
    const rnrc = RIDES.find((r) => r.id === "hs-rocknroller")!;
    expect(rnrc.name).toBe("Rock 'n' Roller Coaster Starring The Muppets");
    expect(discoveryLinks(dhs)).toContain(
      "/parks/hollywood-studios/attractions/hs-rocknroller/",
    );
  });
});

describe("internal link invariants — every park", () => {
  const canonical = new Set(
    attractionStaticParams().map((p) => attractionCanonicalPath(p.parkId, p.slug)),
  );

  it("emits zero orphan links — all resolve to a Slice 2 static param", () => {
    for (const park of PARKS) {
      for (const href of discoveryLinks(park)) {
        expect(canonical.has(href), `${park.id} → ${href}`).toBe(true);
      }
    }
  });

  it("emits zero cross-park links", () => {
    for (const park of PARKS) {
      for (const href of discoveryLinks(park)) {
        expect(href.startsWith(`/parks/${park.id}/attractions/`), href).toBe(
          true,
        );
      }
    }
  });

  it("covers every canonical attraction across all parks", () => {
    const all = PARKS.flatMap((p) => discoveryLinks(p));
    expect(all).toHaveLength(RIDES.length);
    expect(new Set(all).size).toBe(RIDES.length);
    expect(new Set(all)).toEqual(canonical);
  });
});

describe("Start with these", () => {
  it("uses the curated set for EPCOT", () => {
    const rides = startWithThese(epcot);
    expect(rides).toHaveLength(6);
    for (const ride of rides) {
      expect(isTopRide("epcot", ride.id), ride.id).toBe(true);
      expect(ride.parkId, ride.id).toBe("epcot");
    }
  });

  it("uses the curated set for Hollywood Studios", () => {
    const rides = startWithThese(dhs);
    expect(rides).toHaveLength(6);
    for (const ride of rides) {
      expect(isTopRide("hollywood-studios", ride.id), ride.id).toBe(true);
      expect(ride.parkId, ride.id).toBe("hollywood-studios");
    }
  });

  it("only ever contains rides from the requested park", () => {
    for (const park of PARKS) {
      for (const ride of startWithThese(park)) {
        expect(ride.parkId, `${park.id}/${ride.id}`).toBe(park.id);
      }
    }
  });

  it("is a subset of the park's own discovery links", () => {
    for (const park of PARKS) {
      const links = new Set(discoveryLinks(park));
      for (const ride of startWithThese(park)) {
        expect(
          links.has(attractionCanonicalPath(park.id, ride.id)),
          ride.id,
        ).toBe(true);
      }
    }
  });

  it("is not ordered by wait time or alphabetically-as-quality", () => {
    const rides = startWithThese(epcot);
    const names = rides.map((r) => r.name);
    expect(names).not.toEqual([...names].sort());
    const waits = rides.map((r) => r.baseWait);
    expect(waits).not.toEqual([...waits].sort((a, b) => b - a));
  });
});

describe("all-six-park compatibility", () => {
  it("groups every park without error and reports stable counts", () => {
    const summary = PARKS.map((park) => {
      const rides = getRidesForPark(park.id as ParkId);
      const groups = groupRidesByLand(rides);
      return {
        park: park.id,
        rides: rides.length,
        rawLands: new Set(rides.map((r) => r.land)).size,
        planningGroups: groups.length,
      };
    });
    for (const row of summary) {
      expect(row.rides, row.park).toBeGreaterThan(0);
      expect(row.planningGroups, row.park).toBeGreaterThan(0);
      // Normalization can only ever merge, never split.
      expect(row.planningGroups, row.park).toBeLessThanOrEqual(row.rawLands);
    }
    // EPCOT is the only park where normalization changes anything.
    const changed = summary.filter((r) => r.planningGroups !== r.rawLands);
    expect(changed.map((r) => r.park)).toEqual(["epcot"]);
  });
});

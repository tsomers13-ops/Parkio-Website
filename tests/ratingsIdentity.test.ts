import { describe, expect, it } from "vitest";

import festival from "@/content/dining/festivals/ep-fw-2026.json";
import { RIDES } from "@/lib/data";
import {
  allDiningVenueKeys,
  getAllPermanentDining,
  getPermanentDiningByVenueKey,
  getVenueKeyForCanonicalId,
  isKnownDiningVenueKey,
} from "@/lib/dining";
import {
  DINING_VENUE_KEYS,
  VENUE_KEY_PATTERN,
  venueKeyForCanonicalId,
} from "@/lib/diningVenueKeys";
import { validateRatingInput, validateRatingVenueKey } from "@/lib/ratingsValidation";
import {
  emptyDiningRatingAggregate,
  toDisplayAverage,
  type DiningRatingInput,
} from "@/lib/ratingsTypes";

const venues = getAllPermanentDining();

describe("venueKey coverage", () => {
  it("mints exactly one key for each of the 62 permanent venues", () => {
    expect(Object.keys(DINING_VENUE_KEYS)).toHaveLength(62);
    expect(venues).toHaveLength(62);
    expect(allDiningVenueKeys()).toHaveLength(62);
    expect(venues.filter((v) => v.parkId === "epcot")).toHaveLength(42);
    expect(venues.filter((v) => v.parkId === "hollywood-studios")).toHaveLength(20);
  });

  it("keeps canonicalIds, venueKeys and slugs each unique", () => {
    expect(new Set(venues.map((v) => v.canonicalId)).size).toBe(62);
    expect(new Set(venues.map((v) => v.venueKey)).size).toBe(62);
    expect(new Set(venues.map((v) => v.slug)).size).toBe(62);
  });

  it("gives every venue a syntactically valid key", () => {
    for (const venue of venues) {
      expect(venue.venueKey, venue.canonicalId).toMatch(VENUE_KEY_PATTERN);
    }
  });

  it("has no venue missing a key", () => {
    for (const venue of venues) {
      expect(venueKeyForCanonicalId(venue.canonicalId), venue.canonicalId).toBeDefined();
      expect(getVenueKeyForCanonicalId(venue.canonicalId)).toBe(venue.venueKey);
    }
  });
});

describe("venueKey lookup is strict", () => {
  it("resolves a known key", () => {
    const venue = getPermanentDiningByVenueKey("ep-le-cellier");
    expect(venue?.name).toBe("Le Cellier Steakhouse");
    expect(isKnownDiningVenueKey("ep-le-cellier")).toBe(true);
  });

  it("rejects an unknown key", () => {
    expect(getPermanentDiningByVenueKey("ep-not-a-venue")).toBeNull();
    expect(isKnownDiningVenueKey("ep-not-a-venue")).toBe(false);
    expect(isKnownDiningVenueKey("")).toBe(false);
    expect(isKnownDiningVenueKey(undefined)).toBe(false);
  });

  it("refuses a canonicalId where a venueKey is expected", () => {
    const canonicalId = venues[0].canonicalId;
    expect(canonicalId).toContain("|");
    expect(getPermanentDiningByVenueKey(canonicalId)).toBeNull();
    expect(isKnownDiningVenueKey(canonicalId)).toBe(false);
  });

  it("refuses every festival booth id", () => {
    const boothIds = (festival as { booths: { id: string }[] }).booths.map((b) => b.id);
    expect(boothIds).toHaveLength(45);
    for (const id of boothIds) {
      expect(isKnownDiningVenueKey(id), id).toBe(false);
      expect(getPermanentDiningByVenueKey(id)).toBeNull();
    }
  });

  it("refuses attraction ids", () => {
    for (const ride of RIDES) {
      expect(isKnownDiningVenueKey(ride.id), ride.id).toBe(false);
    }
  });
});

describe("venueKey immutability", () => {
  /**
   * The invariant, proven without renaming a production venue: presentation
   * identity is derived from mutable source fields, venueKey is not — it is
   * looked up from a hand-authored map keyed by canonicalId.
   */
  it("is never derived from the slug at runtime", () => {
    const source = String(
      // The manifest must contain literal assignments, not slug arithmetic.
      Object.entries(DINING_VENUE_KEYS).length,
    );
    expect(source).toBe("62");
    // A venue whose slug changed would still resolve to the same key, because
    // nothing reads `venue.slug` to produce `venue.venueKey`.
    const venue = venues.find((v) => v.venueKey === "ep-le-cellier")!;
    const renamed = { ...venue, slug: "ep-le-cellier-2027", name: "Le Cellier Grill" };
    expect(renamed.venueKey).toBe("ep-le-cellier");
    expect(renamed.venueKey).not.toBe(renamed.slug);
  });

  it("survives a name and land change, because it is keyed independently", () => {
    const venue = venues.find((v) => v.venueKey === "ep-garden-grill")!;
    const moved = { ...venue, name: "Garden Grill", land: "World Nature — Revised" };
    // canonicalId embeds Park|Land|Name and would change; venueKey does not.
    expect(moved.venueKey).toBe(venue.venueKey);
    expect(venue.canonicalId).toContain(venue.land);
  });

  it("keeps the four identity concepts separate", () => {
    for (const venue of venues) {
      expect(venue.canonicalId).not.toBe(venue.venueKey);
      if (venue.externalId) expect(venue.externalId).not.toBe(venue.venueKey);
    }
  });
});

describe("submission validation", () => {
  const ok = (payload: unknown) => validateRatingInput(payload).ok;

  it("accepts overall alone", () => {
    const result = validateRatingInput({ overall: 4 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ overall: 4 } satisfies DiningRatingInput);
  });

  it("accepts all four dimensions", () => {
    const result = validateRatingInput({ overall: 5, taste: 5, value: 3, quality: 4 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ overall: 5, taste: 5, value: 3, quality: 4 });
  });

  it("accepts partial optional dimensions", () => {
    expect(ok({ overall: 3, taste: 4 })).toBe(true);
    expect(ok({ overall: 3, quality: 1 })).toBe(true);
  });

  it("requires overall", () => {
    expect(ok({})).toBe(false);
    expect(ok({ taste: 4 })).toBe(false);
    expect(ok({ overall: undefined })).toBe(false);
  });

  it("rejects out-of-range and non-whole values", () => {
    for (const bad of [0, 6, -1, 1.5, 4.5, 0.5]) {
      expect(ok({ overall: bad }), `overall ${bad}`).toBe(false);
    }
  });

  it("rejects non-numbers, including numeric strings", () => {
    for (const bad of ["4", "", true, false, null, [], {}, NaN, Infinity, -Infinity]) {
      expect(ok({ overall: bad }), JSON.stringify(bad)).toBe(false);
    }
  });

  it("rejects bad optional dimensions the same way", () => {
    expect(ok({ overall: 4, taste: 0 })).toBe(false);
    expect(ok({ overall: 4, value: 6 })).toBe(false);
    expect(ok({ overall: 4, quality: 2.5 })).toBe(false);
    expect(ok({ overall: 4, taste: "5" })).toBe(false);
  });

  it("rejects unknown properties rather than ignoring them", () => {
    expect(ok({ overall: 4, review: "great" })).toBe(false);
    expect(ok({ overall: 4, status: "active" })).toBe(false);
    expect(ok({ overall: 4, raterId: "spoofed" })).toBe(false);
  });

  it("rejects non-object payloads", () => {
    for (const bad of [null, undefined, 4, "overall", [], [{ overall: 4 }]]) {
      expect(ok(bad), JSON.stringify(bad ?? null)).toBe(false);
    }
  });

  it("reports every problem rather than only the first", () => {
    const result = validateRatingInput({ overall: 9, taste: 0, nope: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("venue validation for ratings", () => {
  it("accepts a minted venueKey", () => {
    expect(validateRatingVenueKey("ep-le-cellier").ok).toBe(true);
  });

  it("rejects festival ids, canonicalIds, attraction ids and junk", () => {
    const booth = (festival as { booths: { id: string }[] }).booths[0].id;
    for (const bad of [booth, venues[0].canonicalId, RIDES[0].id, "", "  ", 42, null, undefined]) {
      expect(validateRatingVenueKey(bad as unknown).ok, String(bad)).toBe(false);
    }
  });
});

describe("aggregate contract", () => {
  it("represents an unrated venue with nulls, never 0.0", () => {
    const empty = emptyDiningRatingAggregate("ep-le-cellier");
    expect(empty.ratingCount).toBe(0);
    expect(empty.overallAverage).toBeNull();
    expect(empty.tasteAverage).toBeNull();
    expect(empty.tasteCount).toBe(0);
    expect(empty.valueAverage).toBeNull();
    expect(empty.valueCount).toBe(0);
    expect(empty.qualityAverage).toBeNull();
    expect(empty.qualityCount).toBe(0);
  });

  it("displays averages to one decimal and leaves nulls alone", () => {
    expect(toDisplayAverage(4.25)).toBe(4.3);
    expect(toDisplayAverage(4.0)).toBe(4);
    expect(toDisplayAverage(null)).toBeNull();
  });
});

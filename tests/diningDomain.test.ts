import { describe, expect, it } from "vitest";

import {
  DINING_CONTENT_FLOOR,
  diningContentScore,
  diningVisibility,
  getAllDiningForPark,
  getAllPermanentDining,
  getIndexablePermanentDining,
  getPermanentDiningBySlug,
  getPermanentDiningForPark,
  getPermanentDiningProvenance,
  isDiningParkId,
  meetsDiningContentFloor,
} from "@/lib/dining";
import { DINING_TYPES, diningTypeLabel, isFestivalBooth, isPermanent, menuItemKindLabel } from "@/lib/diningTypes";
import {
  boothWindow,
  getActiveFestivalDiningForPark,
  getAllFestivalBooths,
  getBoothStatus,
  getFestival,
  getFestivalStatus,
  getFestivals,
  getSeasonalDiningForPark,
  isHostedBooth,
  parkLocalDate,
  resolveFestivalHost,
  statusForWindow,
} from "@/lib/seasonalDining";

const venues = getAllPermanentDining();
const booths = getAllFestivalBooths();
const festival = getFestivals()[0];

describe("permanent dining", () => {
  it("loads the 62 supported venues", () => {
    expect(venues).toHaveLength(62);
    expect(getPermanentDiningForPark("epcot")).toHaveLength(42);
    expect(getPermanentDiningForPark("hollywood-studios")).toHaveLength(20);
    expect(getPermanentDiningProvenance().entityCount).toBe(62);
  });

  it("tags every venue as permanent", () => {
    for (const venue of venues) {
      expect(venue.kind).toBe("permanent");
      expect(isPermanent(venue)).toBe(true);
      expect(isFestivalBooth(venue)).toBe(false);
    }
  });

  it("resolves a venue by park and slug", () => {
    const venue = getPermanentDiningBySlug("epcot", "ep-garden-grill");
    expect(venue?.name).toBe("Garden Grill Restaurant");
    expect(venue?.parkId).toBe("epcot");
  });

  it("refuses a cross-park slug rather than rendering it", () => {
    expect(getPermanentDiningBySlug("epcot", "hs-brown-derby")).toBeNull();
    expect(getPermanentDiningBySlug("hollywood-studios", "ep-garden-grill")).toBeNull();
    expect(getPermanentDiningBySlug("epcot", "not-a-venue")).toBeNull();
  });

  it("rejects parks without dining coverage", () => {
    expect(isDiningParkId("epcot")).toBe(true);
    expect(isDiningParkId("magic-kingdom")).toBe(false);
    expect(getPermanentDiningForPark("magic-kingdom")).toEqual([]);
    expect(getPermanentDiningBySlug("magic-kingdom", "ep-garden-grill")).toBeNull();
  });

  it("treats missing editorial as a first-class state", () => {
    const withEditorial = venues.filter((v) => v.editorial !== undefined);
    const factualOnly = venues.filter((v) => v.editorial === undefined);
    expect(withEditorial).toHaveLength(13);
    expect(factualOnly).toHaveLength(49);
    // Factual-only venues stay complete, usable records — never null-filled.
    for (const venue of factualOnly) {
      expect(venue.name.trim()).not.toBe("");
      expect(venue.land.trim()).not.toBe("");
      expect(venue.editorial).toBeUndefined();
    }
  });

  it("treats coordinates as optional and always paired", () => {
    expect(venues.filter((v) => v.latitude !== undefined)).toHaveLength(56);
    for (const venue of venues) {
      expect(venue.latitude !== undefined).toBe(venue.longitude !== undefined);
    }
  });

  it("maps machine dining types to labels without mutating them", () => {
    for (const venue of venues) expect(DINING_TYPES as readonly string[]).toContain(venue.type);
    expect(diningTypeLabel("quickService")).toBe("Quick Service");
    expect(diningTypeLabel("snackStand")).toBe("Snack & Kiosk");
    expect(diningTypeLabel("tableService")).toBe("Table Service");
    expect(diningTypeLabel("lounge")).toBe("Lounge");
  });

  it("orders a park's venues by land then name", () => {
    const epcot = getPermanentDiningForPark("epcot");
    const keys = epcot.map((v) => `${v.land}|${v.name}`);
    expect(keys).toEqual([...keys].sort());
  });
});

describe("content floor", () => {
  const pass = venues.filter(meetsDiningContentFloor);
  const fail = venues.filter((v) => !meetsDiningContentFloor(v));

  it("uses a floor of 3 evergreen signals", () => {
    expect(DINING_CONTENT_FLOOR).toBe(3);
  });

  it("passes exactly 13 of 62 venues", () => {
    expect(pass).toHaveLength(13);
    expect(fail).toHaveLength(49);
    expect(pass.filter((v) => v.parkId === "epcot")).toHaveLength(7);
    expect(pass.filter((v) => v.parkId === "hollywood-studios")).toHaveLength(6);
  });

  it("sits in an empty band, so no venue is a borderline case", () => {
    const scores = venues.map(diningContentScore);
    expect(scores.filter((s) => s === 3 || s === 4)).toHaveLength(0);
    expect(Math.min(...scores)).toBe(1);
    expect(Math.max(...scores)).toBe(7);
  });

  it("never counts live operational status as evergreen substance", () => {
    // 48 venues carry coordinate + externalId and nothing else; that is a
    // directory entry, not an indexable page.
    const directoryOnly = venues.filter(
      (v) => v.editorial === undefined && v.latitude !== undefined && v.externalId,
    );
    expect(directoryOnly).toHaveLength(48);
    for (const venue of directoryOnly) expect(diningContentScore(venue)).toBe(2);
  });

  it("is deterministic and matches getIndexablePermanentDining", () => {
    expect(getIndexablePermanentDining()).toHaveLength(13);
    expect(getIndexablePermanentDining("epcot")).toHaveLength(7);
    expect(getIndexablePermanentDining("hollywood-studios")).toHaveLength(6);
    expect(venues.map(diningContentScore)).toEqual(venues.map(diningContentScore));
  });

  it("keeps every venue discoverable and routable, and only gates indexing", () => {
    for (const venue of venues) {
      const v = diningVisibility(venue);
      expect(v.discoverable).toBe(true);
      expect(v.routable).toBe(true);
      expect(v.indexable).toBe(v.score >= DINING_CONTENT_FLOOR);
    }
    expect(venues.filter((v) => diningVisibility(v).indexable)).toHaveLength(13);
  });

  it("names the exact venues held back from indexing", () => {
    const slugs = fail.map((v) => v.slug).sort();
    expect(slugs).toHaveLength(49);
    // Spot-check both ends: the single 1-signal venue and a 2-signal one.
    expect(slugs).toContain("ep-space-220-lounge");
    expect(slugs).toContain("hs-brown-derby");
    expect(slugs).not.toContain("ep-tangierine-cafe");
  });
});

describe("seasonal dining", () => {
  it("loads the 45 verified festival records", () => {
    expect(booths).toHaveLength(45);
    expect(getSeasonalDiningForPark("epcot")).toHaveLength(45);
    expect(getSeasonalDiningForPark("hollywood-studios")).toHaveLength(0);
  });

  it("tags every booth as a festival booth in the festival's park", () => {
    for (const booth of booths) {
      expect(booth.kind).toBe("festivalBooth");
      expect(isFestivalBooth(booth)).toBe(true);
      expect(isPermanent(booth)).toBe(false);
      expect(booth.parkId).toBe("epcot");
      expect(booth.festivalId).toBe(festival.id);
    }
  });

  it("carries no coordinates at all", () => {
    // The type has no coordinate fields; assert the loaded data agrees, so a
    // future source change cannot smuggle a guessed pin past the domain layer.
    for (const booth of booths) {
      const raw = booth as unknown as Record<string, unknown>;
      expect(raw.latitude).toBeUndefined();
      expect(raw.longitude).toBeUndefined();
    }
  });

  it("computes lifecycle from explicit dates only", () => {
    expect(statusForWindow("2026-08-27", "2026-11-21", "2026-08-26")).toBe("upcoming");
    expect(statusForWindow("2026-08-27", "2026-11-21", "2026-08-27")).toBe("active");
    expect(statusForWindow("2026-08-27", "2026-11-21", "2026-11-21")).toBe("active");
    expect(statusForWindow("2026-08-27", "2026-11-21", "2026-11-22")).toBe("expired");
    expect(getFestivalStatus(festival, "2026-09-08")).toBe("active");
    expect(JSON.stringify(booths)).not.toContain("isActive");
  });

  it("inherits the festival window unless a booth overrides it", () => {
    const inherited = booths.find((b) => !b.startsOn && !b.endsOn)!;
    expect(boothWindow(inherited, festival)).toEqual(["2026-08-27", "2026-11-21"]);

    const overrides = booths.filter((b) => b.startsOn || b.endsOn);
    expect(overrides).toHaveLength(5);
    const alps = booths.find((b) => b.name === "The Alps")!;
    expect(boothWindow(alps, festival)).toEqual(["2026-10-02", "2026-11-21"]);
    expect(getBoothStatus(alps, "2026-09-08")).toBe("upcoming");
    expect(getBoothStatus(alps, "2026-10-02")).toBe("active");
  });

  it("never lets a booth outlive its festival", () => {
    for (const booth of booths) expect(getBoothStatus(booth, "2026-12-25")).toBe("expired");
    for (const booth of booths) expect(getBoothStatus(booth, "2026-01-01")).toBe("upcoming");
  });

  it("selects active booths for an explicit date", () => {
    expect(getActiveFestivalDiningForPark("epcot", "2026-09-08")).toHaveLength(40);
    expect(getActiveFestivalDiningForPark("epcot", "2026-10-02")).toHaveLength(45);
    expect(getActiveFestivalDiningForPark("epcot", "2026-08-01")).toHaveLength(0);
    expect(getActiveFestivalDiningForPark("epcot", "2026-12-01")).toHaveLength(0);
  });

  it("derives the park-local date rather than the viewer's", () => {
    expect(parkLocalDate(new Date("2026-11-22T02:00:00Z"))).toBe("2026-11-21");
  });

  it("resolves the festival by id", () => {
    expect(getFestival("ep-fw-2026")?.name).toBe("EPCOT International Food & Wine Festival");
    expect(getFestival("ep-fw-2025")).toBeUndefined();
  });
});

describe("festival host relationship", () => {
  const hosted = booths.filter(isHostedBooth);

  it("links the 9 permanent-venue hosts without duplicating them", () => {
    expect(hosted).toHaveLength(9);
    for (const booth of hosted) {
      const host = resolveFestivalHost(booth, venues);
      expect(host, booth.id).not.toBeNull();
      expect(host!.kind).toBe("permanent");
      expect(host!.canonicalId).toBe(booth.venueCanonicalId);
      // Identities stay separate: the booth is not the venue.
      expect(booth.id).not.toBe(host!.canonicalId);
    }
  });

  it("returns null for a standalone marketplace", () => {
    const standalone = booths.find((b) => !b.venueCanonicalId)!;
    expect(resolveFestivalHost(standalone, venues)).toBeNull();
  });

  it("returns null rather than throwing on an unresolvable link", () => {
    const broken = { ...hosted[0], venueCanonicalId: "EPCOT|Nowhere|Invented" };
    expect(resolveFestivalHost(broken, venues)).toBeNull();
  });

  it("does not copy permanent venue data into the booth", () => {
    for (const booth of hosted) {
      expect(booth).not.toHaveProperty("slug");
      expect(booth).not.toHaveProperty("editorial");
      expect(booth).not.toHaveProperty("land");
    }
  });
});

describe("menu model", () => {
  const items = booths.flatMap((b) => b.menu);

  it("carries the 241 verified items", () => {
    expect(items).toHaveLength(241);
    expect(booths.filter((b) => b.menu.length === 0)).toHaveLength(0);
  });

  it("preserves Disney's exact price text and never invents a number", () => {
    for (const item of items) {
      if (!item.price) continue;
      expect(item.price.display.trim()).not.toBe("");
      if (/^\$\d+(\.\d{2})?$/.test(item.price.display)) {
        expect(item.price.amountUSD).toBeGreaterThan(0);
      } else {
        expect(item.price.amountUSD).toBeUndefined();
      }
    }
    const ranged = items.filter((i) => i.price?.display.includes(" to "));
    expect(ranged.length).toBeGreaterThan(0);
    for (const item of ranged) expect(item.price!.amountUSD).toBeUndefined();
  });

  it("keeps itemKind optional and never guesses one", () => {
    const unclassified = items.filter((i) => i.itemKind === undefined);
    expect(unclassified).toHaveLength(7);
    expect(menuItemKindLabel(undefined)).toBeUndefined();
    expect(menuItemKindLabel("alcoholicBeverage")).toBe("Alcoholic");
  });

  it("exposes alcoholic items as facts rather than hiding or ranking them", () => {
    const alcoholic = items.filter((i) => i.itemKind === "alcoholicBeverage");
    expect(alcoholic).toHaveLength(121);
    expect(items.filter((i) => i.itemKind === "food")).toHaveLength(92);
    expect(items.filter((i) => i.itemKind === "nonAlcoholicBeverage")).toHaveLength(21);
  });

  it("keeps plantBased optional and absent unless Disney labelled it", () => {
    expect(items.filter((i) => i.plantBased)).toHaveLength(9);
    expect(items.every((i) => i.allergenSafeFor === undefined)).toBe(true);
  });
});

describe("combined park dining", () => {
  it("keeps permanent and seasonal in separate buckets", () => {
    const dining = getAllDiningForPark("epcot", "2026-09-08");
    expect(dining.permanent).toHaveLength(42);
    expect(dining.festival).toHaveLength(40);
    for (const v of dining.permanent) expect(v.kind).toBe("permanent");
    for (const b of dining.festival) expect(b.kind).toBe("festivalBooth");
  });

  it("includes no seasonal records outside the festival window", () => {
    expect(getAllDiningForPark("epcot", "2026-06-01").festival).toHaveLength(0);
    expect(getAllDiningForPark("epcot", "2026-06-01").permanent).toHaveLength(42);
  });

  it("never duplicates a permanent identity when a host link exists", () => {
    const dining = getAllDiningForPark("epcot", "2026-09-08");
    const canonicalIds = dining.permanent.map((v) => v.canonicalId);
    expect(new Set(canonicalIds).size).toBe(canonicalIds.length);

    const hostedIds = dining.festival
      .map((b) => b.venueCanonicalId)
      .filter((id): id is string => Boolean(id));
    for (const id of hostedIds) {
      // The venue appears exactly once, and only as permanent.
      expect(canonicalIds.filter((c) => c === id)).toHaveLength(1);
    }
    // No booth is emitted into the permanent bucket.
    for (const b of dining.festival) expect(canonicalIds).not.toContain(b.id);
  });

  it("returns empty buckets for a park without dining coverage", () => {
    const dining = getAllDiningForPark("magic-kingdom", "2026-09-08");
    expect(dining.permanent).toEqual([]);
    expect(dining.festival).toEqual([]);
  });
});

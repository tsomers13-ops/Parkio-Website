import { describe, expect, it } from "vitest";

import permanent from "@/lib/generated/dining.json";
import festival from "@/content/dining/festivals/ep-fw-2026.json";
import {
  SUPPORTED_ITEM_KINDS,
  boothWindow,
  lifecycleState,
  parkLocalDate,
  validateFestival,
  type FestivalDocument,
} from "@/scripts/festivalDining";

const doc = festival as unknown as FestivalDocument;
const permanentIds = new Set(permanent.venues.map((v) => v.canonicalId));
const clone = () => JSON.parse(JSON.stringify(doc)) as FestivalDocument;

describe("festival source file", () => {
  it("parses and validates with no UI code involved", () => {
    expect(validateFestival(doc, permanentIds)).toEqual([]);
  });

  it("describes the 2026 EPCOT Food & Wine Festival", () => {
    expect(doc.festival.id).toBe("ep-fw-2026");
    expect(doc.festival.parkId).toBe("epcot");
    expect(doc.festival.edition).toBe(2026);
    expect(doc.festival.startsOn).toBe("2026-08-27");
    expect(doc.festival.endsOn).toBe("2026-11-21");
    expect(doc.festival.timeZone).toBe("America/New_York");
  });

  it("scopes every id to the festival edition so history is never overwritten", () => {
    for (const booth of doc.booths) {
      expect(booth.id.startsWith("ep-fw-2026-"), booth.id).toBe(true);
      for (const item of booth.menu) expect(item.id.startsWith(`${booth.id}-`)).toBe(true);
    }
  });

  it("keeps provenance counts honest", () => {
    expect(doc.provenance.boothCount).toBe(doc.booths.length);
    expect(doc.provenance.menuItemCount).toBe(
      doc.booths.reduce((n, b) => n + b.menu.length, 0),
    );
    expect(doc.provenance.sourceUrls.length).toBeGreaterThan(0);
    expect(doc.provenance.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("retains location text for every booth", () => {
    for (const booth of doc.booths) expect(booth.locationText.trim()).not.toBe("");
  });

  it("records no coordinates, because Disney publishes none", () => {
    for (const booth of doc.booths) {
      expect(booth.latitude).toBeUndefined();
      expect(booth.longitude).toBeUndefined();
    }
  });

  it("uses no isActive flag anywhere", () => {
    expect(JSON.stringify(doc)).not.toContain("isActive");
  });
});

describe("permanent venue hosts", () => {
  const hosts = doc.booths.filter((b) => b.venueCanonicalId);

  it("links hosted offerings to real permanent venues", () => {
    expect(hosts).toHaveLength(4);
    for (const host of hosts) expect(permanentIds.has(host.venueCanonicalId!)).toBe(true);
  });

  it("never represents the same permanent venue twice", () => {
    const ids = hosts.map((h) => h.venueCanonicalId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rejects a venueCanonicalId that does not resolve", () => {
    const bad = clone();
    bad.booths.find((b) => b.venueCanonicalId)!.venueCanonicalId = "EPCOT|Nowhere|Invented Venue";
    expect(validateFestival(bad, permanentIds).some((e) => e.includes("does not resolve"))).toBe(true);
  });
});

describe("lifecycle", () => {
  it("inherits the festival window when a booth has no override", () => {
    const inherited = doc.booths.find((b) => !b.startsOn && !b.endsOn)!;
    expect(boothWindow(doc, inherited)).toEqual(["2026-08-27", "2026-11-21"]);
  });

  it("honours booth-level overrides", () => {
    const earthEats = doc.booths.find((b) => b.name === "Earth Eats")!;
    expect(boothWindow(doc, earthEats)).toEqual(["2026-10-02", "2026-11-21"]);
    const wedge = doc.booths.find((b) => b.name.startsWith("The Wedge"))!;
    expect(boothWindow(doc, wedge)).toEqual(["2026-09-18", "2026-11-08"]);
  });

  it("classifies upcoming, active and expired from dates alone", () => {
    expect(lifecycleState("2026-08-27", "2026-11-21", "2026-08-26")).toBe("upcoming");
    expect(lifecycleState("2026-08-27", "2026-11-21", "2026-08-27")).toBe("active");
    expect(lifecycleState("2026-08-27", "2026-11-21", "2026-11-21")).toBe("active");
    expect(lifecycleState("2026-08-27", "2026-11-21", "2026-11-22")).toBe("expired");
  });

  it("derives the park-local date, not the viewer's", () => {
    expect(parkLocalDate(new Date("2026-11-22T02:00:00Z"))).toBe("2026-11-21");
  });

  it("rejects an override that inverts or escapes the festival window", () => {
    const inverted = clone();
    inverted.booths[0].startsOn = "2026-11-01";
    inverted.booths[0].endsOn = "2026-09-01";
    expect(validateFestival(inverted, permanentIds).length).toBeGreaterThan(0);

    const escaping = clone();
    escaping.booths[0].endsOn = "2026-12-25";
    expect(validateFestival(escaping, permanentIds).some((e) => e.includes("extends past"))).toBe(true);
  });
});

describe("menu", () => {
  const items = doc.booths.flatMap((b) => b.menu);

  it("captures 176 items across the booths with published menus", () => {
    expect(items).toHaveLength(176);
    expect(doc.booths.filter((b) => b.menu.length === 0)).toHaveLength(5);
  });

  it("always keeps the exact printed price and only parses clean single amounts", () => {
    for (const item of items) {
      if (!item.price) continue;
      expect(item.price.display.trim()).not.toBe("");
      if (item.price.display.includes(" to ")) {
        expect(item.price.amountUSD).toBeUndefined();
      } else {
        expect(item.price.amountUSD).toBeGreaterThan(0);
      }
    }
    expect(items.some((i) => i.price?.display.includes(" to "))).toBe(true);
  });

  it("uses only Disney's own item categories", () => {
    for (const item of items) {
      if (item.itemKind === undefined) continue;
      expect(SUPPORTED_ITEM_KINDS as readonly string[]).toContain(item.itemKind);
    }
  });

  it("marks plantBased only where Disney labels it, and never infers diet", () => {
    const plant = items.filter((i) => i.plantBased);
    expect(plant.length).toBeGreaterThan(0);
    for (const item of plant) expect(item.plantBased).toBe(true);
    const serialized = JSON.stringify(doc);
    for (const field of ["vegetarian", "vegan", "glutenFree", "dairyFree", "nutFree"]) {
      expect(serialized).not.toContain(`"${field}"`);
    }
  });

  it("omits allergenSafeFor rather than half-populating it", () => {
    expect(items.every((i) => i.allergenSafeFor === undefined)).toBe(true);
  });

  it("rejects duplicate booth ids", () => {
    const bad = clone();
    bad.booths.push({ ...bad.booths[0] });
    bad.provenance.boothCount += 1;
    bad.provenance.menuItemCount += bad.booths[0].menu.length;
    expect(validateFestival(bad, permanentIds).some((e) => e.includes("duplicate booth id"))).toBe(true);
  });

  it("rejects duplicate menu item ids", () => {
    const bad = clone();
    const booth = bad.booths.find((b) => b.menu.length > 0)!;
    booth.menu.push({ ...booth.menu[0] });
    bad.provenance.menuItemCount += 1;
    expect(validateFestival(bad, permanentIds).some((e) => e.includes("duplicate menu item id"))).toBe(true);
  });

  it("rejects an empty item name and a negative amount", () => {
    const bad = clone();
    const booth = bad.booths.find((b) => b.menu.length > 0)!;
    booth.menu[0].name = "  ";
    booth.menu[0].price = { display: "$1.00", amountUSD: -1 };
    const errors = validateFestival(bad, permanentIds);
    expect(errors.some((e) => e.includes("empty item name"))).toBe(true);
    expect(errors.some((e) => e.includes("amountUSD"))).toBe(true);
  });

  it("rejects mismatched provenance counts", () => {
    const bad = clone();
    bad.provenance.menuItemCount = 999;
    expect(validateFestival(bad, permanentIds).some((e) => e.includes("menuItemCount"))).toBe(true);
  });

  it("requires a sourceNote when a verified booth has no published menu", () => {
    const bad = clone();
    const empty = bad.booths.find((b) => b.menu.length === 0)!;
    delete (empty as { sourceNote?: string }).sourceNote;
    expect(validateFestival(bad, permanentIds).some((e) => e.includes("sourceNote"))).toBe(true);
  });
});

describe("permanent dining isolation", () => {
  it("leaves the permanent dataset at exactly 62 venues", () => {
    expect(permanent.entityCount).toBe(62);
    expect(permanent.venues).toHaveLength(62);
    expect(permanent.venues.filter((v) => v.parkId === "epcot")).toHaveLength(42);
    expect(permanent.venues.filter((v) => v.parkId === "hollywood-studios")).toHaveLength(20);
  });

  it("never merges festival booths into the permanent venue list", () => {
    const permanentIdSet = new Set(permanent.venues.map((v) => v.canonicalId));
    for (const booth of doc.booths) expect(permanentIdSet.has(booth.id)).toBe(false);
    expect(JSON.stringify(permanent)).not.toContain("festivalBooth");
  });
});

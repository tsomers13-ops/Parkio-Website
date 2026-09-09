import { describe, expect, it } from "vitest";

import {
  getAllPermanentDining,
  getIndexablePermanentDining,
  getPermanentDiningForPark,
  groupPermanentDiningByArea,
  meetsDiningContentFloor,
} from "@/lib/dining";
import {
  diningCanonicalPath,
  diningParkStaticParams,
  diningStaticParams,
  diningVenueDescription,
  parkDiningPath,
  resolveDiningVenue,
} from "@/lib/diningRoute";
import { diningTypeLabel } from "@/lib/diningTypes";
import {
  getBoothStatus,
  getSeasonalDiningForPark,
} from "@/lib/seasonalDining";
import sitemap from "@/app/sitemap";

describe("dining discovery routing", () => {
  it("generates a discovery page for each supported park only", () => {
    expect(diningParkStaticParams().map((p) => p.parkId)).toEqual([
      "epcot",
      "hollywood-studios",
    ]);
  });

  it("routes all 62 permanent venues", () => {
    const params = diningStaticParams();
    expect(params).toHaveLength(62);
    expect(params.filter((p) => p.parkId === "epcot")).toHaveLength(42);
    expect(params.filter((p) => p.parkId === "hollywood-studios")).toHaveLength(20);
    expect(new Set(params.map((p) => `${p.parkId}/${p.slug}`)).size).toBe(62);
  });

  it("resolves every generated param to a real venue", () => {
    for (const { parkId, slug } of diningStaticParams()) {
      const resolved = resolveDiningVenue(parkId, slug);
      expect(resolved, `${parkId}/${slug}`).not.toBeNull();
      expect(resolved!.venue.parkId).toBe(parkId);
    }
  });

  it("404s a cross-park slug rather than rendering it", () => {
    expect(resolveDiningVenue("epcot", "hs-brown-derby")).toBeNull();
    expect(resolveDiningVenue("hollywood-studios", "ep-garden-grill")).toBeNull();
  });

  it("404s an unknown slug and an unsupported park", () => {
    expect(resolveDiningVenue("epcot", "not-a-venue")).toBeNull();
    expect(resolveDiningVenue("magic-kingdom", "ep-garden-grill")).toBeNull();
  });

  it("builds canonical paths with the trailing slash the app serves", () => {
    expect(parkDiningPath("epcot")).toBe("/parks/epcot/dining/");
    expect(diningCanonicalPath("epcot", "ep-garden-grill")).toBe(
      "/parks/epcot/dining/ep-garden-grill/",
    );
  });

  it("never puts a slug or park it does not own into a description", () => {
    const venue = getPermanentDiningForPark("epcot")[0];
    const text = diningVenueDescription(
      { id: "epcot", name: "EPCOT" } as never,
      venue,
      diningTypeLabel(venue.type),
    );
    expect(text).toContain(venue.name);
    expect(text).toContain(venue.land);
    expect(text).not.toContain("undefined");
  });
});

describe("dining grouping and filters", () => {
  it("groups EPCOT and Hollywood Studios without losing a venue", () => {
    for (const parkId of ["epcot", "hollywood-studios"] as const) {
      const venues = getPermanentDiningForPark(parkId);
      const groups = groupPermanentDiningByArea(venues);
      expect(groups.reduce((n, g) => n + g.venues.length, 0)).toBe(venues.length);
      expect(new Set(groups.map((g) => g.name)).size).toBe(groups.length);
      for (const group of groups) expect(group.venues.length).toBeGreaterThan(0);
    }
  });

  it("collapses EPCOT World Showcase pavilions into one planning area", () => {
    const groups = groupPermanentDiningByArea(getPermanentDiningForPark("epcot"));
    const showcase = groups.find((g) => g.name === "World Showcase");
    expect(showcase).toBeDefined();
    expect(showcase!.venues.length).toBeGreaterThan(20);
  });

  it("supports every service-type filter with real results", () => {
    const epcot = getPermanentDiningForPark("epcot");
    for (const type of ["quickService", "tableService", "snackStand", "lounge"] as const) {
      expect(epcot.filter((v) => v.type === type).length).toBeGreaterThan(0);
    }
  });

  it("renders factual-only venues with no editorial fields", () => {
    const factualOnly = getAllPermanentDining().filter((v) => v.editorial === undefined);
    expect(factualOnly).toHaveLength(49);
    for (const venue of factualOnly) {
      expect(venue.name.trim()).not.toBe("");
      expect(diningTypeLabel(venue.type)).toBeTruthy();
      expect(venue.editorial?.shortVerdict).toBeUndefined();
    }
  });

  it("gives the 13 reviewed venues their editorial payload", () => {
    const reviewed = getAllPermanentDining().filter((v) => v.editorial !== undefined);
    expect(reviewed).toHaveLength(13);
    for (const venue of reviewed) {
      expect(venue.editorial!.shortVerdict.trim()).not.toBe("");
      expect(venue.editorial!.parkioScore).toBeGreaterThan(0);
    }
  });
});

describe("festival experience data", () => {
  const booths = getSeasonalDiningForPark("epcot");

  it("has all 45 records available to EPCOT only", () => {
    expect(booths).toHaveLength(45);
    expect(getSeasonalDiningForPark("hollywood-studios")).toHaveLength(0);
  });

  it("shows active and upcoming, and excludes expired, for an explicit date", () => {
    const shown = (date: string) =>
      booths.filter((b) => getBoothStatus(b, date) !== "expired");
    expect(shown("2026-09-08")).toHaveLength(45);
    expect(booths.filter((b) => getBoothStatus(b, "2026-09-08") === "active")).toHaveLength(40);
    expect(booths.filter((b) => getBoothStatus(b, "2026-09-08") === "upcoming")).toHaveLength(5);
    expect(shown("2026-12-01")).toHaveLength(0);
  });

  it("keeps every booth's menu renderable with exact Disney prices", () => {
    const items = booths.flatMap((b) => b.menu);
    expect(items).toHaveLength(241);
    for (const item of items) {
      expect(item.name.trim()).not.toBe("");
      if (item.price?.display.includes(" to ")) {
        expect(item.price.amountUSD).toBeUndefined();
      }
    }
    expect(items.some((i) => i.price?.display.includes(" to "))).toBe(true);
    expect(items.filter((i) => i.plantBased)).toHaveLength(9);
  });

  it("links the 9 permanent hosts without duplicating the venue", () => {
    const hosted = booths.filter((b) => b.venueCanonicalId);
    expect(hosted).toHaveLength(9);
    const permanentIds = new Set(getAllPermanentDining().map((v) => v.canonicalId));
    for (const booth of hosted) expect(permanentIds.has(booth.venueCanonicalId!)).toBe(true);
    // A hosted booth never becomes a routable permanent page of its own.
    const slugs = new Set(diningStaticParams().map((p) => p.slug));
    for (const booth of booths) expect(slugs.has(booth.id)).toBe(false);
  });
});

describe("indexability and sitemap", () => {
  const entries = sitemap();
  const diningUrls = entries.filter((e) => e.url.includes("/dining"));

  it("indexes exactly the content-floor-qualified venues", () => {
    expect(getIndexablePermanentDining()).toHaveLength(13);
    for (const venue of getIndexablePermanentDining()) {
      expect(meetsDiningContentFloor(venue)).toBe(true);
    }
  });

  it("contributes exactly 15 dining URLs: 2 discovery + 13 detail", () => {
    expect(diningUrls).toHaveLength(15);
    const discovery = diningUrls.filter((e) => e.url.endsWith("/dining/"));
    expect(discovery).toHaveLength(2);
    expect(diningUrls.length - discovery.length).toBe(13);
  });

  it("omits every thin venue from the sitemap", () => {
    const thin = getAllPermanentDining().filter((v) => !meetsDiningContentFloor(v));
    expect(thin).toHaveLength(49);
    for (const venue of thin) {
      expect(diningUrls.some((e) => e.url.includes(`/dining/${venue.slug}/`))).toBe(false);
    }
  });

  it("never lists a festival booth", () => {
    const boothIds = getSeasonalDiningForPark("epcot").map((b) => b.id);
    for (const id of boothIds) {
      expect(entries.some((e) => e.url.includes(id))).toBe(false);
    }
    expect(entries.filter((e) => e.url.toLowerCase().includes("festival"))).toHaveLength(0);
  });

  it("keeps the 84 attraction URLs intact", () => {
    expect(entries.filter((e) => e.url.includes("/attractions/"))).toHaveLength(84);
  });
});

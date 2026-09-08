import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildAttractionJsonLd,
  buildBreadcrumbJsonLd,
  serializeJsonLd,
} from "@/components/attraction/AttractionJsonLd";
import { attractionCanonicalPath } from "@/lib/attractionRoute";
import { PARKS, RIDES, getPark, getRide } from "@/lib/data";

const SITE = "https://parkio.info";
const epcot = getPark("epcot")!;
const guardians = getRide("ep-guardians")!;
const dhs = getPark("hollywood-studios")!;
const rnrc = getRide("hs-rocknroller")!;

/** Fields we must never assert without evidence. */
const FORBIDDEN = [
  "aggregateRating",
  "review",
  "offers",
  "priceRange",
  "openingHours",
  "image",
  "publicAccess",
  "touristType",
  "isAccessibleForFree",
  "duration",
];

describe("BreadcrumbList", () => {
  const crumb = buildBreadcrumbJsonLd(epcot, guardians) as any;

  it("declares the right type and context", () => {
    expect(crumb["@context"]).toBe("https://schema.org");
    expect(crumb["@type"]).toBe("BreadcrumbList");
  });

  it("orders Parks → Park → Attraction", () => {
    const items = crumb.itemListElement;
    expect(items).toHaveLength(3);
    expect(items.map((i: any) => i.position)).toEqual([1, 2, 3]);
    expect(items.map((i: any) => i.name)).toEqual([
      "Parks",
      "EPCOT",
      "Guardians of the Galaxy: Cosmic Rewind",
    ]);
  });

  it("uses canonical URLs at every level", () => {
    const items = crumb.itemListElement;
    expect(items[0].item).toBe(`${SITE}/parks/`);
    expect(items[1].item).toBe(`${SITE}/parks/epcot/`);
    expect(items[2].item).toBe(
      `${SITE}${attractionCanonicalPath("epcot", "ep-guardians")}`,
    );
    for (const item of items) {
      expect(item.item.endsWith("/"), item.item).toBe(true);
    }
  });

  it("never emits a cross-park URL", () => {
    for (const ride of RIDES) {
      const park = getPark(ride.parkId)!;
      const items = (buildBreadcrumbJsonLd(park, ride) as any).itemListElement;
      expect(items[1].item, ride.id).toBe(`${SITE}/parks/${ride.parkId}/`);
      expect(items[2].item, ride.id).toContain(`/parks/${ride.parkId}/`);
      for (const other of PARKS) {
        if (other.id === ride.parkId) continue;
        expect(items[2].item, ride.id).not.toContain(`/parks/${other.id}/`);
      }
    }
  });
});

describe("TouristAttraction", () => {
  const node = buildAttractionJsonLd(epcot, guardians) as any;

  it("carries only the evidenced fields", () => {
    expect(node["@type"]).toBe("TouristAttraction");
    expect(node.name).toBe(guardians.name);
    expect(node.description).toBe(guardians.description);
    expect(node.url).toBe(
      `${SITE}${attractionCanonicalPath("epcot", "ep-guardians")}`,
    );
    expect(node.geo).toEqual({
      "@type": "GeoCoordinates",
      latitude: guardians.lat,
      longitude: guardians.lng,
    });
    expect(node.containedInPlace.name).toBe("EPCOT");
    expect(node.containedInPlace.url).toBe(`${SITE}/parks/epcot/`);
  });

  it("asserts nothing the dataset cannot support, for any ride", () => {
    for (const ride of RIDES) {
      const park = getPark(ride.parkId)!;
      const serialized = serializeJsonLd(buildAttractionJsonLd(park, ride));
      for (const field of FORBIDDEN) {
        expect(serialized, `${ride.id}: ${field}`).not.toContain(field);
      }
    }
  });

  it("takes geo straight from the canonical ride record", () => {
    for (const ride of RIDES) {
      const park = getPark(ride.parkId)!;
      const node = buildAttractionJsonLd(park, ride) as any;
      expect(node.geo.latitude, ride.id).toBe(ride.lat);
      expect(node.geo.longitude, ride.id).toBe(ride.lng);
    }
  });

  it("keeps the stable slug in the URL after a rename", () => {
    const node = buildAttractionJsonLd(dhs, rnrc) as any;
    expect(node.name).toBe("Rock 'n' Roller Coaster Starring The Muppets");
    expect(node.url).toBe(
      `${SITE}/parks/hollywood-studios/attractions/hs-rocknroller/`,
    );
  });
});

describe("serialization safety", () => {
  it("escapes < so a value cannot close the script element", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c");
  });

  it("produces parseable JSON for every attraction", () => {
    for (const ride of RIDES) {
      const park = getPark(ride.parkId)!;
      for (const node of [
        buildBreadcrumbJsonLd(park, ride),
        buildAttractionJsonLd(park, ride),
      ]) {
        const raw = serializeJsonLd(node).replace(/\\u003c/g, "<");
        expect(() => JSON.parse(raw), ride.id).not.toThrow();
      }
    }
  });

  it("adds no dependency for structured data", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const name of Object.keys(all)) {
      expect(name).not.toMatch(/schema|json-?ld|microdata/i);
    }
  });
});

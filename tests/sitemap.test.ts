import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import sitemap from "@/app/sitemap";
import {
  attractionCanonicalPath,
  attractionStaticParams,
} from "@/lib/attractionRoute";
import { PARKS, RIDES } from "@/lib/data";

const SITE_URL = "https://parkio.info";
const entries = sitemap();
const urls = entries.map((e) => String(e.url));
const attractionUrls = urls.filter((u) => u.includes("/attractions/"));

describe("attraction coverage", () => {
  it("lists all 84 canonical attractions", () => {
    expect(attractionUrls).toHaveLength(84);
    expect(attractionUrls).toHaveLength(RIDES.length);
  });

  it("lists each ride exactly once", () => {
    expect(new Set(attractionUrls).size).toBe(attractionUrls.length);
    for (const ride of RIDES) {
      const matches = attractionUrls.filter((u) =>
        u.endsWith(`/attractions/${ride.id}/`),
      );
      expect(matches, ride.id).toHaveLength(1);
    }
  });

  it("emits no cross-park attraction URL", () => {
    for (const ride of RIDES) {
      const expected = `${SITE_URL}${attractionCanonicalPath(ride.parkId, ride.id)}`;
      expect(attractionUrls, ride.id).toContain(expected);
      for (const park of PARKS) {
        if (park.id === ride.parkId) continue;
        expect(
          attractionUrls,
          `${park.id}/${ride.id}`,
        ).not.toContain(
          `${SITE_URL}${attractionCanonicalPath(park.id, ride.id)}`,
        );
      }
    }
  });

  it("matches the Slice 2 canonical param set exactly", () => {
    const fromParams = new Set(
      attractionStaticParams().map(
        (p) => `${SITE_URL}${attractionCanonicalPath(p.parkId, p.slug)}`,
      ),
    );
    expect(new Set(attractionUrls)).toEqual(fromParams);
  });

  it("includes representative attractions from three resorts", () => {
    for (const [park, slug] of [
      ["epcot", "ep-guardians"],
      ["hollywood-studios", "hs-rocknroller"],
      ["disneyland", "dl-indy"],
    ] as const) {
      expect(attractionUrls, slug).toContain(
        `${SITE_URL}/parks/${park}/attractions/${slug}/`,
      );
    }
  });
});

describe("trailing-slash policy", () => {
  it("gives every page URL the trailing slash the app serves", () => {
    for (const url of urls) {
      const path = url.slice(SITE_URL.length);
      // Verified exception: Next excludes file-extension routes from
      // trailing-slash normalisation ("/feed.xml/" 308s back to "/feed.xml").
      if (/\.[a-z0-9]+$/i.test(path)) continue;
      expect(url.endsWith("/"), url).toBe(true);
    }
  });

  it("keeps file routes bare", () => {
    expect(urls).toContain(`${SITE_URL}/feed.xml`);
    expect(urls).not.toContain(`${SITE_URL}/feed.xml/`);
  });

  it("uses absolute URLs on the canonical host", () => {
    for (const url of urls) {
      expect(url.startsWith(`${SITE_URL}/`), url).toBe(true);
    }
  });

  it("has no duplicate entries", () => {
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("never lists an /api/ route", () => {
    for (const url of urls) {
      expect(url.includes("/api/"), url).toBe(false);
    }
  });
});

describe("existing routes survived the change", () => {
  it("still lists the core pages, now slash-normalised", () => {
    for (const path of [
      "/",
      "/parks/",
      "/waits/",
      "/wait-times-today/",
      "/best-rides-today/",
      "/guide/",
      "/about/",
      "/support/",
      "/privacy/",
    ]) {
      expect(urls, path).toContain(`${SITE_URL}${path}`);
    }
  });

  it("still lists all six park pages", () => {
    for (const park of PARKS) {
      expect(urls, park.id).toContain(`${SITE_URL}/parks/${park.id}/`);
    }
  });

  it("does not hand-maintain the attraction list", () => {
    const source = readFileSync("app/sitemap.ts", "utf8");
    expect(source).toContain("attractionStaticParams()");
    // No literal attraction slug should appear in the sitemap source.
    for (const ride of RIDES.slice(0, 20)) {
      expect(source, ride.id).not.toContain(`"${ride.id}"`);
    }
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  BASEMAP_ATTRIBUTION,
  BASEMAP_SUBDOMAINS,
  basemapConfig,
} from "@/lib/basemap";

describe("basemapConfig with a credential", () => {
  const cfg = basemapConfig("test-key-value")!;

  it("builds the authenticated CARTO Voyager raster URL", () => {
    expect(cfg.url).toBe(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=test-key-value",
    );
  });

  it("uses CARTO's documented `key` parameter, not `api_key`", () => {
    // Verified against the live service: api_key / apikey / access_token
    // are ignored and return byte-identical watermarked tiles.
    expect(cfg.url).toContain("?key=");
    expect(cfg.url).not.toContain("api_key=");
    expect(cfg.url).not.toContain("apikey=");
    expect(cfg.url).not.toContain("access_token=");
  });

  it("preserves the Voyager style and Leaflet placeholders", () => {
    expect(cfg.url).toContain("/rastertiles/voyager/");
    for (const token of ["{s}", "{z}", "{x}", "{y}", "{r}"]) {
      expect(cfg.url, token).toContain(token);
    }
  });

  it("preserves subdomains and required attribution", () => {
    expect(cfg.subdomains).toBe("abcd");
    expect(BASEMAP_SUBDOMAINS).toBe("abcd");
    expect(cfg.attribution).toBe(BASEMAP_ATTRIBUTION);
    expect(cfg.attribution).toContain("OSM");
    expect(cfg.attribution).toContain("CARTO");
  });

  it("url-encodes the credential", () => {
    expect(basemapConfig("a b/c&d")!.url).toContain("?key=a%20b%2Fc%26d");
  });
});

describe("basemapConfig without a credential", () => {
  it("returns null rather than a watermarked fallback", () => {
    expect(basemapConfig(undefined)).toBeNull();
    expect(basemapConfig("")).toBeNull();
    expect(basemapConfig("   ")).toBeNull();
  });

  it("is deterministic", () => {
    expect(basemapConfig(undefined)).toBe(basemapConfig(undefined));
    expect(basemapConfig("k")).toEqual(basemapConfig("k"));
  });
});

describe("no credential is committed to source", () => {
  const sources = [
    "lib/basemap.ts",
    "components/LeafletMap.tsx",
    "package.json",
  ].map((f) => readFileSync(f, "utf8"));

  it("contains no hard-coded key value", () => {
    for (const src of sources) {
      // A real key would appear as ?key=<something-not-a-template>.
      const literal = src.match(/\?key=(?!\$\{|"|`)[A-Za-z0-9_-]{8,}/);
      expect(literal).toBeNull();
    }
  });

  it("never ships the unauthenticated URL as a runtime fallback", () => {
    const leaflet = readFileSync("components/LeafletMap.tsx", "utf8");
    // The bare URL must not appear in the component at all — the only
    // template lives in lib/basemap.ts and always gains a key.
    expect(leaflet).not.toContain("basemaps.cartocdn.com");
  });

  it("reads the credential from the environment only", () => {
    const lib = readFileSync("lib/basemap.ts", "utf8");
    expect(lib).toContain("process.env.NEXT_PUBLIC_CARTO_API_KEY");
  });
});

describe("map configuration is preserved", () => {
  const leaflet = readFileSync("components/LeafletMap.tsx", "utf8");

  it("keeps the existing max zoom", () => {
    expect(leaflet).toContain("const MAX_ZOOM = 19");
    expect(leaflet).toMatch(/maxZoom=\{MAX_ZOOM\}/);
  });

  it("renders no tile layer when the basemap is unconfigured", () => {
    expect(leaflet).toContain("{basemap && (");
    expect(leaflet).toContain("{!basemap && <BasemapNotice />}");
  });

  it("keeps marker rendering independent of the basemap", () => {
    const markers = leaflet.indexOf("<ClusterMarkers");
    const guard = leaflet.indexOf("{basemap && (");
    expect(markers).toBeGreaterThan(-1);
    // Markers are siblings of the tile layer, never nested inside its guard.
    expect(leaflet.slice(guard, markers)).toContain("{!basemap &&");
  });
});

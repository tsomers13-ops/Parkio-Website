// @vitest-environment jsdom
import L from "leaflet";
import { createElement } from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import LeafletMap from "@/components/LeafletMap";
import { PARKS, RIDES } from "@/lib/data";
import type { RideDisplay } from "@/components/ParkMap";

const park = PARKS.find((p) => p.id === "magic-kingdom")!;
const rides = RIDES.filter((r) => r.parkId === park.id).slice(0, 3);

function renderMap() {
  const mapRef: { current: L.Map | null } = { current: null };
  const { container } = render(
    createElement(LeafletMap, {
      park,
      rides,
      displays: new Map<string, RideDisplay>(),
      selectedId: null,
      onSelect: () => {},
      mapRef,
    }),
  );
  return { container, mapRef };
}

// The tile layer only renders when a CARTO key is configured — without
// one LeafletMap deliberately renders no basemap rather than the
// watermarked unauthenticated URL (see lib/basemap.ts). Set one so this
// regression test can still assert the tile layer's zoom behaviour.
beforeAll(() => {
  process.env.NEXT_PUBLIC_CARTO_API_KEY = "test-key-value";
});

afterEach(cleanup);

describe("<LeafletMap>", () => {
  it("keeps the basemap loaded at the map's deepest zoom", async () => {
    const { mapRef } = renderMap();
    await waitFor(() => expect(mapRef.current).not.toBeNull());
    const map = mapRef.current!;

    // Regression: the tile layer used to inherit Leaflet's default
    // maxZoom of 18 while the map allowed 19, so GridLayer unloaded
    // every tile at zoom 19 — a blank basemap under live markers.
    const tileMaxZooms: number[] = [];
    await waitFor(() => {
      tileMaxZooms.length = 0;
      map.eachLayer((layer) => {
        if (layer instanceof L.TileLayer) {
          tileMaxZooms.push(layer.options.maxZoom ?? 18);
        }
      });
      expect(tileMaxZooms.length).toBeGreaterThan(0);
    });

    for (const tileMaxZoom of tileMaxZooms) {
      expect(tileMaxZoom).toBeGreaterThanOrEqual(map.getMaxZoom());
    }
  });

  it("renders the authenticated tile URL, never the watermarked one", async () => {
    const { mapRef } = renderMap();
    await waitFor(() => expect(mapRef.current).not.toBeNull());
    const map = mapRef.current!;

    const urls: string[] = [];
    await waitFor(() => {
      urls.length = 0;
      map.eachLayer((layer) => {
        // `_url` is Leaflet-internal; there is no public getter for the
        // template, so read it through a narrow local type rather than
        // widening to `any`.
        if (layer instanceof L.TileLayer) {
          urls.push((layer as unknown as { _url: string })._url);
        }
      });
      expect(urls.length).toBeGreaterThan(0);
    });

    for (const url of urls) {
      expect(url).toContain("?key=test-key-value");
      expect(url).toContain("/rastertiles/voyager/");
    }
  });
});

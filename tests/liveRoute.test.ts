import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CACHE_TTL, cacheDelete } from "@/lib/cache";
import { GET } from "@/app/api/parks/[parkSlug]/live/route";
import type { ThemeparksLiveResponse } from "@/lib/themeparksApi";

const { getEntityLive } = vi.hoisted(() => ({ getEntityLive: vi.fn() }));

vi.mock("@/lib/themeparksApi", () => ({ getEntityLive }));

const MK_EXTERNAL_ID = "75ea578a-adc8-4116-a54d-dccb60765ef9";
const SPACE_MOUNTAIN_EXTERNAL_ID = "b2260923-9315-40fd-9c6b-44dd811dbe64";

/** themeparks.wiki payload with a single known Magic Kingdom ride. */
function upstream(waitTime: number): ThemeparksLiveResponse {
  return {
    id: MK_EXTERNAL_ID,
    name: "Magic Kingdom Park",
    entityType: "PARK",
    timezone: "America/New_York",
    liveData: [
      {
        id: SPACE_MOUNTAIN_EXTERNAL_ID,
        name: "Space Mountain",
        entityType: "ATTRACTION",
        parkId: MK_EXTERNAL_ID,
        status: "OPERATING",
        lastUpdated: "2026-05-04T18:00:00Z",
        queue: { STANDBY: { waitTime } },
      },
    ],
  } as ThemeparksLiveResponse;
}

function request(parkSlug: string) {
  return GET(new Request(`https://parkio.info/api/parks/${parkSlug}/live/`), {
    params: { parkSlug },
  });
}

describe("GET /api/parks/[parkSlug]/live", () => {
  beforeEach(() => {
    cacheDelete(`live:${MK_EXTERNAL_ID}`);
    getEntityLive.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Bind a fake D1 database the way `@cloudflare/next-on-pages` does.
   * `process.env` is stubbed wholesale because Node's real `process.env`
   * coerces every assigned value to a string.
   */
  function bindFakeD1() {
    const batch = vi.fn().mockResolvedValue(undefined);
    const stmt = { bind: vi.fn(() => stmt), run: vi.fn() };
    vi.stubGlobal("process", {
      ...process,
      env: { ...process.env, DB: { prepare: vi.fn(() => stmt), batch } },
    });
    return { batch };
  }

  it("404s for an unknown park slug without calling upstream", async () => {
    const res = await request("not-a-park");
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "not_found" });
    expect(getEntityLive).not.toHaveBeenCalled();
  });

  it("returns live waits with edge cache headers", async () => {
    getEntityLive.mockResolvedValue(upstream(35));

    const res = await request("magic-kingdom");

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      `public, s-maxage=${CACHE_TTL.live}, stale-while-revalidate=${CACHE_TTL.live * 4}`,
    );
    const body = await res.json();
    expect(body.parkSlug).toBe("magic-kingdom");
    expect(body.live).toBe(true);
    expect(body.attractions.length).toBeGreaterThan(0);
    expect(
      body.attractions.find((a: { slug: string }) => a.slug === "mk-space-mountain")
        ?.waitMinutes,
    ).toBe(35);
  });

  it("serves the second request from cache", async () => {
    getEntityLive.mockResolvedValue(upstream(20));

    await request("magic-kingdom");
    await request("magic-kingdom");

    expect(getEntityLive).toHaveBeenCalledTimes(1);
  });

  it("degrades to estimates when upstream fails", async () => {
    getEntityLive.mockRejectedValue(new Error("upstream down"));

    const res = await request("magic-kingdom");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.live).toBe(false);
    expect(body.attractions.length).toBeGreaterThan(0);
  });

  it("writes one D1 snapshot batch per fresh upstream fetch", async () => {
    getEntityLive.mockResolvedValue(upstream(15));
    const { batch } = bindFakeD1();

    await request("magic-kingdom"); // cache miss → writes
    await request("magic-kingdom"); // cache hit  → no write

    expect(batch).toHaveBeenCalledTimes(1);
  });

  it("does not write snapshots when upstream data is unavailable", async () => {
    getEntityLive.mockRejectedValue(new Error("upstream down"));
    const { batch } = bindFakeD1();

    await request("magic-kingdom");

    expect(batch).not.toHaveBeenCalled();
  });
});

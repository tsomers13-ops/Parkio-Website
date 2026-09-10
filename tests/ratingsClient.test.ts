import { describe, expect, it, vi } from "vitest";

import {
  bulkRatingsUrl,
  fetchAggregate,
  fetchBulkRatings,
  fetchMyRating,
  guestRatingLabel,
  ratingCountLabel,
  ratingsAggregateUrl,
  ratingsMeUrl,
  submitRating,
} from "@/lib/ratingsClient";
import { emptyDiningRatingAggregate } from "@/lib/ratingsTypes";

const jsonResponse = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as Response;

describe("ratings API URLs", () => {
  /**
   * The app runs trailingSlash: true. A missing slash turns a POST into a 308
   * that the browser replays as a GET, silently dropping the rating — so this
   * is asserted rather than assumed.
   */
  it("always ends in a trailing slash", () => {
    expect(ratingsAggregateUrl("ep-le-cellier")).toBe("/api/dining/ep-le-cellier/ratings/");
    expect(ratingsMeUrl("ep-le-cellier")).toBe("/api/dining/ep-le-cellier/ratings/me/");
  });

  it("never produces the slash-less form", () => {
    for (const key of ["ep-le-cellier", "hs-brown-derby", "ep-space-220-lounge"]) {
      expect(ratingsAggregateUrl(key).endsWith("/ratings/")).toBe(true);
      expect(ratingsAggregateUrl(key)).not.toMatch(/\/ratings$/);
      expect(ratingsMeUrl(key).endsWith("/ratings/me/")).toBe(true);
      expect(ratingsMeUrl(key)).not.toMatch(/\/ratings\/me$/);
    }
  });

  it("encodes the venue key", () => {
    expect(ratingsAggregateUrl("a b")).toBe("/api/dining/a%20b/ratings/");
  });
});

describe("aggregate fetch", () => {
  it("returns the aggregate on success", async () => {
    const agg = emptyDiningRatingAggregate("ep-le-cellier");
    const result = await fetchAggregate("ep-le-cellier", async () => jsonResponse(agg));
    expect(result).toEqual({ status: "ok", aggregate: agg });
  });

  it("reports unavailable on a non-OK response — never a fabricated zero", async () => {
    const result = await fetchAggregate("ep-le-cellier", async () => jsonResponse({}, false, 503));
    expect(result.status).toBe("unavailable");
    expect(result).not.toHaveProperty("aggregate");
  });

  it("reports unavailable when the network throws", async () => {
    const result = await fetchAggregate("ep-le-cellier", async () => {
      throw new Error("offline");
    });
    expect(result.status).toBe("unavailable");
  });
});

describe("personal rating fetch", () => {
  it("returns the guest's rating", async () => {
    const rating = { overall: 4, taste: 5, value: null, quality: null };
    expect(await fetchMyRating("ep-le-cellier", async () => jsonResponse({ rating }))).toEqual(rating);
  });

  it("returns null when there is no rating, and degrades quietly on failure", async () => {
    expect(await fetchMyRating("ep-le-cellier", async () => jsonResponse({ rating: null }))).toBeNull();
    expect(await fetchMyRating("ep-le-cellier", async () => jsonResponse({}, false, 503))).toBeNull();
    expect(
      await fetchMyRating("ep-le-cellier", async () => {
        throw new Error("offline");
      }),
    ).toBeNull();
  });
});

describe("submission", () => {
  it("posts JSON to the trailing-slash URL", async () => {
    const spy = vi.fn(async () =>
      jsonResponse({ rating: { overall: 4, taste: null, value: null, quality: null }, aggregate: null }),
    );
    await submitRating("ep-le-cellier", { overall: 4 }, spy as unknown as typeof fetch);
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/dining/ep-le-cellier/ratings/");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
  });

  it("omits unanswered dimensions rather than sending zeros or copying Overall", async () => {
    const spy = vi.fn(async () =>
      jsonResponse({ rating: { overall: 3, taste: null, value: null, quality: null }, aggregate: null }),
    );
    await submitRating("ep-le-cellier", { overall: 3 }, spy as unknown as typeof fetch);
    const body = JSON.parse(((spy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string));
    expect(body).toEqual({ overall: 3 });
    expect(body).not.toHaveProperty("taste");
  });

  it("sends every dimension the guest did answer", async () => {
    const spy = vi.fn(async () =>
      jsonResponse({ rating: { overall: 5, taste: 4, value: 3, quality: 2 }, aggregate: null }),
    );
    await submitRating("ep-le-cellier", { overall: 5, taste: 4, value: 3, quality: 2 }, spy as unknown as typeof fetch);
    const body = JSON.parse(((spy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string));
    expect(body).toEqual({ overall: 5, taste: 4, value: 3, quality: 2 });
  });

  it("never sends identity or server-owned fields", async () => {
    const spy = vi.fn(async () =>
      jsonResponse({ rating: { overall: 4, taste: null, value: null, quality: null }, aggregate: null }),
    );
    await submitRating("ep-le-cellier", { overall: 4 }, spy as unknown as typeof fetch);
    const raw = (spy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string;
    for (const forbidden of ["raterId", "status", "created_at", "updated_at", "slug", "canonicalId"]) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it("surfaces an error rather than claiming success", async () => {
    expect((await submitRating("ep-le-cellier", { overall: 4 }, async () => jsonResponse({}, false, 503))).status).toBe("error");
    expect(
      (
        await submitRating("ep-le-cellier", { overall: 4 }, async () => {
          throw new Error("offline");
        })
      ).status,
    ).toBe("error");
  });
});

describe("count language", () => {
  it("is singular for one and plural otherwise", () => {
    expect(ratingCountLabel(1)).toBe("1 rating");
    expect(ratingCountLabel(0)).toBe("0 ratings");
    expect(ratingCountLabel(2)).toBe("2 ratings");
    expect(ratingCountLabel(127)).toBe("127 ratings");
  });
});

// ── Bulk discovery aggregates ───────────────────────────────────────────────

describe("bulkRatingsUrl", () => {
  it("keeps the trailing slash before the query string", () => {
    expect(bulkRatingsUrl(["ep-le-cellier"])).toBe(
      "/api/dining/ratings/?venueKeys=ep-le-cellier",
    );
  });

  it("joins keys with commas in the order given", () => {
    expect(bulkRatingsUrl(["ep-a", "ep-b", "hs-c"])).toBe(
      "/api/dining/ratings/?venueKeys=ep-a,ep-b,hs-c",
    );
  });

  it("encodes each key rather than trusting it into the URL", () => {
    expect(bulkRatingsUrl(["a&b=c"])).toBe("/api/dining/ratings/?venueKeys=a%26b%3Dc");
  });

  it("produces a stable URL for the same park, so the edge cache is usable", () => {
    const keys = ["ep-a", "ep-b"];
    expect(bulkRatingsUrl(keys)).toBe(bulkRatingsUrl([...keys]));
  });
});

describe("fetchBulkRatings", () => {
  const okFetch = (body: unknown) =>
    (async () => ({ ok: true, status: 200, json: async () => body })) as unknown as typeof fetch;

  it("returns the ratings map on success", async () => {
    const load = await fetchBulkRatings(
      ["ep-a"],
      okFetch({ ratings: { "ep-a": { ratingCount: 3, overallAverage: 4.5 } } }),
    );
    expect(load).toEqual({
      status: "ok",
      ratings: { "ep-a": { ratingCount: 3, overallAverage: 4.5 } },
    });
  });

  it("short-circuits an empty request without calling the network", async () => {
    let called = false;
    const spy = (async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({}) };
    }) as unknown as typeof fetch;
    expect(await fetchBulkRatings([], spy)).toEqual({ status: "ok", ratings: {} });
    expect(called).toBe(false);
  });

  it("reports unavailable on a non-OK response", async () => {
    const failing = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await fetchBulkRatings(["ep-a"], failing)).toEqual({ status: "unavailable" });
  });

  it("reports unavailable when the request throws", async () => {
    const throwing = (async () => {
      throw new TypeError("network");
    }) as unknown as typeof fetch;
    expect(await fetchBulkRatings(["ep-a"], throwing)).toEqual({ status: "unavailable" });
  });

  it("reports unavailable on a body with no ratings map", async () => {
    expect(await fetchBulkRatings(["ep-a"], okFetch({ nope: true }))).toEqual({
      status: "unavailable",
    });
  });

  it("never invents a zero when the service fails", async () => {
    const failing = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
    const load = await fetchBulkRatings(["ep-a"], failing);
    expect(load.status).toBe("unavailable");
    expect(load).not.toHaveProperty("ratings");
  });
});

describe("guestRatingLabel", () => {
  it("states the scale and the sample size", () => {
    expect(guestRatingLabel(4.6, 328)).toBe("Guest rating 4.6 out of 5 from 328 ratings");
  });

  it("keeps one decimal on a whole average", () => {
    expect(guestRatingLabel(5, 1)).toBe("Guest rating 5.0 out of 5 from 1 rating");
  });
});

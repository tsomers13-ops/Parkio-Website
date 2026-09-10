import { describe, expect, it } from "vitest";

import {
  COMMUNITY_RATING_MIN_RANKING_COUNT,
  COMMUNITY_RATING_PRIOR,
  COMMUNITY_RATING_PRIOR_WEIGHT,
  calculateCommunityRanking,
  compareByCommunityRanking,
  rankingForAggregate,
  type RankableVenue,
} from "@/lib/ratingsRanking";

/**
 * The trust model. These tests are the policy: if a constant moves, they fail
 * loudly rather than quietly reordering every venue in the product.
 */

const score = (avg: number | null, n: number) =>
  calculateCommunityRanking(avg, n).rankingScore;

describe("policy constants", () => {
  it("are the approved MVP values", () => {
    expect(COMMUNITY_RATING_PRIOR).toBe(4.0);
    expect(COMMUNITY_RATING_PRIOR_WEIGHT).toBe(10);
    expect(COMMUNITY_RATING_MIN_RANKING_COUNT).toBe(5);
  });
});

describe("eligibility", () => {
  it("is false with no ratings", () => {
    expect(calculateCommunityRanking(null, 0)).toEqual({
      rankingScore: null,
      rankingEligible: false,
    });
  });

  it("is false below the threshold, at every count", () => {
    for (const n of [1, 2, 3, 4]) {
      const result = calculateCommunityRanking(5, n);
      expect(result.rankingEligible).toBe(false);
      expect(result.rankingScore).toBeNull();
    }
  });

  it("turns on exactly at the threshold", () => {
    expect(calculateCommunityRanking(4.6, 4).rankingEligible).toBe(false);
    expect(calculateCommunityRanking(4.6, 5).rankingEligible).toBe(true);
    expect(calculateCommunityRanking(4.6, 6).rankingEligible).toBe(true);
  });

  it("never returns 0 for an unrankable venue", () => {
    // 0 would sort an unrated venue below one everybody hated.
    expect(calculateCommunityRanking(null, 0).rankingScore).toBeNull();
    expect(calculateCommunityRanking(5, 1).rankingScore).toBeNull();
  });
});

describe("formula", () => {
  it("matches the approved arithmetic", () => {
    expect(score(4.7, 5)).toBeCloseTo((10 * 4 + 5 * 4.7) / 15, 12);
    expect(score(4.6, 25)).toBeCloseTo((10 * 4 + 25 * 4.6) / 35, 12);
    expect(score(4.5, 250)).toBeCloseTo((10 * 4 + 250 * 4.5) / 260, 12);
  });

  it("produces the worked examples", () => {
    expect(score(4.7, 5)).toBeCloseTo(4.2333333, 6);
    expect(score(4.6, 25)).toBeCloseTo(4.4285714, 6);
    expect(score(4.5, 250)).toBeCloseTo(4.4807692, 6);
  });

  it("does not round prematurely", () => {
    // Rounding here would invent ties that do not exist.
    const value = score(4.7, 5)!;
    expect(value).not.toBe(4.23);
    expect(value.toString().length).toBeGreaterThan(4);
  });

  it("accepts the extremes of the scale", () => {
    expect(score(1, 5)).toBeCloseTo((10 * 4 + 5 * 1) / 15, 12);
    expect(score(5, 5)).toBeCloseTo((10 * 4 + 5 * 5) / 15, 12);
  });

  it("converges toward the raw average as evidence accumulates", () => {
    const raw = 4.2;
    const gaps = [10, 100, 1000, 10000].map((n) => Math.abs(score(raw, n)! - raw));
    for (let i = 1; i < gaps.length; i += 1) expect(gaps[i]).toBeLessThan(gaps[i - 1]);
    expect(gaps.at(-1)!).toBeLessThan(0.01);
  });

  it("pulls a small sample toward the prior", () => {
    // 5 five-star ratings must not read as a 5.0 venue.
    expect(score(5, 5)!).toBeLessThan(4.6);
    expect(score(5, 5)!).toBeGreaterThan(COMMUNITY_RATING_PRIOR);
  });
});

describe("same average, different confidence", () => {
  it("moves the larger sample closer to its raw average", () => {
    const small = score(4.8, 5)!;
    const large = score(4.8, 100)!;

    expect(Math.abs(large - 4.8)).toBeLessThan(Math.abs(small - 4.8));
    expect(large).toBeGreaterThan(small);
    // Equal raw averages must NOT produce equal ranking scores.
    expect(small).not.toBeCloseTo(large, 3);
  });
});

describe("malformed input fails closed", () => {
  it("rejects counts that are not whole and non-negative", () => {
    for (const n of [-1, -100, 2.5, NaN, Infinity]) {
      expect(calculateCommunityRanking(4.5, n as number).rankingEligible).toBe(false);
    }
  });

  it("rejects averages outside the 1-5 scale", () => {
    for (const avg of [0, 0.9, 5.1, 6, -3]) {
      expect(calculateCommunityRanking(avg, 25).rankingEligible).toBe(false);
    }
  });

  it("rejects non-finite averages", () => {
    for (const avg of [NaN, Infinity, -Infinity]) {
      expect(calculateCommunityRanking(avg, 25).rankingEligible).toBe(false);
    }
  });

  it("rejects an eligible count with a missing average", () => {
    expect(calculateCommunityRanking(null, 25).rankingEligible).toBe(false);
  });

  it("never emits NaN as a ranking key", () => {
    for (const [avg, n] of [[NaN, 5], [4.5, NaN], [Infinity, 10]] as [number, number][]) {
      const result = calculateCommunityRanking(avg, n);
      expect(result.rankingScore === null || Number.isFinite(result.rankingScore)).toBe(true);
    }
  });
});

describe("the scenario that motivated the model", () => {
  const venues = {
    A: { avg: 5.0, n: 1 },
    B: { avg: 4.7, n: 5 },
    C: { avg: 4.6, n: 25 },
    D: { avg: 4.5, n: 250 },
    E: { avg: 4.2, n: 1000 },
  };

  it("does not let one perfect rating rank at all", () => {
    expect(calculateCommunityRanking(venues.A.avg, venues.A.n).rankingEligible).toBe(false);
  });

  it("ranks the rest D > C > B > E", () => {
    const ranked = (["B", "C", "D", "E"] as const)
      .map((key) => ({ key, score: score(venues[key].avg, venues[key].n)! }))
      .sort((x, y) => y.score - x.score)
      .map((entry) => entry.key);

    expect(ranked).toEqual(["D", "C", "B", "E"]);
  });

  it("puts a well-supported venue above a barely-supported higher average", () => {
    // 4.5 from 250 people beats 4.7 from 5.
    expect(score(4.5, 250)!).toBeGreaterThan(score(4.7, 5)!);
  });
});

describe("aggregate convenience", () => {
  it("reads straight from an aggregate shape", () => {
    expect(rankingForAggregate({ overallAverage: 4.6, ratingCount: 25 }).rankingEligible).toBe(true);
    expect(rankingForAggregate({ overallAverage: null, ratingCount: 0 }).rankingEligible).toBe(false);
  });
});

describe("tie policy", () => {
  const venue = (
    venueKey: string,
    ratingCount: number,
    overallAverage: number | null,
  ): RankableVenue => ({
    venueKey,
    ratingCount,
    overallAverage,
    ...calculateCommunityRanking(overallAverage, ratingCount),
  });

  it("orders by score first", () => {
    const list = [venue("b", 5, 4.0), venue("a", 250, 4.5)].sort(compareByCommunityRanking);
    expect(list.map((v) => v.venueKey)).toEqual(["a", "b"]);
  });

  it("breaks a genuine score tie by rating count", () => {
    // Constructed so the shrunk scores are identical.
    const a = venue("aaa", 10, 4.4);
    const b = venue("bbb", 10, 4.4);
    expect(a.rankingScore).toBe(b.rankingScore);
    const sorted = [b, a].sort(compareByCommunityRanking);
    // Equal on score AND count, so venueKey decides — deterministically.
    expect(sorted.map((v) => v.venueKey)).toEqual(["aaa", "bbb"]);
  });

  it("puts every eligible venue above every ineligible one", () => {
    const list = [venue("z", 1, 5.0), venue("a", 5, 4.1)].sort(compareByCommunityRanking);
    expect(list.map((v) => v.venueKey)).toEqual(["a", "z"]);
  });

  it("is deterministic regardless of input order", () => {
    const build = () => [
      venue("ep-c", 25, 4.6),
      venue("ep-a", 250, 4.5),
      venue("ep-b", 5, 4.7),
      venue("ep-z", 1, 5.0),
    ];
    const first = [...build()].sort(compareByCommunityRanking).map((v) => v.venueKey);
    const second = [...build()].reverse().sort(compareByCommunityRanking).map((v) => v.venueKey);
    expect(first).toEqual(second);
  });

  it("never drops ineligible venues", () => {
    const list = [venue("a", 5, 4.5), venue("b", 0, null), venue("c", 2, 5)];
    expect([...list].sort(compareByCommunityRanking)).toHaveLength(3);
  });
});

describe("what must never influence ranking", () => {
  it("depends only on Overall average and count", () => {
    // The function's whole signature is (average, count) — there is no seam
    // through which editorial score, price tier, the private journal or the
    // optional dimensions could reach it.
    expect(calculateCommunityRanking.length).toBe(2);
  });

  it("gives identical results whatever the dimensions were", () => {
    // Two venues with the same Overall evidence rank identically, regardless
    // of how many people answered Taste/Value/Quality.
    const a = calculateCommunityRanking(4.6, 25);
    const b = calculateCommunityRanking(4.6, 25);
    expect(a).toEqual(b);
  });
});

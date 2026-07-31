import { describe, expect, it } from "vitest";

import { walkBucket, walkBucketBetween, walkMinutes } from "@/lib/walk";

const PIRATES = { lat: 28.4183, lng: -81.5849 };

describe("walkMinutes", () => {
  it("returns 0 for the same point", () => {
    expect(walkMinutes(PIRATES, { ...PIRATES })).toBe(0);
  });

  it("scales euclidean degree distance by 1000 min/deg", () => {
    expect(
      walkMinutes({ lat: 0, lng: 0 }, { lat: 0.003, lng: 0.004 }),
    ).toBeCloseTo(5, 6);
  });

  it("is symmetric", () => {
    const a = { lat: 28.4183, lng: -81.5849 };
    const b = { lat: 28.4205, lng: -81.5773 };
    expect(walkMinutes(a, b)).toBeCloseTo(walkMinutes(b, a), 10);
  });
});

describe("walkBucket", () => {
  it("buckets at each boundary", () => {
    expect(walkBucket(0)).toBe("1–2 min walk");
    expect(walkBucket(2.49)).toBe("1–2 min walk");
    expect(walkBucket(2.5)).toBe("3–5 min walk");
    expect(walkBucket(4.99)).toBe("3–5 min walk");
    expect(walkBucket(5)).toBe("5–8 min walk");
    expect(walkBucket(7.99)).toBe("5–8 min walk");
    expect(walkBucket(8)).toBe("8+ min walk");
    expect(walkBucket(120)).toBe("8+ min walk");
  });
});

describe("walkBucketBetween", () => {
  it("returns null for identical coordinates", () => {
    expect(walkBucketBetween(PIRATES, { ...PIRATES })).toBeNull();
  });

  it("matches the documented Magic Kingdom calibration", () => {
    // 0.0026 deg apart ≈ 2.6 min → "3–5 min walk"
    expect(
      walkBucketBetween({ lat: 0, lng: 0 }, { lat: 0.0026, lng: 0 }),
    ).toBe("3–5 min walk");
    // 0.0061 deg apart ≈ 6.1 min → "5–8 min walk"
    expect(
      walkBucketBetween({ lat: 0, lng: 0 }, { lat: 0.0061, lng: 0 }),
    ).toBe("5–8 min walk");
  });
});

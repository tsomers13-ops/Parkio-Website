import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadAppStore() {
  vi.resetModules();
  return import("@/lib/appStore");
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("APP_STORE_URL", () => {
  it("prefers NEXT_PUBLIC_APP_STORE_URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", "https://example.com/public");
    vi.stubEnv("APP_STORE_URL", "https://example.com/server");
    const { APP_STORE_URL } = await loadAppStore();
    expect(APP_STORE_URL).toBe("https://example.com/public");
  });

  it("falls back to APP_STORE_URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", undefined);
    vi.stubEnv("APP_STORE_URL", "https://example.com/server");
    const { APP_STORE_URL } = await loadAppStore();
    expect(APP_STORE_URL).toBe("https://example.com/server");
  });

  it("falls back to the hard-coded production listing", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", undefined);
    vi.stubEnv("APP_STORE_URL", undefined);
    const { APP_STORE_URL, APP_STORE_LIVE } = await loadAppStore();
    expect(APP_STORE_URL).toBe(
      "https://apps.apple.com/us/app/parkio-guide/id6762892374",
    );
    expect(APP_STORE_LIVE).toBe(true);
  });
});

describe("APP_STORE_LIVE", () => {
  it("is false for an internal fallback path", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", "/support");
    const { APP_STORE_LIVE } = await loadAppStore();
    expect(APP_STORE_LIVE).toBe(false);
  });
});

describe("APP_DOWNLOAD_CTA_ATTR", () => {
  it("is the stable analytics hook value", async () => {
    const { APP_DOWNLOAD_CTA_ATTR } = await loadAppStore();
    expect(APP_DOWNLOAD_CTA_ATTR).toBe("app-download");
  });
});

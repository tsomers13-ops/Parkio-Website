import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadButtondown() {
  vi.resetModules();
  return import("@/lib/buttondown");
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("BUTTONDOWN_USERNAME", () => {
  it("reads NEXT_PUBLIC_BUTTONDOWN_USERNAME", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUTTONDOWN_USERNAME", "somers");
    const { BUTTONDOWN_USERNAME } = await loadButtondown();
    expect(BUTTONDOWN_USERNAME).toBe("somers");
  });

  it("has NO hard-coded fallback — empty string when unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUTTONDOWN_USERNAME", undefined);
    const { BUTTONDOWN_USERNAME } = await loadButtondown();
    expect(BUTTONDOWN_USERNAME).toBe("");
  });
});

describe("BUTTONDOWN_EMBED_READY / BUTTONDOWN_READY", () => {
  it("is ready (embed) once a username is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUTTONDOWN_USERNAME", "somers");
    const { BUTTONDOWN_EMBED_READY, BUTTONDOWN_READY } =
      await loadButtondown();
    expect(BUTTONDOWN_EMBED_READY).toBe(true);
    expect(BUTTONDOWN_READY).toBe(true);
  });

  it("is ready (hosted link) when only the subscribe URL is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUTTONDOWN_USERNAME", undefined);
    vi.stubEnv(
      "NEXT_PUBLIC_BUTTONDOWN_SUBSCRIBE_URL",
      "https://buttondown.com/somers",
    );
    const { BUTTONDOWN_EMBED_READY, BUTTONDOWN_READY } =
      await loadButtondown();
    expect(BUTTONDOWN_EMBED_READY).toBe(false);
    expect(BUTTONDOWN_READY).toBe(true);
  });

  it("is not ready when neither is set — the configuration-pending state", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUTTONDOWN_USERNAME", undefined);
    vi.stubEnv("NEXT_PUBLIC_BUTTONDOWN_SUBSCRIBE_URL", undefined);
    const { BUTTONDOWN_EMBED_READY, BUTTONDOWN_READY } =
      await loadButtondown();
    expect(BUTTONDOWN_EMBED_READY).toBe(false);
    expect(BUTTONDOWN_READY).toBe(false);
  });
});

describe("buttondownEmbedAction", () => {
  it("targets Buttondown's documented .com embed-subscribe endpoint for the configured username", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUTTONDOWN_USERNAME", "somers");
    const { buttondownEmbedAction } = await loadButtondown();
    expect(buttondownEmbedAction()).toBe(
      "https://buttondown.com/api/emails/embed-subscribe/somers",
    );
  });

  it("does NOT use the stale .email domain", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUTTONDOWN_USERNAME", "somers");
    const { buttondownEmbedAction } = await loadButtondown();
    expect(buttondownEmbedAction()).not.toContain("buttondown.email");
  });
});

describe("BUTTONDOWN_EMBED_HIDDEN_FIELD_NAME / _VALUE", () => {
  it("matches Buttondown's documented required hidden field (name=embed value=1)", async () => {
    const {
      BUTTONDOWN_EMBED_HIDDEN_FIELD_NAME,
      BUTTONDOWN_EMBED_HIDDEN_FIELD_VALUE,
    } = await loadButtondown();
    expect(BUTTONDOWN_EMBED_HIDDEN_FIELD_NAME).toBe("embed");
    expect(BUTTONDOWN_EMBED_HIDDEN_FIELD_VALUE).toBe("1");
  });
});

describe("NEWSLETTER_SUBSCRIBE_CTA_ATTR", () => {
  it("is the stable analytics hook value", async () => {
    const { NEWSLETTER_SUBSCRIBE_CTA_ATTR } = await loadButtondown();
    expect(NEWSLETTER_SUBSCRIBE_CTA_ATTR).toBe("newsletter-subscribe");
  });
});

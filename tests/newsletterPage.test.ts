// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /newsletter page — regression coverage for the exact three
 * configuration states lib/buttondown.ts's BUTTONDOWN_READY ladder can
 * put the page in, plus the copy fix from the restoration task: no "6
 * AM" delivery-time promise (Buttondown's RSS poll schedule is outside
 * this page's control), "Parkio Daily, every morning" instead.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
});

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadPage() {
  const { default: NewsletterPage } = await import("@/app/newsletter/page");
  return NewsletterPage;
}

describe("NewsletterPage — copy", () => {
  it("never promises a specific delivery time (the regression this task fixes)", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUTTONDOWN_USERNAME", "somers");
    const NewsletterPage = await loadPage();
    const { container } = render(createElement(NewsletterPage));
    expect(container.textContent).not.toMatch(/6\s*AM/i);
  });

  it("says 'Parkio Daily, every morning' rather than a 6 AM promise", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUTTONDOWN_USERNAME", "somers");
    const NewsletterPage = await loadPage();
    const { container } = render(createElement(NewsletterPage));
    expect(container.textContent).toMatch(/Parkio Daily, every morning\.?/i);
  });
});

describe("NewsletterPage — configuration ladder", () => {
  it("renders the real signup form (email field + Subscribe) when NEXT_PUBLIC_BUTTONDOWN_USERNAME is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUTTONDOWN_USERNAME", "somers");
    const NewsletterPage = await loadPage();
    const { container } = render(createElement(NewsletterPage));

    const email = screen.getByLabelText(/email address/i);
    expect(email.getAttribute("type")).toBe("email");
    expect(
      screen.getAllByRole("button", { name: /subscribe/i }).length,
    ).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/coming soon/i);
  });

  it("renders the hosted link-out, with no inline email field, when only the subscribe URL is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUTTONDOWN_USERNAME", undefined);
    vi.stubEnv("NEXT_PUBLIC_BUTTONDOWN_SUBSCRIBE_URL", "https://buttondown.com/somers");
    const NewsletterPage = await loadPage();
    render(createElement(NewsletterPage));

    expect(screen.queryByLabelText(/email address/i)).toBeNull();
    const link = screen.getByRole("link", { name: /subscribe on buttondown/i });
    expect(link.getAttribute("href")).toBe("https://buttondown.com/somers");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("renders the configuration-pending placeholder — never a broken form — when neither is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUTTONDOWN_USERNAME", undefined);
    vi.stubEnv("NEXT_PUBLIC_BUTTONDOWN_SUBSCRIBE_URL", undefined);
    const NewsletterPage = await loadPage();
    const { container } = render(createElement(NewsletterPage));

    expect(screen.queryByLabelText(/email address/i)).toBeNull();
    expect(container.textContent).toMatch(/coming soon/i);
  });
});

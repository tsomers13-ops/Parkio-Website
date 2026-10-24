// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression coverage for the /newsletter signup form's client-side
 * states. The acceptance bar (see docs/AUTOMATION.md and the task this
 * restores) is "honest success/error states" — this page cannot read
 * Buttondown's cross-origin response, so it must never claim a
 * subscription succeeded; it can only report that it opened Buttondown's
 * confirmation tab, or that the email the visitor typed was invalid.
 */

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_BUTTONDOWN_USERNAME", "somers");
  vi.resetModules();
});

async function loadForm() {
  const { NewsletterSignupForm } = await import("@/components/NewsletterSignupForm");
  return NewsletterSignupForm;
}

describe("NewsletterSignupForm", () => {
  it("renders an email field and a Subscribe button", async () => {
    const NewsletterSignupForm = await loadForm();
    render(createElement(NewsletterSignupForm));

    const email = screen.getByLabelText(/email address/i);
    expect(email.getAttribute("type")).toBe("email");
    expect(email.getAttribute("required")).not.toBeNull();
    expect(screen.getByRole("button", { name: /subscribe/i })).toBeTruthy();
  });

  it("submits to Buttondown's public embed-subscribe endpoint for the configured username, targeting a new tab", async () => {
    const NewsletterSignupForm = await loadForm();
    render(createElement(NewsletterSignupForm));

    const form = document.querySelector("form");
    expect(form).not.toBeNull();
    expect(form!.getAttribute("action")).toBe(
      "https://buttondown.com/api/emails/embed-subscribe/somers",
    );
    expect(form!.getAttribute("method")).toBe("post");
    expect(form!.getAttribute("target")).toBe("_blank");
  });

  it("shows an honest error state — never a form navigating anywhere — when the email is blank", async () => {
    const NewsletterSignupForm = await loadForm();
    render(createElement(NewsletterSignupForm));

    const form = document.querySelector("form")!;
    fireEvent.submit(form);

    expect(screen.getByRole("alert").textContent).toMatch(/doesn't look like a valid email/i);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows an honest error state when the email is malformed (no @ at all)", async () => {
    const NewsletterSignupForm = await loadForm();
    render(createElement(NewsletterSignupForm));

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "not-an-email" },
    });
    fireEvent.submit(document.querySelector("form")!);

    expect(screen.getByRole("alert").textContent).toMatch(/doesn't look like a valid email/i);
  });

  it("shows an honest 'opened a new tab' status — NOT a fabricated 'you're subscribed' claim — once a plausible email is submitted", async () => {
    const NewsletterSignupForm = await loadForm();
    render(createElement(NewsletterSignupForm));

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "guest@example.com" },
    });
    fireEvent.submit(document.querySelector("form")!);

    const status = screen.getByRole("status");
    expect(status.textContent).toMatch(/opened buttondown in a new tab/i);
    // The dishonest claim this guards against: never assert a completed
    // subscription this page has no way to verify.
    expect(status.textContent).not.toMatch(/you('|’)re subscribed/i);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears a prior error state as soon as the visitor edits the field again", async () => {
    const NewsletterSignupForm = await loadForm();
    render(createElement(NewsletterSignupForm));

    fireEvent.submit(document.querySelector("form")!);
    expect(screen.getByRole("alert")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "g" },
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

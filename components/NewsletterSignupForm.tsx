"use client";

import { useState, type FormEvent } from "react";
import {
  BUTTONDOWN_EMBED_HIDDEN_FIELD_NAME,
  BUTTONDOWN_EMBED_HIDDEN_FIELD_VALUE,
  NEWSLETTER_SUBSCRIBE_CTA_ATTR,
  buttondownEmbedAction,
} from "@/lib/buttondown";

// Good-enough client-side syntax check — not meant to be a complete RFC
// 5322 validator (the required/type="email" attributes below and
// Buttondown's own server-side validation are the real backstops). Just
// enough to catch "forgot the @" / "left it blank" before a real network
// round trip, matching how the honest error state below is scoped.
const LOOKS_LIKE_AN_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = "idle" | "invalid" | "submitted";

/**
 * Tier 1 subscribe form — Buttondown's native embeddable form, submitted
 * directly to Buttondown's public embed-subscribe endpoint. No Parkio API
 * route, no API key: see lib/buttondown.ts's header comment for why that
 * endpoint is public and unauthenticated by design.
 *
 * `target="_blank"` keeps the visitor on parkio.info: the form POST (and
 * Buttondown's own confirmation response) opens in a new tab instead of
 * navigating this page away. Buttondown's own docs explicitly warn
 * against submitting this endpoint via fetch() instead, so the actual
 * POST below is still a plain <form> submit, unchanged from that
 * guidance — this component only adds an HONEST in-page status message
 * alongside it, client-side, as progressive enhancement:
 *
 *   - "invalid": the email the visitor typed doesn't look like an email.
 *     Shown instead of letting a doomed submission go anywhere.
 *   - "submitted": the real POST was allowed through and a Buttondown tab
 *     was opened. This deliberately does NOT claim "you're subscribed" —
 *     this page has no way to read Buttondown's cross-origin response, so
 *     claiming success it can't verify would be dishonest. It points the
 *     visitor at the one place that can actually confirm it.
 *
 * `noValidate` hands all validation feedback to this component instead of
 * the browser's native constraint-validation bubble, so the message is
 * consistent and testable. `required`/`type="email"` stay on the input
 * for assistive tech and for the no-JS case, where this component's
 * handler never attaches and the browser's own native validation is the
 * only thing left running — not a change from before.
 */
export function NewsletterSignupForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const trimmed = email.trim();
    if (!trimmed || !LOOKS_LIKE_AN_EMAIL.test(trimmed)) {
      event.preventDefault();
      setStatus("invalid");
      return;
    }
    // No preventDefault — let the real POST to Buttondown proceed
    // (target="_blank"), exactly as before.
    setStatus("submitted");
  }

  return (
    <form
      action={buttondownEmbedAction()}
      method="post"
      target="_blank"
      noValidate
      onSubmit={handleSubmit}
      className="mt-6 rounded-2xl border border-ink-100 bg-white p-6 sm:p-8"
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-accent-700">
        Subscribe via Buttondown
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink-600 sm:text-base">
        Drop your email below. Submitting opens a quick Buttondown
        confirmation in a new tab — you can close it and come right back
        here.
      </p>
      <input
        type="hidden"
        name={BUTTONDOWN_EMBED_HIDDEN_FIELD_NAME}
        value={BUTTONDOWN_EMBED_HIDDEN_FIELD_VALUE}
      />
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label htmlFor="newsletter-email" className="sr-only">
          Email address
        </label>
        <input
          id="newsletter-email"
          type="email"
          name="email"
          required
          placeholder="you@example.com"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (status !== "idle") setStatus("idle");
          }}
          aria-invalid={status === "invalid"}
          aria-describedby={status === "invalid" ? "newsletter-email-error" : undefined}
          className="w-full flex-1 rounded-full border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 shadow-soft outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100 sm:text-base"
        />
        <button
          type="submit"
          data-cta={NEWSLETTER_SUBSCRIBE_CTA_ATTR}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-ink-900 px-6 py-3 text-sm font-semibold text-white shadow-lift transition hover:bg-ink-800 sm:w-auto sm:flex-none"
        >
          Subscribe
        </button>
      </div>

      {status === "invalid" && (
        <p
          id="newsletter-email-error"
          role="alert"
          className="mt-3 text-sm font-medium text-red-600"
        >
          That doesn&apos;t look like a valid email address — fix it and
          try again.
        </p>
      )}
      {status === "submitted" && (
        <p role="status" className="mt-3 text-sm font-medium text-emerald-700">
          Opened Buttondown in a new tab — check it (or your inbox) to
          confirm. We can&apos;t see what happens over there from this
          page, so if nothing shows up, that tab is the place to look.
        </p>
      )}
      {status === "idle" && (
        <p className="mt-3 text-xs text-ink-500">
          Free · No spam · Unsubscribe anytime.
        </p>
      )}
    </form>
  );
}

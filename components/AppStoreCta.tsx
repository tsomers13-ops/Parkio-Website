import Link from "next/link";

import {
  APP_DOWNLOAD_CTA_ATTR,
  APP_STORE_LIVE,
  APP_STORE_URL,
} from "@/lib/appStore";
import { AppleGlyph } from "@/components/icons";

interface AppStoreCtaProps {
  /**
   * "card" sits inline in article bodies; "banner" spans full-width
   * for end-of-page funnels; "inline" is a quiet pill for sidebars.
   */
  variant?: "card" | "banner" | "inline";
  /** Headline override. */
  headline?: string;
  /** Subline override. */
  subline?: string;
}

/**
 * App Store call-to-action. Reads the App Store URL from
 * `lib/appStore` (single source of truth) so the URL and tracking
 * stay in sync with every other download CTA across the site.
 */
const APP_LIVE = APP_STORE_LIVE;

export function AppStoreCta({
  variant = "card",
  headline,
  subline,
}: AppStoreCtaProps) {
  const h = headline ?? "Parkio for iPhone";
  const s =
    subline ??
    "Live wait times, smart picks, and walk-time hints — designed for use in the park.";
  const ctaLabel = "Download Parkio";
  const ctaHref = APP_STORE_URL;
  const externalProps = APP_LIVE
    ? { target: "_blank" as const, rel: "noopener" as const }
    : {};
  const trackingAttr = { "data-cta": APP_DOWNLOAD_CTA_ATTR };

  if (variant === "inline") {
    return (
      <Link
        href={ctaHref}
        {...trackingAttr}
        className="group inline-flex items-center gap-2 rounded-full bg-ink-900 px-4 py-2 text-sm font-medium text-white shadow-soft transition hover:bg-ink-800"
        {...externalProps}
      >
        {APP_LIVE && <AppleGlyph className="h-4 w-4" />}
        <span>{ctaLabel}</span>
      </Link>
    );
  }

  if (variant === "banner") {
    return (
      <section className="relative overflow-hidden bg-ink-900 text-white">
        <div
          aria-hidden
          className="absolute inset-0 -z-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(50% 50% at 20% 30%, rgba(99,102,241,0.45) 0%, transparent 60%), radial-gradient(50% 50% at 85% 70%, rgba(56,189,248,0.35) 0%, transparent 60%)",
          }}
        />
        <div className="relative mx-auto flex max-w-5xl flex-col items-start gap-6 px-5 py-14 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-16">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/60">
              App-first
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              {h}
            </h2>
            <p className="mt-2 text-sm text-white/70 sm:text-base">{s}</p>
          </div>
          <Link
            href={ctaHref}
            {...trackingAttr}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink-900 shadow-lift transition hover:bg-ink-100"
            {...externalProps}
          >
            {APP_LIVE && <AppleGlyph className="h-4 w-4" />}
            {ctaLabel}
          </Link>
        </div>
      </section>
    );
  }

  // Default: card variant
  return (
    <div className="rounded-3xl bg-ink-900 p-5 text-white shadow-lift sm:p-6">
      <div className="flex items-start gap-3">
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15"
          aria-hidden
        >
          <AppleGlyph className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold tracking-tight">{h}</p>
          <p className="mt-1 text-sm text-white/70">{s}</p>
          <Link
            href={ctaHref}
            {...trackingAttr}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-ink-900 transition hover:bg-ink-100"
            {...externalProps}
          >
            {ctaLabel}
            <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
              <path
                d="M6 3l5 5-5 5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}

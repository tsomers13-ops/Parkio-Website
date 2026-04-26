import Link from "next/link";

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
 * App Store call-to-action. Reads the App Store URL from the
 * NEXT_PUBLIC_APP_STORE_URL env var so we can ship before the app is
 * publicly listed. When unset, falls back to /parks (the live web
 * experience) so the CTA still funnels into the product.
 */
const APP_STORE_URL =
  process.env.NEXT_PUBLIC_APP_STORE_URL ??
  process.env.APP_STORE_URL ??
  "/parks";

const APP_LIVE = APP_STORE_URL.startsWith("http");

export function AppStoreCta({
  variant = "card",
  headline,
  subline,
}: AppStoreCtaProps) {
  const h =
    headline ??
    (APP_LIVE
      ? "Parkio for iPhone"
      : "Until the app ships, the web is fast.");
  const s =
    subline ??
    (APP_LIVE
      ? "Live wait times, smart picks, and walk-time hints — designed for use in the park."
      : "Open Parkio on the web and get the same live picks and map.");
  const ctaLabel = APP_LIVE ? "Download on the App Store" : "Open Parkio";
  const ctaHref = APP_LIVE ? APP_STORE_URL : "/parks";

  if (variant === "inline") {
    return (
      <Link
        href={ctaHref}
        className="group inline-flex items-center gap-2 rounded-full bg-ink-900 px-4 py-2 text-sm font-medium text-white shadow-soft transition hover:bg-ink-800"
        {...(APP_LIVE ? { target: "_blank", rel: "noopener" } : {})}
      >
        {APP_LIVE && <AppleGlyph />}
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
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink-900 shadow-lift transition hover:bg-ink-100"
            {...(APP_LIVE ? { target: "_blank", rel: "noopener" } : {})}
          >
            {APP_LIVE && <AppleGlyph />}
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
          <AppleGlyph />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold tracking-tight">{h}</p>
          <p className="mt-1 text-sm text-white/70">{s}</p>
          <Link
            href={ctaHref}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-ink-900 transition hover:bg-ink-100"
            {...(APP_LIVE ? { target: "_blank", rel: "noopener" } : {})}
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

/** Subtle Apple glyph — used inline on App Store buttons. */
function AppleGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="currentColor"
      aria-hidden
    >
      <path d="M16.5 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.9-3.1-.9-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.7 2.5 3 2.5 1.2 0 1.7-.8 3.2-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.5-1-2.5-3.7zM14.3 5.6c.7-.8 1.2-2 1.1-3.2-1 0-2.3.7-3 1.5-.6.7-1.2 1.9-1.1 3.1 1.1.1 2.3-.6 3-1.4z" />
    </svg>
  );
}

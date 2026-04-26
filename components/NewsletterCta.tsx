import Link from "next/link";

interface NewsletterCtaProps {
  /**
   * Visual variant. "card" sits inside an article body; "banner"
   * spans full width as a section-level block; "inline" is a quiet
   * one-liner for sidebars/footers.
   */
  variant?: "card" | "banner" | "inline";
  /** Optional override headline. Sensible default per variant. */
  headline?: string;
  /** Optional override subline. Sensible default per variant. */
  subline?: string;
}

/**
 * Newsletter signup call-to-action. Routes to /newsletter where the
 * actual Beehiiv embed lives. We deliberately don't inline a form
 * here — the dedicated page makes Beehiiv's embed code easier to
 * swap in once the user has the form ID.
 */
export function NewsletterCta({
  variant = "card",
  headline,
  subline,
}: NewsletterCtaProps) {
  const h =
    headline ??
    (variant === "inline"
      ? "Get the daily briefing in your inbox."
      : "Parkio Daily in your inbox.");
  const s =
    subline ??
    (variant === "inline"
      ? "Free daily theme-park briefing."
      : "A 3-minute Disney parks briefing every morning. Free.");

  if (variant === "inline") {
    return (
      <Link
        href="/newsletter"
        className="group inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-800 shadow-soft transition hover:border-ink-300 hover:text-ink-900"
      >
        <span aria-hidden>📨</span>
        <span>{h}</span>
        <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
          <path
            d="M6 3l5 5-5 5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </Link>
    );
  }

  if (variant === "banner") {
    return (
      <section className="relative overflow-hidden border-y border-ink-100 bg-gradient-to-br from-accent-50 via-white to-emerald-50/30">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-accent-400/70 to-transparent"
        />
        <div className="mx-auto flex max-w-5xl flex-col items-start gap-6 px-5 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-14">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-accent-700">
              Parkio Daily
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
              {h}
            </h2>
            <p className="mt-2 text-sm text-ink-600 sm:text-base">{s}</p>
          </div>
          <Link
            href="/newsletter"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-sm font-semibold text-white shadow-lift transition hover:bg-ink-800"
          >
            Subscribe — free
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
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
      </section>
    );
  }

  // Default: card variant — sits inside article bodies
  return (
    <div className="rounded-3xl border border-ink-100 bg-white p-5 shadow-soft sm:p-6">
      <div className="flex items-start gap-3">
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-50 text-base ring-1 ring-accent-100"
          aria-hidden
        >
          📨
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold tracking-tight text-ink-900">
            {h}
          </p>
          <p className="mt-1 text-sm text-ink-600">{s}</p>
          <Link
            href="/newsletter"
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-800"
          >
            Subscribe
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

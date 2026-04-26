import Link from "next/link";

type Variant = "picks" | "waits" | "app";

interface ConversionBlockProps {
  variant: Variant;
}

/**
 * In-article conversion blocks. The Parkio Daily article body
 * interleaves 2–3 of these between content sections so a reader
 * scanning vertically always passes a button that takes them into
 * the live product (or the App Store).
 *
 * Three variants:
 *   - "picks": "Know what to ride next — instantly." → /parks (Parkio Picks)
 *   - "waits": "Check live wait times" → /waits (all parks)
 *   - "app":   "Download the Parkio app" → App Store URL (or /parks fallback)
 *
 * Each block reads as a self-contained card with one obvious primary
 * action. Deliberately not stacked or busy.
 */
export function ConversionBlock({ variant }: ConversionBlockProps) {
  if (variant === "picks") {
    return (
      <div className="my-10 overflow-hidden rounded-3xl border border-ink-100 bg-gradient-to-br from-accent-50 via-white to-emerald-50/30 p-6 shadow-soft sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent-700">
          Stop reading. Start riding.
        </p>
        <h3 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900 sm:text-[28px]">
          Know what to ride next — instantly.
        </h3>
        <p className="mt-2 max-w-xl text-sm text-ink-600 sm:text-base">
          Parkio Picks ranks the best ride right now using live waits +
          ride popularity + walk distance. Three taps to your next ride.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href="/parks"
            className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-sm font-semibold text-white shadow-lift transition hover:bg-ink-800"
          >
            Open Parkio
            <Chevron />
          </Link>
          <Link
            href="/waits"
            className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-5 py-3 text-sm font-medium text-ink-800 transition hover:border-ink-300"
          >
            Check live waits
          </Link>
        </div>
      </div>
    );
  }

  if (variant === "waits") {
    return (
      <div className="my-10 rounded-3xl border border-ink-100 bg-white p-6 shadow-soft sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
            Live · refreshes every minute
          </p>
        </div>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900 sm:text-[28px]">
          Check live wait times across all 6 parks.
        </h3>
        <p className="mt-2 max-w-xl text-sm text-ink-600 sm:text-base">
          One screen, every park, every ride. The same data this briefing
          is built on.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href="/waits"
            className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-sm font-semibold text-white shadow-lift transition hover:bg-ink-800"
          >
            Check live waits
            <Chevron />
          </Link>
          <Link
            href="/parks"
            className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-5 py-3 text-sm font-medium text-ink-800 transition hover:border-ink-300"
          >
            Open Parkio
          </Link>
        </div>
      </div>
    );
  }

  // variant === "app"
  return (
    <div className="my-10 overflow-hidden rounded-3xl bg-ink-900 p-6 text-white shadow-lift sm:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(40% 40% at 20% 30%, rgba(99,102,241,0.45) 0%, transparent 60%), radial-gradient(50% 50% at 80% 70%, rgba(56,189,248,0.35) 0%, transparent 60%)",
        }}
      />
      <p className="text-xs font-semibold uppercase tracking-widest text-white/60">
        Built for use in the park
      </p>
      <h3 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[28px]">
        Download the Parkio app.
      </h3>
      <p className="mt-2 max-w-xl text-sm text-white/70 sm:text-base">
        Live wait times, smart picks, walk-time hints, and the map —
        designed for one-handed use while your kids are pulling at you.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <AppStoreInlineCta />
        <Link
          href="/parks"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-medium text-white/90 backdrop-blur transition hover:bg-white/10"
        >
          Or open on the web
        </Link>
      </div>
    </div>
  );
}

function Chevron() {
  return (
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
  );
}

/**
 * Inline App Store button. Reads the App Store URL from env at build
 * time. Falls back to "Open Parkio on the web" when the URL isn't yet
 * configured, so the funnel is never broken.
 */
function AppStoreInlineCta() {
  const url =
    process.env.NEXT_PUBLIC_APP_STORE_URL ??
    process.env.APP_STORE_URL ??
    "/parks";
  const live = url.startsWith("http");
  return (
    <Link
      href={url}
      className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink-900 shadow-lift transition hover:bg-ink-100"
      {...(live ? { target: "_blank", rel: "noopener" } : {})}
    >
      {live ? (
        <>
          <AppleGlyph />
          Download on the App Store
        </>
      ) : (
        <>
          Open Parkio
          <Chevron />
        </>
      )}
    </Link>
  );
}

function AppleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M16.5 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.9-3.1-.9-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.7 2.5 3 2.5 1.2 0 1.7-.8 3.2-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.5-1-2.5-3.7zM14.3 5.6c.7-.8 1.2-2 1.1-3.2-1 0-2.3.7-3 1.5-.6.7-1.2 1.9-1.1 3.1 1.1.1 2.3-.6 3-1.4z" />
    </svg>
  );
}

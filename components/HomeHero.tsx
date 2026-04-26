import Link from "next/link";

const APP_STORE_URL =
  process.env.NEXT_PUBLIC_APP_STORE_URL ??
  process.env.APP_STORE_URL ??
  "";
const APP_LIVE = APP_STORE_URL.startsWith("http");

/**
 * Conversion-focused homepage hero.
 *
 * Primary CTA: Download on the App Store (or "Open Parkio" until the
 * App Store URL is set in env). Secondary CTA: jump straight into a
 * park page so a curious visitor can feel the live product before
 * committing to a download.
 */
export function HomeHero() {
  return (
    <section className="relative overflow-hidden">
      <div className="bg-aurora absolute inset-0 -z-10" />

      <div className="mx-auto max-w-7xl px-5 pb-16 pt-14 sm:px-8 sm:pb-24 sm:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-12">
          {/* Copy column */}
          <div className="lg:col-span-7">
            <div className="flex animate-fade-up flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/70 px-3 py-1 text-xs font-medium text-ink-600 shadow-soft backdrop-blur">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Live wait times · Updated every minute
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white/70 px-3 py-1 text-xs font-medium text-ink-600 shadow-soft backdrop-blur">
                <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3" aria-hidden>
                  <rect
                    x="4"
                    y="1"
                    width="8"
                    height="14"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.4"
                  />
                  <circle cx="8" cy="12.5" r="0.7" fill="currentColor" />
                </svg>
                Designed for iPhone
              </span>
            </div>

            <h1
              className="mt-6 animate-fade-up text-5xl font-semibold leading-[1.05] tracking-tight text-ink-900 sm:text-6xl lg:text-7xl"
              style={{ animationDelay: "60ms" }}
            >
              Plan less.
              <br />
              <span className="bg-gradient-to-br from-accent-600 via-accent-500 to-sky-500 bg-clip-text text-transparent">
                Ride more.
              </span>
            </h1>

            <p
              className="mt-6 max-w-xl animate-fade-up text-lg text-ink-600 sm:text-xl"
              style={{ animationDelay: "120ms" }}
            >
              Real-time wait times, smart ride picks, and a clean park
              map — built for one-handed use while your kids are pulling
              at you. All six U.S. Disney parks. iPhone-first.
            </p>

            <div
              className="mt-8 flex animate-fade-up flex-col gap-3 sm:flex-row sm:items-center"
              style={{ animationDelay: "180ms" }}
            >
              <PrimaryCta />
              <Link
                href="/parks/magic-kingdom"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-ink-200 bg-white/80 px-5 py-3 text-sm font-medium text-ink-800 shadow-soft backdrop-blur transition hover:border-ink-300 hover:bg-white"
              >
                Open a park
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
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
            </div>

            <p
              className="mt-4 animate-fade-up text-xs text-ink-500"
              style={{ animationDelay: "240ms" }}
            >
              Free · No account required to try the web · Privacy-first.
            </p>
          </div>

          {/* Mock phone preview */}
          <div className="hidden lg:col-span-5 lg:block">
            <PhoneMock />
          </div>
        </div>
      </div>
    </section>
  );
}

function PrimaryCta() {
  if (APP_LIVE) {
    return (
      <Link
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener"
        className="group inline-flex items-center justify-center gap-2.5 rounded-full bg-ink-900 px-6 py-3.5 text-base font-semibold text-white shadow-lift transition hover:bg-ink-800 active:scale-[0.98]"
      >
        <AppleGlyph />
        Download on the App Store
      </Link>
    );
  }
  // Fallback while the App Store listing is pre-launch — the live web
  // experience is a meaningful funnel destination on its own.
  return (
    <Link
      href="/parks"
      className="group inline-flex items-center justify-center gap-2.5 rounded-full bg-ink-900 px-6 py-3.5 text-base font-semibold text-white shadow-lift transition hover:bg-ink-800 active:scale-[0.98]"
    >
      Open Parkio
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
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
  );
}

function AppleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M16.5 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.9-3.1-.9-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.7 2.5 3 2.5 1.2 0 1.7-.8 3.2-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.5-1-2.5-3.7zM14.3 5.6c.7-.8 1.2-2 1.1-3.2-1 0-2.3.7-3 1.5-.6.7-1.2 1.9-1.1 3.1 1.1.1 2.3-.6 3-1.4z" />
    </svg>
  );
}

/**
 * Static phone mock — visually evokes the actual Parkio Picks UI
 * without tying the homepage to live data fetches. Renders only on
 * lg+ to keep mobile clean and fast.
 */
function PhoneMock() {
  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div
        className="absolute inset-0 -z-10 translate-y-4 rounded-[3rem] bg-gradient-to-br from-accent-500/30 via-sky-400/20 to-pink-400/20 blur-2xl"
        aria-hidden
      />
      <div className="relative rounded-[2.5rem] border border-ink-200/70 bg-ink-900 p-2.5 shadow-lift">
        <div className="overflow-hidden rounded-[2rem] bg-white">
          {/* Status bar mock */}
          <div className="flex items-center justify-between bg-white px-5 pt-4 pb-2 text-[11px] font-semibold text-ink-900">
            <span>9:41</span>
            <span className="flex items-center gap-1 text-ink-700">
              <span aria-hidden>●●●●</span>
              <span aria-hidden>📶</span>
            </span>
          </div>

          {/* Top bar */}
          <div className="flex items-center gap-2 px-4 pb-3">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-sky-500">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-white" aria-hidden>
                <path
                  d="M12 3l3 6 6 .9-4.5 4.4 1 6.2L12 17.8 6.5 20.5l1-6.2L3 9.9 9 9l3-6z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <div>
              <div className="text-[10px] font-medium uppercase tracking-widest text-ink-500">
                Magic Kingdom
              </div>
              <div className="text-[12px] font-semibold text-ink-900">
                Live · refreshes every minute
              </div>
            </div>
          </div>

          {/* Right Now hero */}
          <div className="mx-3 mb-3 rounded-2xl bg-gradient-to-br from-accent-50 to-emerald-50/40 p-3.5 ring-1 ring-accent-100">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-accent-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-500" />
              Right now
            </div>
            <div className="mt-1.5 text-[15px] font-semibold tracking-tight text-ink-900">
              Pirates of the Caribbean
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[11px]">
              <span className="rounded-full bg-accent-100 px-1.5 py-0.5 font-semibold text-accent-700">
                Headliner
              </span>
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-700">
                Low wait
              </span>
              <span className="text-ink-500">· 5 min walk</span>
            </div>
            <div className="mt-2.5 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold tabular-nums text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                10 min
              </span>
              <span className="text-[11px] font-medium text-accent-700">
                View on map →
              </span>
            </div>
          </div>

          {/* Picks rows */}
          <div className="px-3 pb-4">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">
              Best right now
            </div>
            {[
              ["Haunted Mansion", "13", "emerald"],
              ["Space Mountain", "30", "amber"],
              ["Peter Pan's Flight", "35", "amber"],
            ].map(([name, wait, tone]) => (
              <div
                key={name as string}
                className="mt-2 flex items-center justify-between rounded-xl bg-white px-2.5 py-2 ring-1 ring-ink-100"
              >
                <div className="min-w-0 truncate text-[13px] font-semibold text-ink-900">
                  {name}
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
                    tone === "emerald"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  <span
                    className={`h-1 w-1 rounded-full ${
                      tone === "emerald" ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                  {wait} min
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

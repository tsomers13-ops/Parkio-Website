import Link from "next/link";

interface Outcome {
  eyebrow: string;
  headline: string;
  body: string;
  bullets: string[];
  ctaLabel: string;
  ctaHref: string;
}

const OUTCOMES: Outcome[] = [
  {
    eyebrow: "Smart recommendations",
    headline: "Skip the longest waits without thinking.",
    body: "Parkio Picks ranks rides by live waits, ride popularity, and how close they are. Headliners come first when waits are reasonable; walk-on gems get featured when waits are tiny.",
    bullets: [
      "Three tiers: headliners, walk-on gems, regular gems",
      "A 30-min Space Mountain still beats a far-away walk-on",
      "Auto-refreshes — top pick changes when waits change",
    ],
    ctaLabel: "See it in a park",
    ctaHref: "/parks/magic-kingdom",
  },
  {
    eyebrow: "Live wait times",
    headline: "Real numbers, refreshed every minute.",
    body: "Every ride at every park, color-coded by wait. Down, refurb, and closed states surfaced clearly — never accidentally walk to a ride that's broken.",
    bullets: [
      "All six U.S. Disney parks on one screen",
      "Color-coded pills: green ≤ 30 · amber 31–60 · rose 60+",
      "Stale-data warnings when the upstream lags",
    ],
    ctaLabel: "Check live waits",
    ctaHref: "/waits",
  },
  {
    eyebrow: "Day planning",
    headline: "Know what's coming before you walk over.",
    body: "Walk-time hints from your last ride. Happening Soon for the next 90 minutes of shows and character meets. Path hints that show roughly which way to go.",
    bullets: [
      "Walk-time buckets: 1–2 min, 3–5 min, 5–8 min",
      "Happening Soon — never miss Cinderella's 3:15 PM slot",
      "Subtle path hints from your last selected ride",
    ],
    ctaLabel: "Open a park",
    ctaHref: "/parks",
  },
];

/**
 * Outcome-focused features section. Each card leads with WHAT THE
 * GUEST GETS, not what the technology does. CTA at the bottom of each
 * card sends them somewhere they can experience that outcome live.
 */
export function HomeOutcomes() {
  return (
    <section className="relative border-y border-ink-100 bg-ink-50/40">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent-600">
            What you actually get
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            Built around what guests actually need.
          </h2>
          <p className="mt-3 text-base text-ink-600 sm:text-lg">
            Three core features. Each saves real time in the park.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {OUTCOMES.map((o) => (
            <article
              key={o.eyebrow}
              className="flex h-full flex-col rounded-3xl border border-ink-100 bg-white p-6 shadow-soft transition hover:shadow-lift sm:p-8"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-accent-600">
                {o.eyebrow}
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">
                {o.headline}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-600 sm:text-base">
                {o.body}
              </p>

              <ul className="mt-4 space-y-2">
                {o.bullets.map((b) => (
                  <li
                    key={b}
                    className="flex gap-2 text-sm leading-snug text-ink-700"
                  >
                    <Check />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-5">
                <Link
                  href={o.ctaHref}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-700 transition hover:text-accent-900"
                >
                  {o.ctaLabel}
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
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Check() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
      aria-hidden
    >
      <path
        d="M3.5 8.5l3 3 6-6.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

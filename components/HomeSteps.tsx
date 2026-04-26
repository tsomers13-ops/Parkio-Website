import Link from "next/link";

interface Step {
  n: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    n: "01",
    title: "Open the park you're in.",
    body: "Six U.S. Disney parks. One tap to the right one.",
  },
  {
    n: "02",
    title: "Read Parkio Picks.",
    body: "Smart ranking by live waits, ride popularity, and how close you are.",
  },
  {
    n: "03",
    title: "Walk over and ride.",
    body: "Live updates every minute. No replanning. Just the next ride.",
  },
];

/**
 * "How it works" — three steps, minimal text, single CTA at the end.
 * The point: communicate that there's no learning curve — Parkio is
 * usable in 3 taps.
 */
export function HomeSteps() {
  return (
    <section className="relative bg-white">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent-600">
            How it works
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            Three taps to your next ride.
          </h2>
        </div>

        <ol className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li
              key={step.n}
              className="relative rounded-3xl border border-ink-100 bg-white p-6 shadow-soft transition hover:shadow-lift sm:p-7"
            >
              <span className="text-xs font-semibold uppercase tracking-widest text-accent-600">
                Step {step.n}
              </span>
              <p className="mt-2 text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">
                {step.title}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-600 sm:text-base">
                {step.body}
              </p>

              {/* Connector chevron between cards on desktop */}
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-ink-200 md:block"
                >
                  <svg viewBox="0 0 16 16" className="h-5 w-5">
                    <path
                      d="M6 3l5 5-5 5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </svg>
                </span>
              )}
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            href="/parks"
            className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-sm font-semibold text-white shadow-lift transition hover:bg-ink-800"
          >
            Open Parkio
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
      </div>
    </section>
  );
}

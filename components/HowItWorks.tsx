type Step = {
  num: string;
  title: string;
  body: string;
  icon: React.ReactNode;
};

const STEPS: Step[] = [
  {
    num: "01",
    title: "Pick a park",
    body: "Six U.S. Disney parks supported across Walt Disney World and Disneyland Resort. Open status and today's hours update in real time.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
        <path
          d="M9 4l-5 2v14l5-2 6 2 5-2V4l-5 2-6-2z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M9 4v14M15 6v14" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    num: "02",
    title: "See live wait times",
    body: "Each ride pin shows its current standby wait, color-coded so you can scan the map and decide in seconds.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M12 7v5l3 2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    num: "03",
    title: "Plan your day",
    body: "Tap any ride for height requirements, Lightning Lane status, and details. Everything you need to make the next call — without overthinking it.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
        <path
          d="M3 17l4-5 4 3 4-7 6 9"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

export function HowItWorks() {
  return (
    <section className="relative border-t border-ink-100 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-widest text-accent-600">
            How it works
          </p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
            Open. Glance. Decide. Go.
          </h2>
          <p className="mt-5 text-lg text-ink-600">
            Parkio is built for the way park days actually go — quick
            decisions, real numbers, no clutter.
          </p>
        </div>

        <ol className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step) => (
            <li
              key={step.num}
              className="relative rounded-3xl border border-ink-100 bg-white p-6 shadow-soft transition hover:-translate-y-0.5 hover:border-ink-200 hover:shadow-lift"
            >
              <div className="flex items-center justify-between">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-50 text-accent-700 ring-1 ring-accent-100">
                  {step.icon}
                </div>
                <span className="text-xs font-semibold tracking-widest text-ink-400">
                  {step.num}
                </span>
              </div>
              <h3 className="mt-5 text-base font-semibold tracking-tight text-ink-900">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

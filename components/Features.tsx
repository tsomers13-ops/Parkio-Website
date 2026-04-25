type Feature = {
  title: string;
  description: string;
  icon: React.ReactNode;
};

const FEATURES: Feature[] = [
  {
    title: "Real-time wait times",
    description:
      "Live updates from across the parks. Color-coded so you can spot the win without thinking.",
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
    title: "Smart park maps",
    description:
      "Glanceable, beautiful maps with everything you need — and nothing you don't.",
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
    title: "Ride insights",
    description:
      "Trends, height requirements, Lightning Lane status, and the context you need to choose.",
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
  {
    title: "Fast, simple experience",
    description:
      "Built for real park usage — minimal taps, glanceable hierarchy, and instant load.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
        <path
          d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

export function Features() {
  return (
    <section
      id="features"
      className="relative border-t border-ink-100 bg-white py-20 sm:py-28"
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-widest text-accent-600">
            Why Parkio
          </p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
            Faster, simpler, and built for the day in front of you.
          </h2>
          <p className="mt-5 text-lg text-ink-600">
            Disney is magical. Disney apps are not. Parkio gets out of your
            way so you can focus on what you came for.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-3xl border border-ink-100 bg-white p-6 shadow-soft transition hover:-translate-y-0.5 hover:border-ink-200 hover:shadow-lift"
            >
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-50 text-accent-700 ring-1 ring-accent-100">
                {f.icon}
              </div>
              <h3 className="mt-5 text-base font-semibold tracking-tight text-ink-900">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

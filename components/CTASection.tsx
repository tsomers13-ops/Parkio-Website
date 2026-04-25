import Link from "next/link";

export function CTASection() {
  return (
    <section className="relative overflow-hidden bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <div className="relative overflow-hidden rounded-4xl bg-ink-900 px-8 py-16 text-center text-white shadow-lift sm:px-16">
          <div
            aria-hidden
            className="absolute inset-0 -z-0 opacity-70"
            style={{
              backgroundImage:
                "radial-gradient(60% 60% at 20% 20%, rgba(99,102,241,0.45) 0%, transparent 60%), radial-gradient(50% 50% at 80% 30%, rgba(56,189,248,0.35) 0%, transparent 60%), radial-gradient(60% 60% at 50% 100%, rgba(244,114,182,0.30) 0%, transparent 60%)",
            }}
          />
          <div className="relative">
            <p className="text-sm font-medium uppercase tracking-widest text-white/70">
              Ready when you are
            </p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
              Plan smarter. Wait less.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-white/70 sm:text-lg">
              Open the parks the way they should have been from the start —
              fast, clear, and beautifully simple.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/parks"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-ink-900 shadow-lift transition hover:bg-ink-100 active:scale-[0.98]"
              >
                Open Parkio
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  className="h-3.5 w-3.5"
                  aria-hidden
                >
                  <path
                    d="M6 3l5 5-5 5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
              <Link
                href="/#features"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-medium text-white/90 backdrop-blur transition hover:bg-white/10"
              >
                See features
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

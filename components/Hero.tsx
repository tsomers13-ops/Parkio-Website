import Link from "next/link";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="bg-aurora absolute inset-0 -z-10" />
      <div className="mx-auto max-w-7xl px-5 pb-20 pt-16 sm:px-8 sm:pb-28 sm:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-12">
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
                  <rect x="4" y="1" width="8" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" />
                  <circle cx="8" cy="12.5" r="0.7" fill="currentColor" />
                </svg>
                Designed for iPhone
              </span>
            </div>

            <h1
              className="mt-6 animate-fade-up text-5xl font-semibold leading-[1.05] tracking-tight text-ink-900 sm:text-6xl lg:text-7xl"
              style={{ animationDelay: "60ms" }}
            >
              Skip the Lines.
              <br />
              <span className="bg-gradient-to-br from-accent-600 via-accent-500 to-sky-500 bg-clip-text text-transparent">
                Own Your Day.
              </span>
            </h1>

            <p
              className="mt-6 max-w-xl animate-fade-up text-lg text-ink-600 sm:text-xl"
              style={{ animationDelay: "120ms" }}
            >
              Real-time wait times across all six Disney parks — Walt Disney
              World and Disneyland Resort — designed for iPhone, built for the
              way you actually visit.
            </p>

            <div
              className="mt-8 flex animate-fade-up flex-wrap items-center gap-3"
              style={{ animationDelay: "180ms" }}
            >
              <Link
                href="/parks"
                className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-white shadow-lift transition hover:bg-ink-800 active:scale-[0.98]"
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
                href="/#how-it-works"
                className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-5 py-3 text-sm font-medium text-ink-800 shadow-soft transition hover:border-ink-300 hover:bg-ink-50"
              >
                See how it works
              </Link>
            </div>

            <div
              className="mt-10 flex animate-fade-up flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-500"
              style={{ animationDelay: "240ms" }}
            >
              <Stat label="Parks supported" value="6" />
              <Stat label="Rides tracked" value="80+" />
              <Stat label="Updates" value="Real-time" />
            </div>
          </div>

          <div className="lg:col-span-5">
            <PhoneMock />
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-base font-semibold text-ink-900">{value}</span>
      <span>{label}</span>
    </div>
  );
}

function PhoneMock() {
  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div className="absolute -inset-8 -z-10 bg-gradient-to-tr from-accent-200/40 via-sky-200/40 to-pink-200/40 blur-3xl" />
      <div
        className="relative animate-fade-up rounded-[2.5rem] border border-ink-200 bg-white/90 p-3 shadow-lift backdrop-blur"
        style={{ animationDelay: "120ms" }}
      >
        <div className="overflow-hidden rounded-[2rem] bg-ink-50">
          <div className="flex items-center justify-between px-5 pt-5 text-[11px] font-medium text-ink-500">
            <span>9:41</span>
            <div className="flex items-center gap-1 text-ink-400">
              <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
                <path
                  d="M2 11h2v3H2zM6 8h2v6H6zM10 5h2v9h-2zM14 2h0v12"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>

          <div className="px-5 pt-4">
            <div className="text-xs font-medium text-ink-500">
              Magic Kingdom
            </div>
            <div className="text-lg font-semibold tracking-tight text-ink-900">
              Today · 78°F · Sunny
            </div>
          </div>

          <div className="mx-5 mt-4 rounded-2xl bg-white p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-ink-400">
                  Now trending
                </div>
                <div className="mt-0.5 text-[15px] font-semibold text-ink-900">
                  Space Mountain
                </div>
                <div className="text-xs text-ink-500">Tomorrowland</div>
              </div>
              <div className="rounded-xl bg-rose-50 px-3 py-2 text-center ring-1 ring-rose-200">
                <div className="text-base font-semibold text-rose-700">
                  65 min
                </div>
                <div className="text-[10px] font-medium text-rose-600">
                  ↑ rising
                </div>
              </div>
            </div>
          </div>

          <div className="mx-5 mt-3 grid grid-cols-2 gap-3">
            <MiniRide name="Pirates of the Caribbean" wait={25} tone="low" />
            <MiniRide name="Haunted Mansion" wait={35} tone="mid" />
            <MiniRide name="Big Thunder" wait={45} tone="mid" />
            <MiniRide name="Seven Dwarfs" wait={80} tone="high" />
          </div>

          <div className="mt-6 px-5 pb-6">
            <div className="flex items-center justify-between rounded-2xl bg-ink-900 px-4 py-3 text-white">
              <div>
                <div className="text-[11px] font-medium opacity-70">
                  Smart plan ready
                </div>
                <div className="text-sm font-semibold">
                  Save ~2h 15m today
                </div>
              </div>
              <div className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium">
                View
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniRide({
  name,
  wait,
  tone,
}: {
  name: string;
  wait: number;
  tone: "low" | "mid" | "high";
}) {
  const styles = {
    low: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    mid: "bg-amber-50 text-amber-700 ring-amber-200",
    high: "bg-rose-50 text-rose-700 ring-rose-200",
  }[tone];

  return (
    <div className="rounded-2xl bg-white p-3 shadow-soft">
      <div className="line-clamp-1 text-[12px] font-medium text-ink-700">
        {name}
      </div>
      <div
        className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${styles}`}
      >
        {wait} min
      </div>
    </div>
  );
}

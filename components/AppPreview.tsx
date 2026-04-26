import Link from "next/link";

export function AppPreview() {
  return (
    <section
      id="preview"
      className="relative overflow-hidden border-t border-ink-100 bg-ink-50/50 py-20 sm:py-28"
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-accent-600">
            The product
          </p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
            One map. Every ride. Zero clutter.
          </h2>
          <p className="mt-5 text-lg text-ink-600">
            Designed mobile-first for the way you actually move through the
            parks — open, glance, decide, go.
          </p>
        </div>

        <div className="relative mx-auto mt-14 max-w-5xl overflow-hidden rounded-4xl border border-ink-200 bg-white shadow-lift">
          <div className="grid grid-cols-1 lg:grid-cols-2">
            <div className="relative aspect-[5/4] overflow-hidden bg-ink-50">
              <MapBackdrop />
              <MapPin top="22%" left="20%" tier="low" label="22 min" name="Pirates" />
              <MapPin top="32%" left="68%" tier="high" label="68 min" name="Space Mtn" />
              <MapPin top="58%" left="42%" tier="mid" label="40 min" name="Haunted" />
              <MapPin top="68%" left="78%" tier="low" label="18 min" name="Carousel" />
              <MapPin top="48%" left="14%" tier="mid" label="35 min" name="Thunder" />
            </div>

            <div className="border-t border-ink-100 p-8 lg:border-l lg:border-t-0 lg:p-12">
              <div className="text-xs font-medium uppercase tracking-widest text-ink-500">
                Selected
              </div>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">
                Space Mountain
              </h3>
              <div className="mt-1 text-sm text-ink-500">
                Tomorrowland · Magic Kingdom
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3">
                <Stat label="Wait" value="68 min" tone="high" />
                <Stat label="Trend" value="↑ Rising" tone="warn" />
                <Stat label="Lightning Lane" value="Yes" tone="ok" />
              </div>

              <p className="mt-6 text-sm leading-relaxed text-ink-600">
                Blast through the cosmos on a high-speed indoor coaster in
                near total darkness. A Magic Kingdom classic.
              </p>

              <div className="mt-6 flex gap-3">
                <Link
                  href="/parks"
                  className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-4 py-2.5 text-sm font-medium text-white shadow-soft transition hover:bg-ink-800 active:scale-[0.98]"
                >
                  Open the map
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
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MapBackdrop() {
  return (
    <div className="absolute inset-0">
      <div className="bg-dots absolute inset-0 opacity-70" />
      <svg
        viewBox="0 0 400 320"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <defs>
          <linearGradient id="path" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#cbd5e1" />
            <stop offset="100%" stopColor="#e2e8f0" />
          </linearGradient>
        </defs>
        <path
          d="M40 240 C 90 180, 130 220, 180 180 S 280 120, 360 80"
          stroke="url(#path)"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M60 80 C 110 100, 150 70, 200 110 S 300 200, 370 220"
          stroke="url(#path)"
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          opacity="0.7"
        />
      </svg>
    </div>
  );
}

function MapPin({
  top,
  left,
  tier,
  label,
  name,
}: {
  top: string;
  left: string;
  tier: "low" | "mid" | "high";
  label: string;
  name: string;
}) {
  const tone = {
    low: "bg-emerald-500",
    mid: "bg-amber-500",
    high: "bg-rose-500",
  }[tier];

  const ring = {
    low: "ring-emerald-300/50",
    mid: "ring-amber-300/50",
    high: "ring-rose-300/50",
  }[tier];

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ top, left }}
    >
      <div
        className={`relative flex items-center gap-2 rounded-full bg-white px-2.5 py-1 shadow-soft ring-1 ${ring}`}
      >
        <span
          className={`relative inline-flex h-2.5 w-2.5 items-center justify-center rounded-full ${tone}`}
        >
          <span
            className={`absolute inline-flex h-full w-full animate-pulse-ring rounded-full ${tone} opacity-50`}
          />
        </span>
        <span className="text-[11px] font-semibold text-ink-800">
          {label}
        </span>
      </div>
      <div className="ml-2 mt-1 text-[10px] font-medium text-ink-500">
        {name}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn" | "high";
}) {
  const styles = {
    ok: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    warn: "bg-amber-50 text-amber-700 ring-amber-200",
    high: "bg-rose-50 text-rose-700 ring-rose-200",
  }[tone];

  return (
    <div className={`rounded-2xl px-3 py-2 ring-1 ${styles}`}>
      <div className="text-[10px] font-medium uppercase tracking-widest opacity-70">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}

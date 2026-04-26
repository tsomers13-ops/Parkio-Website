import Link from "next/link";

interface PreviewRide {
  name: string;
  parkSlug: string;
  parkName: string;
  parkColor: string;
  waitMin: number;
  tone: "emerald" | "amber" | "rose";
  badges: ("Headliner" | "Low wait")[];
}

/**
 * Static "Right now" preview for the homepage.
 *
 * The actual product surface fetches live data; the homepage uses
 * representative editorial picks so the section is fast, SEO-clean,
 * and doesn't depend on the upstream API. Cards visually mirror the
 * production WaitPill + Headliner/Low-wait badge styling so the page
 * reads as a continuous experience with the live product.
 */
const PREVIEW_RIDES: PreviewRide[] = [
  {
    name: "Pirates of the Caribbean",
    parkSlug: "magic-kingdom",
    parkName: "Magic Kingdom",
    parkColor: "#6366f1",
    waitMin: 10,
    tone: "emerald",
    badges: ["Headliner", "Low wait"],
  },
  {
    name: "Soarin' Around the World",
    parkSlug: "epcot",
    parkName: "EPCOT",
    parkColor: "#0ea5e9",
    waitMin: 15,
    tone: "emerald",
    badges: ["Headliner", "Low wait"],
  },
  {
    name: "The Twilight Zone Tower of Terror",
    parkSlug: "hollywood-studios",
    parkName: "Hollywood Studios",
    parkColor: "#ef4444",
    waitMin: 25,
    tone: "emerald",
    badges: ["Headliner"],
  },
];

export function HomeRightNow() {
  return (
    <section className="relative border-y border-ink-100 bg-gradient-to-b from-white via-ink-50/30 to-white">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
                Right now
              </p>
            </div>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              What's good right now.
            </h2>
            <p className="mt-3 text-base text-ink-600 sm:text-lg">
              Parkio Picks ranks rides by live waits, popularity, and how
              close they are to where you are. Three taps to your next
              ride — no overthinking.
            </p>
          </div>

          <Link
            href="/parks"
            className="hidden shrink-0 items-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-sm font-semibold text-white shadow-lift transition hover:bg-ink-800 sm:inline-flex"
          >
            Open Parkio
            <Chevron />
          </Link>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {PREVIEW_RIDES.map((ride) => (
            <PreviewCard key={ride.name} ride={ride} />
          ))}
        </div>

        {/* Mobile-only stacked CTA */}
        <Link
          href="/parks"
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-sm font-semibold text-white shadow-lift transition hover:bg-ink-800 sm:hidden"
        >
          Open Parkio
          <Chevron />
        </Link>

        <p className="mt-3 text-xs text-ink-400 sm:mt-4">
          Example picks. Open a park page to see live waits refresh every
          minute.
        </p>
      </div>
    </section>
  );
}

function PreviewCard({ ride }: { ride: PreviewRide }) {
  const pillStyles =
    ride.tone === "emerald"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : ride.tone === "amber"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : "bg-rose-50 text-rose-700 ring-rose-200";
  const dotStyles =
    ride.tone === "emerald"
      ? "bg-emerald-500"
      : ride.tone === "amber"
        ? "bg-amber-500"
        : "bg-rose-500";

  return (
    <Link
      href={`/parks/${ride.parkSlug}`}
      className="group flex flex-col rounded-3xl border border-ink-100 bg-white p-5 shadow-soft transition hover:border-ink-200 hover:shadow-lift sm:p-6"
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink-500">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: ride.parkColor }}
          aria-hidden
        />
        {ride.parkName}
      </div>

      <div
        className="mt-2 text-lg font-semibold tracking-tight text-ink-900 group-hover:text-accent-800 sm:text-xl"
        title={ride.name}
      >
        {ride.name}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {ride.badges.map((badge) => (
          <span
            key={badge}
            className={`inline-flex items-center whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${
              badge === "Headliner"
                ? "bg-accent-50 text-accent-700 ring-accent-100"
                : "bg-emerald-50 text-emerald-700 ring-emerald-100"
            }`}
          >
            {badge}
          </span>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ring-1 ${pillStyles}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${dotStyles}`} />
          {ride.waitMin} min
        </span>
        <span className="text-xs font-semibold text-accent-700">
          View on map →
        </span>
      </div>
    </Link>
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

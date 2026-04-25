"use client";

import Link from "next/link";
import { useAllLive } from "@/lib/useAllLive";

interface ResortMeta {
  slug: string;
  name: string;
  location: string;
  parks: string[];
  parkSlugs: string[];
  themeFrom: string;
  themeTo: string;
  decoration: "wdw" | "dlr";
}

const RESORTS: ResortMeta[] = [
  {
    slug: "walt-disney-world",
    name: "Walt Disney World",
    location: "Lake Buena Vista, Florida",
    parks: [
      "Magic Kingdom",
      "EPCOT",
      "Hollywood Studios",
      "Animal Kingdom",
    ],
    parkSlugs: [
      "magic-kingdom",
      "epcot",
      "hollywood-studios",
      "animal-kingdom",
    ],
    themeFrom: "#6366f1",
    themeTo: "#0ea5e9",
    decoration: "wdw",
  },
  {
    slug: "disneyland-resort",
    name: "Disneyland Resort",
    location: "Anaheim, California",
    parks: ["Disneyland Park", "Disney California Adventure"],
    parkSlugs: ["disneyland", "california-adventure"],
    themeFrom: "#ec4899",
    themeTo: "#f97316",
    decoration: "dlr",
  },
];

export function ResortCards() {
  return (
    <section className="relative border-t border-ink-100 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-widest text-accent-600">
            Two coasts. Six parks.
          </p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
            Pick your destination.
          </h2>
          <p className="mt-5 text-lg text-ink-600">
            Parkio covers every U.S. Disney park — Walt Disney World on the
            east coast and Disneyland Resort on the west — with the same
            live data, the same map, the same premium feel.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {RESORTS.map((resort) => (
            <ResortCard key={resort.slug} resort={resort} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ResortCard({ resort }: { resort: ResortMeta }) {
  const { parks, liveByPark, status } = useAllLive();

  // Filter parks that belong to this resort.
  const resortParks = parks.filter((p) =>
    resort.parkSlugs.includes(p.slug),
  );
  const openCount = resortParks.filter((p) => p.status === "OPEN").length;
  const totalCount = resortParks.length || resort.parks.length;

  // Average wait across this resort's parks
  let waitSum = 0;
  let waitCount = 0;
  for (const park of resortParks) {
    const live = liveByPark.get(park.slug);
    if (!live) continue;
    for (const a of live.attractions) {
      if (a.status === "OPERATING" && typeof a.waitMinutes === "number") {
        waitSum += a.waitMinutes;
        waitCount += 1;
      }
    }
  }
  const avgWait = waitCount === 0 ? null : Math.round(waitSum / waitCount);

  return (
    <Link
      href="/parks"
      className="group relative block overflow-hidden rounded-4xl border border-ink-100 bg-white shadow-soft transition hover:-translate-y-0.5 hover:border-ink-200 hover:shadow-lift"
    >
      {/* Hero panel */}
      <div
        className="relative h-52 overflow-hidden sm:h-56"
        style={{
          background: `linear-gradient(135deg, ${resort.themeFrom} 0%, ${resort.themeTo} 100%)`,
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(40% 60% at 30% 30%, rgba(255,255,255,0.55) 0%, transparent 50%), radial-gradient(30% 40% at 80% 70%, rgba(255,255,255,0.4) 0%, transparent 50%)",
          }}
        />
        <ResortDecoration kind={resort.decoration} />

        <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4 text-white sm:left-7 sm:right-7">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-widest text-white/80">
              {resort.location}
            </div>
            <h3 className="mt-1 truncate text-3xl font-semibold tracking-tight">
              {resort.name}
            </h3>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-ink-700 ring-1 ring-white/40 backdrop-blur">
            {totalCount} {totalCount === 1 ? "park" : "parks"}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 pb-6 pt-5 sm:px-7 sm:pb-7">
        <ul className="flex flex-wrap items-center gap-2">
          {resort.parks.map((p) => (
            <li
              key={p}
              className="rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-medium text-ink-700"
            >
              {p}
            </li>
          ))}
        </ul>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Stat
            label="Open today"
            value={
              status === "loading"
                ? "—"
                : `${openCount} / ${totalCount}`
            }
          />
          <Stat
            label="Avg wait"
            value={avgWait !== null ? `${avgWait} min` : "—"}
          />
        </div>

        <div className="mt-6 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-500">
            {status === "live" ? (
              <>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                Updating live
              </>
            ) : status === "loading" ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-ink-300" />
                Loading live data…
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-ink-400" />
                Estimates only right now
              </>
            )}
          </span>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-900 transition group-hover:translate-x-0.5">
            View live park data
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
          </span>
        </div>
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white px-3 py-2.5">
      <div className="text-[10px] font-medium uppercase tracking-widest text-ink-500">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tracking-tight text-ink-900">
        {value}
      </div>
    </div>
  );
}

/** Decorative SVG hint inside the resort hero. */
function ResortDecoration({ kind }: { kind: "wdw" | "dlr" }) {
  if (kind === "wdw") {
    // Castle silhouette + spires
    return (
      <svg
        aria-hidden
        viewBox="0 0 600 220"
        className="absolute inset-x-0 bottom-0 h-full w-full opacity-20"
        preserveAspectRatio="xMaxYMax slice"
      >
        <g fill="white">
          <rect x="380" y="120" width="160" height="100" />
          <rect x="430" y="80" width="60" height="140" />
          <polygon points="430,80 460,30 490,80" />
          <rect x="395" y="105" width="20" height="50" />
          <polygon points="395,105 405,80 415,105" />
          <rect x="505" y="105" width="20" height="50" />
          <polygon points="505,105 515,80 525,105" />
        </g>
      </svg>
    );
  }
  // DLR — Pixar Pal-A-Round Ferris wheel
  return (
    <svg
      aria-hidden
      viewBox="0 0 600 220"
      className="absolute inset-x-0 bottom-0 h-full w-full opacity-20"
      preserveAspectRatio="xMaxYMax slice"
    >
      <g fill="none" stroke="white" strokeWidth="2.5">
        <circle cx="490" cy="120" r="78" />
        <circle cx="490" cy="120" r="78" fill="white" fillOpacity="0.18" stroke="none" />
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return (
            <line
              key={i}
              x1="490"
              y1="120"
              x2={490 + Math.cos(a) * 78}
              y2={120 + Math.sin(a) * 78}
            />
          );
        })}
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return (
            <circle
              key={`g-${i}`}
              cx={490 + Math.cos(a) * 78}
              cy={120 + Math.sin(a) * 78}
              r="5"
              fill="white"
              stroke="none"
            />
          );
        })}
        <path d="M 440 170 L 420 230 M 540 170 L 560 230" strokeLinecap="round" />
      </g>
    </svg>
  );
}

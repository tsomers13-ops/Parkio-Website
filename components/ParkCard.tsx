import Link from "next/link";
import type { Park } from "@/lib/types";
import { crowdColor } from "@/lib/utils";

export function ParkCard({ park }: { park: Park }) {
  const crowd = crowdColor(park.crowd);

  return (
    <Link
      href={`/parks/${park.id}`}
      className="group relative block overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-soft transition hover:-translate-y-0.5 hover:border-ink-200 hover:shadow-lift"
    >
      <div
        className="relative h-32 overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${park.themeHex} 0%, ${park.themeAccentHex} 100%)`,
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(40% 60% at 30% 30%, rgba(255,255,255,0.5) 0%, transparent 50%), radial-gradient(30% 40% at 80% 70%, rgba(255,255,255,0.4) 0%, transparent 50%)",
          }}
        />
        <div className="absolute right-4 top-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-ink-700 ring-1 ring-white/40 backdrop-blur">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                park.status === "Open" ? "bg-emerald-500" : "bg-ink-400"
              }`}
            />
            {park.status}
          </span>
        </div>
        <div className="absolute bottom-3 left-4 text-white">
          <div className="text-[11px] font-medium uppercase tracking-widest text-white/80">
            Walt Disney World
          </div>
          <div className="text-2xl font-semibold tracking-tight">
            {park.name}
          </div>
        </div>
      </div>

      <div className="px-5 pb-5 pt-4">
        <p className="text-sm text-ink-600">{park.tagline}</p>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${crowd.bg} ${crowd.text}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${crowd.dot}`} />
              {park.crowd} crowd
            </span>
            <span className="text-[11px] text-ink-500">{park.hours}</span>
          </div>
          <div className="inline-flex items-center gap-1 text-sm font-medium text-ink-900 transition group-hover:translate-x-0.5">
            Open
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
          </div>
        </div>
      </div>
    </Link>
  );
}

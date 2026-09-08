import { crowdColor, crowdLabel } from "@/lib/utils";
import type { Park } from "@/lib/types";

/**
 * Park identity for the planning page. Server-rendered, factual only.
 *
 * Both the hours and the crowd level come from static Parkio editorial —
 * neither is a live reading — so both are labelled "Typical". Today's
 * actual hours and open/closed status live in the In the park section,
 * which has the live data path.
 */
export function ParkIdentityHeader({ park }: { park: Park }) {
  const crowd = crowdColor(park.crowd);

  return (
    <section className="relative">
      <div className="bg-aurora absolute inset-0 -z-10 opacity-70" />
      <div className="mx-auto max-w-5xl px-5 pb-10 pt-12 sm:px-8 sm:pb-12 sm:pt-16">
        <p className="text-sm font-medium uppercase tracking-widest text-accent-600">
          {park.resort}
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
          {park.name}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-600">{park.tagline}</p>

        <div className="mt-6 flex flex-wrap items-center gap-2 text-[11px] font-medium">
          <span className="rounded-full bg-ink-100 px-2.5 py-1 text-ink-700">
            Typical hours {park.hours}
          </span>
          <span
            className={`rounded-full px-2.5 py-1 ${crowd.bg} ${crowd.text}`}
          >
            {crowdLabel(park.crowd)}
          </span>
        </div>
      </div>
    </section>
  );
}

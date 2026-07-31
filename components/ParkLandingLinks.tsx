/**
 * By-park internal navigation for the cross-park SEO hubs.
 *
 * Six explicit links to the park-specific landing pages so Google can
 * discover the full cluster in one crawl and visitors can jump
 * straight to the park they're searching for. Renders as a dense pill
 * grid so all six fit above the fold on mobile.
 *
 * The park list is hand-curated rather than derived from
 * disneyParkConfig so the slug→landing-page mapping is visible here
 * and the order matches search demand (WDW first by traffic,
 * Disneyland Resort below). Adding a new park = add a row here.
 */

import Link from "next/link";

import type { SeoParkVariant } from "@/lib/seoParkPage";

const PARK_LANDINGS: ReadonlyArray<{
  name: string;
  resort: string;
  /** Park id — the first half of the landing-page slug. */
  parkId: string;
}> = [
  { name: "Magic Kingdom", resort: "Walt Disney World", parkId: "magic-kingdom" },
  { name: "EPCOT", resort: "Walt Disney World", parkId: "epcot" },
  { name: "Hollywood Studios", resort: "Walt Disney World", parkId: "hollywood-studios" },
  { name: "Animal Kingdom", resort: "Walt Disney World", parkId: "animal-kingdom" },
  { name: "Disneyland", resort: "Disneyland Resort", parkId: "disneyland" },
  { name: "California Adventure", resort: "Disneyland Resort", parkId: "california-adventure" },
];

export function ParkLandingLinks({
  variant,
  heading,
}: {
  variant: SeoParkVariant;
  heading: string;
}) {
  const suffix =
    variant === "wait-times" ? "wait-times-today" : "best-rides-today";

  return (
    <section className="mx-auto max-w-7xl px-5 sm:px-8">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-ink-500">
        {heading}
      </h2>
      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PARK_LANDINGS.map((p) => (
          <li key={p.parkId}>
            <Link
              href={`/${p.parkId}-${suffix}`}
              className="group flex items-center justify-between rounded-2xl bg-white px-5 py-4 ring-1 ring-ink-100 transition hover:ring-ink-300 hover:shadow-soft"
            >
              <div>
                <div className="text-base font-semibold text-ink-900">
                  {p.name}
                </div>
                <div className="text-xs text-ink-500">{p.resort}</div>
              </div>
              <span className="text-ink-400 transition group-hover:translate-x-0.5 group-hover:text-ink-700">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

import type { Ride, RideCategory } from "@/lib/types";

/**
 * Factual presentation shared by the attraction page and the map's ride
 * sheet. Props-only, server-safe, no live data, no browser APIs — so the
 * same wording is guaranteed in both places rather than drifting.
 *
 * Everything here comes straight from the dataset. Nothing is inferred:
 * no thrill ratings, no age guidance, no duration, no accessibility or
 * queue claims.
 */

/**
 * Height requirement wording.
 *
 * An absent `height` in this dataset means the attraction carries no
 * restriction — it does not mean the value is unknown — so we say so
 * plainly rather than hedging.
 */
export function heightLabel(height?: string): string {
  return height ?? "No height requirement";
}

/**
 * The dataset stores Lightning Lane as a bare boolean. It supports
 * exactly these two answers — not Multi Pass vs Single Pass, not price,
 * not tier, not today's availability. Don't imply otherwise.
 */
export function lightningLaneLabel(lightningLane: boolean): string {
  return lightningLane ? "Available" : "Not offered";
}

/** Guest-readable form of the existing category. Not a new taxonomy. */
export function categoryLabel(category: RideCategory): string {
  switch (category) {
    case "thrill":
      return "Thrill ride";
    case "family":
      return "Family ride";
    case "kids":
      return "Kids ride";
    case "show":
      return "Show";
    case "water":
      return "Water ride";
  }
}

export type AttractionFactsProps = Pick<
  Ride,
  "land" | "category" | "lightningLane"
> & { height?: string };

export function AttractionFacts({
  land,
  category,
  height,
  lightningLane,
}: AttractionFactsProps) {
  const facts: Array<{ label: string; value: string }> = [
    { label: "Land", value: land },
    { label: "Type", value: categoryLabel(category) },
    { label: "Height", value: heightLabel(height) },
    { label: "Lightning Lane", value: lightningLaneLabel(lightningLane) },
  ];

  return (
    <dl className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {facts.map((fact) => (
        <div
          key={fact.label}
          className="rounded-2xl border border-ink-100 bg-white px-4 py-3 shadow-soft"
        >
          <dt className="text-[10px] font-medium uppercase tracking-widest text-ink-500">
            {fact.label}
          </dt>
          <dd className="mt-1 text-base font-semibold text-ink-900">
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

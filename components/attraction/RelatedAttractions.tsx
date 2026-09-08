import Link from "next/link";
import { attractionCanonicalPath } from "@/lib/attractionRoute";
import { relatedAttractions } from "@/lib/relatedAttractions";
import type { Park, Ride } from "@/lib/types";
import { categoryLabel } from "./AttractionFacts";

/**
 * Nearby attractions in the same park. Ordering comes from land match and
 * walking distance only — no live waits, no scores, and nothing framed as
 * a personal recommendation.
 */
export function RelatedAttractions({
  park,
  ride,
}: {
  park: Park;
  ride: Ride;
}) {
  const related = relatedAttractions(ride);
  if (related.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight text-ink-900">
        More in this area
      </h2>
      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {related.map(({ ride: other, sameLand, walk }) => (
          <li key={other.id}>
            <Link
              href={attractionCanonicalPath(park.id, other.id)}
              className="block rounded-2xl border border-ink-100 bg-white px-4 py-3 shadow-soft transition hover:border-ink-200 hover:bg-ink-50"
            >
              <span className="block text-[11px] font-medium uppercase tracking-widest text-ink-500">
                {sameLand ? other.land : `${other.land}${walk ? ` · ${walk}` : ""}`}
              </span>
              <span className="mt-1 block text-base font-semibold text-ink-900">
                {other.name}
              </span>
              <span className="mt-0.5 block text-xs text-ink-500">
                {categoryLabel(other.category)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

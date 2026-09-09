import Link from "next/link";
import { amenityChips, Chip, priceTierLabel } from "@/components/dining/DiningFacts";
import { diningCanonicalPath } from "@/lib/diningRoute";
import { diningTypeLabel, type PermanentDiningVenue } from "@/lib/diningTypes";
import { pavilionName } from "@/lib/lands";

/**
 * One permanent venue.
 *
 * Every one of the 62 renders successfully, including the 49 with no
 * editorial. A venue Parkio has reviewed gains extra facts and a quiet
 * "Parkio pick" marker — the difference reads as "this one has extra
 * guidance", never as "that one is missing data".
 */
export function DiningVenueCard({ venue }: { venue: PermanentDiningVenue }) {
  const pavilion = pavilionName(venue.land);
  const price = priceTierLabel(venue.editorial?.priceTier);
  const amenities = amenityChips(venue.editorial);
  const verdict = venue.editorial?.shortVerdict?.trim();

  return (
    <Link
      href={diningCanonicalPath(venue.parkId, venue.slug)}
      className="block h-full rounded-2xl border border-ink-100 bg-white px-4 py-4 shadow-soft transition hover:border-ink-200 hover:bg-ink-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
    >
      {pavilion && (
        <span className="block text-[11px] font-medium uppercase tracking-widest text-ink-500">
          {pavilion}
        </span>
      )}
      <span className="mt-0.5 flex items-start justify-between gap-3">
        <span className="text-base font-semibold text-ink-900">{venue.name}</span>
        {venue.editorial && (
          <span className="mt-0.5 shrink-0 rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent-700">
            Parkio pick
          </span>
        )}
      </span>

      <span className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
        <Chip>{diningTypeLabel(venue.type)}</Chip>
        {price && <Chip>{price}</Chip>}
        {amenities.map((chip) => (
          <Chip key={chip}>{chip}</Chip>
        ))}
      </span>

      {verdict && (
        <span className="mt-3 block text-sm leading-relaxed text-ink-600">{verdict}</span>
      )}
    </Link>
  );
}

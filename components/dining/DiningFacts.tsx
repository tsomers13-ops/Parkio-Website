import type { DiningEditorial, PermanentDiningVenue } from "@/lib/diningTypes";

/**
 * Fact rendering helpers.
 *
 * Every helper returns null/empty when the underlying fact is absent, so a
 * card simply does not render it. Parkio never shows "Mobile Order: Unknown" —
 * an unsupported fact is omitted, not displayed as a gap.
 */

export function priceTierLabel(tier: number | undefined): string | null {
  if (typeof tier !== "number" || tier < 1 || tier > 4) return null;
  return "$".repeat(tier);
}

/** Factual amenity chips, only for venues whose source carries them. */
export function amenityChips(editorial: DiningEditorial | undefined): string[] {
  if (!editorial) return [];
  const chips: string[] = [];
  if (editorial.mobileOrderAvailable) chips.push("Mobile order");
  if (editorial.indoorSeating) chips.push("Indoor seating");
  if (editorial.kidFriendly) chips.push("Kid-friendly");
  return chips;
}

/** True when Parkio has reviewed this venue and has guidance to add. */
export function hasParkioGuidance(venue: PermanentDiningVenue): boolean {
  return venue.editorial !== undefined;
}

export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600">
      {children}
    </span>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DiningJsonLd } from "@/components/dining/DiningJsonLd";
import { amenityChips, Chip, priceTierLabel } from "@/components/dining/DiningFacts";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { meetsDiningContentFloor } from "@/lib/dining";
import {
  diningCanonicalPath,
  diningStaticParams,
  diningVenueDescription,
  diningVenueTitle,
  resolveDiningVenue,
} from "@/lib/diningRoute";
import { diningTypeLabel } from "@/lib/diningTypes";
import { pavilionName } from "@/lib/lands";

interface DiningVenuePageProps {
  params: { parkId: string; slug: string };
}

export const dynamicParams = false;

export function generateStaticParams() {
  return diningStaticParams();
}

export function generateMetadata({ params }: DiningVenuePageProps): Metadata {
  const resolved = resolveDiningVenue(params.parkId, params.slug);
  if (!resolved) return { title: "Dining not found", robots: { index: false } };

  const { park, venue } = resolved;
  // Indexability comes from the domain helper — the policy is never restated
  // here, so the floor can move in one place.
  const indexable = meetsDiningContentFloor(venue);

  return {
    title: diningVenueTitle(park, venue),
    description: diningVenueDescription(park, venue, diningTypeLabel(venue.type)),
    alternates: { canonical: diningCanonicalPath(park.id, venue.slug) },
    ...(indexable ? {} : { robots: { index: false, follow: true } }),
  };
}

/**
 * Permanent dining venue page.
 *
 * All 62 venues render. A venue with no Parkio editorial shows the facts
 * Parkio actually has and nothing else — no empty rows, no "unknown", and no
 * mention of indexing policy, which is internal.
 */
export default function DiningVenuePage({ params }: DiningVenuePageProps) {
  const resolved = resolveDiningVenue(params.parkId, params.slug);
  if (!resolved) notFound();

  const { park, venue } = resolved;
  const editorial = venue.editorial;
  const price = priceTierLabel(editorial?.priceTier);
  const amenities = amenityChips(editorial);
  const pavilion = pavilionName(venue.land);
  const indexable = meetsDiningContentFloor(venue);

  return (
    <>
      <Navbar />
      {indexable && <DiningJsonLd park={park} venue={venue} />}
      <main className="bg-ink-50/40">
        <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
          <nav aria-label="Breadcrumb" className="text-sm text-ink-500">
            <Link href="/parks/" className="hover:text-ink-700">Parks</Link>
            <span aria-hidden="true" className="px-1.5">/</span>
            <Link href={`/parks/${park.id}/`} className="hover:text-ink-700">{park.name}</Link>
            <span aria-hidden="true" className="px-1.5">/</span>
            <Link href={`/parks/${park.id}/dining/`} className="hover:text-ink-700">Dining</Link>
            <span aria-hidden="true" className="px-1.5">/</span>
            <span className="text-ink-700">{venue.name}</span>
          </nav>

          <header className="mt-4">
            {pavilion && (
              <span className="block text-xs font-medium uppercase tracking-widest text-ink-500">
                {pavilion}
              </span>
            )}
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              {venue.name}
            </h1>
            <p className="mt-2 text-ink-600">
              {diningTypeLabel(venue.type)} · {venue.land} · {park.name}
            </p>
          </header>

          {editorial && (
            <section aria-labelledby="parkio-take" className="mt-8 rounded-2xl border border-accent-100 bg-accent-50/60 px-5 py-5">
              <h2 id="parkio-take" className="text-sm font-semibold uppercase tracking-widest text-accent-700">
                Parkio&rsquo;s take
              </h2>
              <p className="mt-2 text-lg font-medium leading-relaxed text-ink-900">
                {editorial.shortVerdict}
              </p>
              <p className="mt-3 text-sm text-ink-600">
                Parkio score {editorial.parkioScore}/10
              </p>
              {editorial.signatureItems.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-ink-500">
                    Signature items
                  </h3>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-ink-700">
                    {editorial.signatureItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          <section aria-labelledby="the-facts" className="mt-8">
            <h2 id="the-facts" className="text-sm font-semibold uppercase tracking-widest text-ink-500">
              The facts
            </h2>
            <dl className="mt-3 divide-y divide-ink-100 rounded-2xl border border-ink-100 bg-white shadow-soft">
              <div className="flex items-baseline justify-between gap-4 px-4 py-3">
                <dt className="text-sm text-ink-500">Service</dt>
                <dd className="text-sm font-medium text-ink-900">{diningTypeLabel(venue.type)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 px-4 py-3">
                <dt className="text-sm text-ink-500">Area</dt>
                <dd className="text-sm font-medium text-ink-900">{venue.land}</dd>
              </div>
              {price && (
                <div className="flex items-baseline justify-between gap-4 px-4 py-3">
                  <dt className="text-sm text-ink-500">Price</dt>
                  <dd className="text-sm font-medium text-ink-900">{price}</dd>
                </div>
              )}
              {editorial && (
                <div className="flex items-baseline justify-between gap-4 px-4 py-3">
                  <dt className="text-sm text-ink-500">Mobile order</dt>
                  <dd className="text-sm font-medium text-ink-900">
                    {editorial.mobileOrderAvailable ? "Available" : "Not available"}
                  </dd>
                </div>
              )}
              {editorial && (
                <div className="flex items-baseline justify-between gap-4 px-4 py-3">
                  <dt className="text-sm text-ink-500">Seating</dt>
                  <dd className="text-sm font-medium text-ink-900">
                    {editorial.indoorSeating ? "Indoor seating" : "Outdoor only"}
                  </dd>
                </div>
              )}
              {editorial && editorial.dietaryFlags.length > 0 && (
                <div className="flex items-baseline justify-between gap-4 px-4 py-3">
                  <dt className="text-sm text-ink-500">Dietary</dt>
                  <dd className="text-sm font-medium text-ink-900">
                    {editorial.dietaryFlags.join(", ")}
                  </dd>
                </div>
              )}
            </dl>

            {amenities.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {amenities.map((chip) => (
                  <Chip key={chip}>{chip}</Chip>
                ))}
              </div>
            )}
          </section>

          <p className="mt-12 text-sm text-ink-500">
            <Link
              href={`/parks/${park.id}/dining/`}
              className="font-medium text-accent-700 hover:underline"
            >
              ← All {park.name} dining
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}

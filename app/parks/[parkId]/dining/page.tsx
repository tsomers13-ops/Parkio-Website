import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ParkDiningExplorer, type FestivalSummary } from "@/components/dining/ParkDiningExplorer";
import type { BoothView } from "@/components/dining/FestivalBoothCard";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { getPark } from "@/lib/data";
import {
  getPermanentDiningForPark,
  groupPermanentDiningByArea,
  isDiningParkId,
} from "@/lib/dining";
import { getAllPermanentDining } from "@/lib/dining";
import {
  diningParkStaticParams,
  parkDiningDescription,
  parkDiningPath,
  parkDiningTitle,
} from "@/lib/diningRoute";
import {
  boothWindow,
  getBoothStatus,
  getFestival,
  getFestivalStatus,
  getSeasonalDiningForPark,
  todayInPark,
} from "@/lib/seasonalDining";

interface ParkDiningPageProps {
  params: { parkId: string };
}

export const dynamicParams = false;
// Required by @cloudflare/next-on-pages: the adapter rejects this route shape
// without it, which failed every production build of Gate 4. The sibling
// [slug] route builds without it and is deliberately left alone.
export const runtime = "edge";

export function generateStaticParams() {
  return diningParkStaticParams();
}

export function generateMetadata({ params }: ParkDiningPageProps): Metadata {
  const park = getPark(params.parkId);
  if (!park || !isDiningParkId(params.parkId)) {
    return { title: "Dining not found", robots: { index: false } };
  }
  const count = getPermanentDiningForPark(park.id).length;
  return {
    title: parkDiningTitle(park),
    description: parkDiningDescription(park, count),
    alternates: { canonical: parkDiningPath(park.id) },
  };
}

/**
 * Park dining discovery.
 *
 * Everything factual is server-rendered. Festival lifecycle is resolved here
 * against the park-local date and handed to the client as settled state, so
 * no component re-derives a date and expired locations never reach the page.
 */
export default function ParkDiningPage({ params }: ParkDiningPageProps) {
  const park = getPark(params.parkId);
  if (!park || !isDiningParkId(params.parkId)) notFound();

  const venues = getPermanentDiningForPark(park.id);
  const venueGroups = groupPermanentDiningByArea(venues);

  const today = todayInPark();
  const allVenues = getAllPermanentDining();

  // Expired locations are excluded from the current decision; upcoming ones
  // stay discoverable with their opening date.
  const boothViews: BoothView[] = getSeasonalDiningForPark(park.id)
    .map((booth) => {
      const status = getBoothStatus(booth, today);
      if (status === "expired") return null;
      const festival = getFestival(booth.festivalId);
      const opensOn = festival ? boothWindow(booth, festival)[0] : null;
      const host = booth.venueCanonicalId
        ? (allVenues.find((v) => v.canonicalId === booth.venueCanonicalId) ?? null)
        : null;
      return {
        booth,
        status,
        opensOn: status === "upcoming" ? opensOn : null,
        host,
      } satisfies BoothView;
    })
    .filter((view): view is BoothView => view !== null);

  const firstBooth = getSeasonalDiningForPark(park.id)[0];
  const festivalRecord = firstBooth ? getFestival(firstBooth.festivalId) : undefined;
  const festival: FestivalSummary | null =
    festivalRecord && getFestivalStatus(festivalRecord, today) !== "expired"
      ? {
          name: festivalRecord.name,
          startsOn: festivalRecord.startsOn,
          endsOn: festivalRecord.endsOn,
          status: getFestivalStatus(festivalRecord, today),
        }
      : null;

  return (
    <>
      <Navbar />
      <main className="bg-ink-50/40">
        <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
          <nav aria-label="Breadcrumb" className="text-sm text-ink-500">
            <Link href="/parks/" className="hover:text-ink-700">
              Parks
            </Link>
            <span aria-hidden="true" className="px-1.5">
              /
            </span>
            <Link href={`/parks/${park.id}/`} className="hover:text-ink-700">
              {park.name}
            </Link>
            <span aria-hidden="true" className="px-1.5">
              /
            </span>
            <span className="text-ink-700">Dining</span>
          </nav>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            Where to eat at {park.name}
          </h1>
          <p className="mt-3 max-w-2xl text-ink-600">
            {venues.length} year-round dining locations
            {festival ? ` plus the ${festival.name}` : ""} — grouped by area, with the
            facts Parkio has verified for each one. Filter by service type, or search for
            a dish.
          </p>

          {festival && festival.status === "active" && (
            <a
              href="#festival-heading"
              className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm transition hover:border-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
            >
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                Happening now
              </span>
              <span className="font-medium text-ink-900">{festival.name}</span>
              <span className="text-ink-600">
                {boothViews.length} participating locations →
              </span>
            </a>
          )}

          <ParkDiningExplorer
            parkName={park.name}
            venueGroups={venueGroups}
            boothViews={boothViews}
            festival={festival}
          />

          <p className="mt-14 text-sm text-ink-500">
            <Link href={`/parks/${park.id}/`} className="font-medium text-accent-700 hover:underline">
              ← Back to {park.name}
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}

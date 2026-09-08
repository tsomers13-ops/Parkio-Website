import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AttractionBreadcrumb } from "@/components/attraction/AttractionBreadcrumb";
import { AttractionFacts, categoryLabel } from "@/components/attraction/AttractionFacts";
import { AttractionJsonLd } from "@/components/attraction/AttractionJsonLd";
import { AttractionPlanningNotes } from "@/components/attraction/AttractionPlanningNotes";
import { AttractionWaitState } from "@/components/attraction/AttractionWaitState";
import { RelatedAttractions } from "@/components/attraction/RelatedAttractions";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import {
  attractionCanonicalPath,
  attractionDescription,
  attractionStaticParams,
  attractionTitle,
  resolveAttraction,
} from "@/lib/attractionRoute";

interface AttractionPageProps {
  params: { parkId: string; slug: string };
}

// Every canonical attraction is known at build time, so anything outside
// that set is a bad URL rather than a page we haven't generated yet.
export const dynamicParams = false;

export function generateStaticParams() {
  return attractionStaticParams();
}

export function generateMetadata({ params }: AttractionPageProps): Metadata {
  // Same ownership validation the page uses — a cross-park pair must not
  // emit metadata describing the attraction under the wrong park.
  const resolved = resolveAttraction(params.parkId, params.slug);
  if (!resolved) {
    return { title: "Attraction not found", robots: { index: false } };
  }

  const { park, ride } = resolved;
  return {
    title: attractionTitle(park, ride),
    description: attractionDescription(park, ride),
    alternates: {
      canonical: attractionCanonicalPath(park.id, ride.id),
    },
  };
}

/**
 * Attraction planning page.
 *
 * Evergreen content is primary and entirely server-rendered: identity,
 * facts, description, planning notes, related attractions and navigation
 * all come from the static dataset. The only client island is the live
 * wait module, and it degrades to a deterministic Parkio estimate when
 * the upstream is unavailable — so an API outage costs the page nothing
 * but one line of text.
 *
 * Structured data and sitemap entries land in a later slice.
 */
export default function AttractionPage({ params }: AttractionPageProps) {
  const resolved = resolveAttraction(params.parkId, params.slug);
  if (!resolved) notFound();

  const { park, ride } = resolved;

  return (
    <main className="min-h-screen bg-white">
      <Navbar />

      {/* Structured data mirrors the visible breadcrumb and the page
          facts — same canonical URLs, same names, nothing extra. */}
      <AttractionJsonLd park={park} ride={ride} />

      <article className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <AttractionBreadcrumb park={park} ride={ride} />

        <header className="mt-6">
          <p className="text-sm font-medium uppercase tracking-widest text-accent-600">
            {park.name} · {ride.land}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
            {ride.name}
          </h1>
          <p className="mt-3 text-sm font-medium text-ink-500">
            {categoryLabel(ride.category)}
          </p>
        </header>

        <AttractionFacts
          land={ride.land}
          category={ride.category}
          height={ride.height}
          lightningLane={ride.lightningLane}
        />

        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight text-ink-900">
            About this attraction
          </h2>
          <p className="mt-3 text-base leading-relaxed text-ink-600">
            {ride.description}
          </p>
        </section>

        <AttractionWaitState ride={ride} />

        <AttractionPlanningNotes park={park} ride={ride} />

        <RelatedAttractions park={park} ride={ride} />

        <div className="mt-12 border-t border-ink-100 pt-8">
          <Link
            href={`/parks/${park.id}`}
            className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-white shadow-soft transition hover:bg-ink-800 active:scale-[0.98]"
          >
            Explore {park.name}
          </Link>
        </div>
      </article>

      <Footer />
    </main>
  );
}

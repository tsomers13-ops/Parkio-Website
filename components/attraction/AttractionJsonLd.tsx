import { attractionCanonicalPath } from "@/lib/attractionRoute";
import type { Park, Ride } from "@/lib/types";

/**
 * Structured data for an attraction page.
 *
 * Deliberately minimal. Every field below is read straight off the
 * canonical dataset — name, description, coordinates, park. Nothing is
 * inferred and nothing is inflated: no rating, no review, no offer or
 * price, no attraction-level openingHours, no image (the dataset has no
 * image field), no accessibility or duration claim. Schema.org richness
 * we cannot evidence would be fabrication with a machine-readable label
 * on it.
 */

const SITE_URL = "https://parkio.info";

function absolute(path: string): string {
  return `${SITE_URL}${path}`;
}

export interface JsonLdGraph {
  breadcrumb: Record<string, unknown>;
  attraction: Record<string, unknown>;
}

/** Parks › {Park} › {Attraction}, using the canonical URLs. */
export function buildBreadcrumbJsonLd(park: Park, ride: Ride) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Parks",
        item: absolute("/parks/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: park.name,
        item: absolute(`/parks/${park.id}/`),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: ride.name,
        item: absolute(attractionCanonicalPath(park.id, ride.id)),
      },
    ],
  };
}

export function buildAttractionJsonLd(park: Park, ride: Ride) {
  return {
    "@context": "https://schema.org",
    "@type": "TouristAttraction",
    name: ride.name,
    description: ride.description,
    url: absolute(attractionCanonicalPath(park.id, ride.id)),
    geo: {
      "@type": "GeoCoordinates",
      latitude: ride.lat,
      longitude: ride.lng,
    },
    containedInPlace: {
      "@type": "TouristAttraction",
      name: park.name,
      url: absolute(`/parks/${park.id}/`),
    },
  };
}

export function buildJsonLdGraph(park: Park, ride: Ride): JsonLdGraph {
  return {
    breadcrumb: buildBreadcrumbJsonLd(park, ride),
    attraction: buildAttractionJsonLd(park, ride),
  };
}

/**
 * Serialize for inline <script>. `<` is escaped so a value can never
 * close the script element early.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function AttractionJsonLd({ park, ride }: { park: Park; ride: Ride }) {
  const { breadcrumb, attraction } = buildJsonLdGraph(park, ride);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(attraction) }}
      />
    </>
  );
}

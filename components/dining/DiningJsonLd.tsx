import type { Park } from "@/lib/types";
import type { DiningType, PermanentDiningVenue } from "@/lib/diningTypes";
import { diningCanonicalPath } from "@/lib/diningRoute";

const SITE_URL = "https://parkio.info";

/**
 * schema.org type per dining type. A snack kiosk is not a Restaurant and a
 * lounge is not one either — labelling them so for SEO would be a false claim.
 * Every value below is a FoodEstablishment subtype that honestly fits.
 */
const SCHEMA_TYPE: Record<DiningType, string> = {
  tableService: "Restaurant",
  quickService: "FastFoodRestaurant",
  lounge: "BarOrPub",
  snackStand: "FoodEstablishment",
};

/**
 * Structured data for indexable venues only.
 *
 * Emits nothing that is not in the dataset: no ratings, no reviews, no opening
 * hours. `priceRange` appears only because every indexable venue carries a
 * source price tier, and `geo` only when real coordinates exist.
 */
export function DiningJsonLd({
  park,
  venue,
}: {
  park: Park;
  venue: PermanentDiningVenue;
}) {
  const url = `${SITE_URL}${diningCanonicalPath(venue.parkId, venue.slug)}`;

  const establishment: Record<string, unknown> = {
    "@type": SCHEMA_TYPE[venue.type],
    name: venue.name,
    url,
    containedInPlace: { "@type": "TouristAttraction", name: park.name },
  };

  const tier = venue.editorial?.priceTier;
  if (typeof tier === "number" && tier >= 1 && tier <= 4) {
    establishment.priceRange = "$".repeat(tier);
  }
  if (venue.latitude !== undefined && venue.longitude !== undefined) {
    establishment.geo = {
      "@type": "GeoCoordinates",
      latitude: venue.latitude,
      longitude: venue.longitude,
    };
  }

  const graph = [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Parks", item: `${SITE_URL}/parks/` },
        { "@type": "ListItem", position: 2, name: park.name, item: `${SITE_URL}/parks/${park.id}/` },
        { "@type": "ListItem", position: 3, name: "Dining", item: `${SITE_URL}/parks/${park.id}/dining/` },
        { "@type": "ListItem", position: 4, name: venue.name, item: url },
      ],
    },
    establishment,
  ];

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }),
      }}
    />
  );
}

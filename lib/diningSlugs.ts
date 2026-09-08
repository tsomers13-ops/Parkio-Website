//
//  diningSlugs.ts — Website-owned public slug manifest for Dining venues.
//
//  HAND-AUTHORED. This file is the Website's half of the Dining content
//  pipeline and is never generated from a venue name at build or run time.
//
//  Why the Website owns this:
//    A slug is web routing metadata. Keeping it here means a URL decision
//    never requires an iOS commit, and a venue rename in iOS never moves a
//    published URL.
//
//  Rules:
//    - The key is the iOS canonicalId (stableID, "Park|Land|Name"). It is an
//      internal join key ONLY and must never appear in a public URL.
//    - The value is the public slug: park-prefixed, lowercase, URL-safe,
//      unique Website-wide, and never colliding with an attraction slug.
//    - Slugs are IMMUTABLE once published. Changing one breaks a live URL and
//      is a deliberate migration, not an edit.
//    - Presence in this manifest is what makes a venue routable. Priority 8
//      ships the EPCOT + Hollywood Studios pilot only; the remaining 24
//      venues are intentionally absent and therefore not published.
//    - A Dining venue in EPCOT or Hollywood Studios with no entry here is a
//      hard generation failure, so a new iOS venue cannot ship without a
//      deliberate slug decision.
//

/** Public Dining slug syntax: park prefix, lowercase, hyphen-separated. */
export const DINING_SLUG_PATTERN = /^(?:ep|hs)-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Parks included in the Priority 8 Dining pilot. */
export const DINING_PILOT_PARK_IDS = ["epcot", "hollywood-studios"] as const;

/** canonicalId (iOS stableID — internal only) -> public Website slug. */
export const DINING_SLUGS: Readonly<Record<string, string>> = {

  // ── EPCOT (42) ─────────────────────────────────────────
  "EPCOT|World Showcase|Akershus Royal Banquet Hall": "ep-akershus",
  "EPCOT|World Showcase|Biergarten Restaurant": "ep-biergarten",
  "EPCOT|World Showcase|Block & Hans": "ep-block-and-hans",
  "EPCOT|World Showcase|Chefs de France": "ep-chefs-de-france",
  "EPCOT|World Showcase|Choza de Margarita": "ep-choza-de-margarita",
  "EPCOT|World Celebration|Connections Eatery": "ep-connections-eatery",
  "EPCOT|World Showcase|Fife & Drum Tavern": "ep-fife-and-drum",
  "EPCOT|World Nature|Garden Grill Restaurant": "ep-garden-grill",
  "EPCOT|World Celebration|GEO-82": "ep-geo-82",
  "EPCOT|World Celebration|GRAB-N-GOOF": "ep-grab-n-goof",
  "EPCOT|World Showcase|Karamell-Küche": "ep-karamell-kuche",
  "EPCOT|World Showcase|Katsura Grill": "ep-katsura-grill",
  "EPCOT|World Showcase|La Cantina de San Angel": "ep-la-cantina",
  "EPCOT|World Showcase|La Cava del Tequila": "ep-la-cava",
  "EPCOT|World Showcase|La Crêperie de Paris": "ep-la-creperie",
  "EPCOT|World Showcase|La Hacienda de San Angel": "ep-la-hacienda",
  "EPCOT|World Showcase|La Poutinerie": "ep-la-poutinerie",
  "EPCOT|World Showcase|L'Artisan des Glaces": "ep-lartisan-des-glaces",
  "EPCOT|World Showcase|Le Cellier Steakhouse": "ep-le-cellier",
  "EPCOT|World Showcase|Les Halles Boulangerie-Patisserie": "ep-les-halles",
  "EPCOT|World Showcase|Les Vins des Chefs de France": "ep-les-vins-de-france",
  "EPCOT|World Showcase|Monsieur Paul": "ep-monsieur-paul",
  "EPCOT|World Showcase|Nine Dragons Restaurant": "ep-nine-dragons",
  "EPCOT|World Showcase|Refreshment Outpost": "ep-refreshment-outpost",
  "EPCOT|World Showcase|Regal Eagle Smokehouse": "ep-regal-eagle",
  "EPCOT|World Showcase|Rose & Crown Dining Room": "ep-rose-and-crown",
  "EPCOT|World Showcase|Rose & Crown Pub": "ep-rose-and-crown-pub",
  "EPCOT|World Showcase|San Angel Inn Restaurante": "ep-san-angel-inn",
  "EPCOT|World Showcase|Shiki-Sai: Sushi Izakaya": "ep-shiki-sai",
  "EPCOT|World Showcase|Sommerfest": "ep-sommerfest",
  "EPCOT|World Discovery|Space 220 Restaurant": "ep-space-220",
  "EPCOT|World Discovery|Space 220 Lounge": "ep-space-220-lounge",
  "EPCOT|World Showcase|Spice Road Table": "ep-spice-road-table",
  "EPCOT|World Nature|Sunshine Seasons": "ep-sunshine-seasons",
  "EPCOT|World Showcase|Takumi-Tei": "ep-takumi-tei",
  "EPCOT|World Showcase|Tangierine Café": "ep-tangierine-cafe",
  "EPCOT|World Showcase|Teppan Edo": "ep-teppan-edo",
  "EPCOT|World Showcase|Tutto Gusto Wine Cellar": "ep-tutto-gusto",
  "EPCOT|World Showcase|Tutto Italia Ristorante": "ep-tutto-italia",
  "EPCOT|World Showcase|UK Beer Cart": "ep-uk-beer-cart",
  "EPCOT|World Showcase|Via Napoli Ristorante e Pizzeria": "ep-via-napoli",
  "EPCOT|World Showcase|Yorkshire County Fish Shop": "ep-yorkshire-fish-shop",

  // ── Hollywood Studios (20) ─────────────────────────────────────────
  "Hollywood Studios|Echo Lake|50's Prime Time Cafe": "hs-50s-prime-time",
  "Hollywood Studios|Commissary Lane|ABC Commissary": "hs-abc-commissary",
  "Hollywood Studios|Echo Lake|Backlot Express": "hs-backlot-express",
  "Hollywood Studios|Grand Avenue|BaseLine Tap House": "hs-baseline-tap-house",
  "Hollywood Studios|Hollywood Boulevard|The Hollywood Brown Derby": "hs-brown-derby",
  "Hollywood Studios|Hollywood Boulevard|The Hollywood Brown Derby Lounge": "hs-brown-derby-lounge",
  "Hollywood Studios|Sunset Boulevard|Catalina Eddie's": "hs-catalina-eddies",
  "Hollywood Studios|Star Wars: Galaxy's Edge|Docking Bay 7 Food and Cargo": "hs-docking-bay-7",
  "Hollywood Studios|Echo Lake|Dockside Diner": "hs-dockside-diner",
  "Hollywood Studios|Sunset Boulevard|Fairfax Fare": "hs-fairfax-fare",
  "Hollywood Studios|Echo Lake|Hollywood & Vine": "hs-hollywood-and-vine",
  "Hollywood Studios|Star Wars: Galaxy's Edge|Kat Saka's Kettle": "hs-kat-sakas-kettle",
  "Hollywood Studios|Star Wars: Galaxy's Edge|Milk Stand": "hs-milk-stand",
  "Hollywood Studios|Star Wars: Galaxy's Edge|Oga's Cantina": "hs-ogas-cantina",
  "Hollywood Studios|Star Wars: Galaxy's Edge|Ronto Roasters": "hs-ronto-roasters",
  "Hollywood Studios|Sunset Boulevard|Rosie's All-American Cafe": "hs-rosies",
  "Hollywood Studios|Toy Story Land|Roundup Rodeo BBQ": "hs-roundup-rodeo",
  "Hollywood Studios|Commissary Lane|Sci-Fi Dine-In Theater Restaurant": "hs-sci-fi-dine-in",
  "Hollywood Studios|Echo Lake|Tune-In Lounge": "hs-tune-in-lounge",
  "Hollywood Studios|Toy Story Land|Woody's Lunch Box": "hs-woodys-lunch-box",
};

/** Every slug published by the manifest. */
export const DINING_SLUG_VALUES: readonly string[] = Object.values(DINING_SLUGS);

/** Resolve a canonicalId to its published slug, or undefined when unpublished. */
export function diningSlugFor(canonicalId: string): string | undefined {
  return DINING_SLUGS[canonicalId];
}

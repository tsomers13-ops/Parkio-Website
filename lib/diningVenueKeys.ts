//
//  diningVenueKeys.ts — Website-owned immutable identity for permanent Dining.
//
//  HAND-AUTHORED. A venueKey is the durable data identity a Community Rating
//  is filed against. It is minted once and never changes.
//
//  Why not the identifiers we already have:
//    canonicalId  is "Park|Land|Name" — it moves when Disney renames a venue
//                 or re-designates a land, which would orphan every rating.
//    slug         is a public URL. URLs are allowed to change; ratings are not.
//    externalId   belongs to ThemeParks.wiki, not to us.
//
//  A venueKey may share text with today's slug — that is fine, and expected,
//  because both were minted from the same naming convention. It must NEVER be
//  DERIVED from the slug at runtime. If the URL changes, the slug changes and
//  the venueKey does not.
//
//  Ownership: iOS owns the factual venue record; the Website owns venueKey and
//  slug. The generated artifact is never modified to carry either.
//

/** Syntax for a minted venue key: park-prefixed, lowercase, hyphenated. */
export const VENUE_KEY_PATTERN = /^(?:ep|hs|mk|ak)-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * canonicalId (current iOS join identity) -> venueKey (immutable, ours).
 *
 * Keyed by canonicalId because that is how the generated artifact identifies a
 * venue today. If the canonicalId of a venue ever changes, THIS MAPPING is
 * what gets re-pointed — the venueKey on the right-hand side stays put, and
 * every rating filed against it survives.
 */
export const DINING_VENUE_KEYS: Readonly<Record<string, string>> = {

  // ── EPCOT (42) ─────────────────────────────────────
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

  // ── Hollywood Studios (20) ─────────────────────────────────────
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

  // ── Magic Kingdom (31) ─────────────────────────────────────
  "Magic Kingdom|Adventureland|Aloha Isle": "mk-aloha-isle",
  "Magic Kingdom|Tomorrowland|AstroFizz Hosted by Coca-Cola": "mk-astrofizz",
  "Magic Kingdom|Tomorrowland|Auntie Gravity's Galactic Goodies": "mk-auntie-gravitys",
  "Magic Kingdom|Fantasyland|Be Our Guest Restaurant": "mk-be-our-guest",
  "Magic Kingdom|Main Street, U.S.A.|Casey's Corner": "mk-caseys-corner",
  "Magic Kingdom|Fantasyland|Cheshire Café": "mk-cheshire-cafe",
  "Magic Kingdom|Fantasyland|Cinderella's Royal Table": "mk-cinderellas-royal-table",
  "Magic Kingdom|Tomorrowland|Cosmic Ray's Starlight Café": "mk-cosmic-rays",
  "Magic Kingdom|Tomorrowland|Energy Bytes": "mk-energy-bytes",
  "Magic Kingdom|Tomorrowland|Fireworks Dessert Parties at Tomorrowland Terrace Restaurant": "mk-tomorrowland-terrace-dessert-party",
  "Magic Kingdom|Fantasyland|Gaston's Tavern": "mk-gastons-tavern",
  "Magic Kingdom|Frontierland|Golden Oak Outpost": "mk-golden-oak-outpost",
  "Magic Kingdom|Tomorrowland|Joffrey's Coffee & Tea Company": "mk-joffreys",
  "Magic Kingdom|Adventureland|Jungle Navigation Co. LTD Skipper Canteen": "mk-skipper-canteen",
  "Magic Kingdom|Liberty Square|Liberty Tree Tavern": "mk-liberty-tree-tavern",
  "Magic Kingdom|Main Street, U.S.A.|Main Street Bakery": "mk-main-street-bakery",
  "Magic Kingdom|Frontierland|Pecos Bill Tall Tale Inn and Cafe": "mk-pecos-bill",
  "Magic Kingdom|Fantasyland|Pinocchio Village Haus": "mk-pinocchio-village-haus",
  "Magic Kingdom|Main Street, U.S.A.|Plaza Ice Cream Parlor": "mk-plaza-ice-cream-parlor",
  "Magic Kingdom|Fantasyland|Prince Eric's Village Market": "mk-prince-erics-village-market",
  "Magic Kingdom|Liberty Square|Sleepy Hollow": "mk-sleepy-hollow",
  "Magic Kingdom|Adventureland|Spring Roll Snack Cart": "mk-spring-roll-cart",
  "Magic Kingdom|Fantasyland|Storybook Treats": "mk-storybook-treats",
  "Magic Kingdom|Adventureland|Sunshine Tree Terrace": "mk-sunshine-tree-terrace",
  "Magic Kingdom|Adventureland|The Beak and Barrel": "mk-beak-and-barrel",
  "Magic Kingdom|Main Street, U.S.A.|The Crystal Palace": "mk-crystal-palace",
  "Magic Kingdom|Liberty Square|The Diamond Horseshoe": "mk-diamond-horseshoe",
  "Magic Kingdom|Fantasyland|The Friar's Nook": "mk-friars-nook",
  "Magic Kingdom|Tomorrowland|The Lunching Pad": "mk-lunching-pad",
  "Magic Kingdom|Main Street, U.S.A.|The Plaza Restaurant": "mk-plaza-restaurant",
  "Magic Kingdom|Main Street, U.S.A.|Tony's Town Square Restaurant": "mk-tonys-town-square",

  // ── Animal Kingdom (27) ─────────────────────────────────────
  "Animal Kingdom|Discovery Island|Flame Tree Barbecue": "ak-flame-tree-barbecue",
  "Animal Kingdom|Discovery Island|Tiffins Restaurant": "ak-tiffins",
  "Animal Kingdom|Discovery Island|Pizzafari": "ak-pizzafari",
  "Animal Kingdom|Discovery Island|Creature Comforts": "ak-creature-comforts",
  "Animal Kingdom|Discovery Island|Nomad Lounge & Cocktail Bar": "ak-nomad-lounge",
  "Animal Kingdom|Discovery Island|Isle of Java": "ak-isle-of-java",
  "Animal Kingdom|Discovery Island|Eight Spoon Café": "ak-eight-spoon-cafe",
  "Animal Kingdom|Discovery Island|The Smiling Crocodile": "ak-smiling-crocodile",
  "Animal Kingdom|Discovery Island|Terra Treats and Snack Shop": "ak-terra-treats",
  "Animal Kingdom|Africa|Harambe Market": "ak-harambe-market",
  "Animal Kingdom|Africa|Tusker House Restaurant": "ak-tusker-house",
  "Animal Kingdom|Africa|Kusafiri Coffee Shop & Bakery": "ak-kusafiri",
  "Animal Kingdom|Africa|Dawa Bar": "ak-dawa-bar",
  "Animal Kingdom|Africa|Tamu Tamu Refreshments": "ak-tamu-tamu",
  "Animal Kingdom|Africa|Harambe Fruit Market": "ak-harambe-fruit-market",
  "Animal Kingdom|Africa|Mahindi": "ak-mahindi",
  "Animal Kingdom|Asia|Yak & Yeti Local Food Cafes": "ak-yak-and-yeti-local-food-cafes",
  "Animal Kingdom|Asia|Yak & Yeti Restaurant": "ak-yak-and-yeti-restaurant",
  "Animal Kingdom|Asia|Thirsty River Bar & Trek Snacks": "ak-thirsty-river",
  "Animal Kingdom|Asia|Yak & Yeti Quality Beverages": "ak-yak-and-yeti-quality-beverages",
  "Animal Kingdom|Asia|Warung Outpost": "ak-warung-outpost",
  "Animal Kingdom|Asia|Drinkwallah": "ak-drinkwallah",
  "Animal Kingdom|Asia|Caravan Road": "ak-caravan-road",
  "Animal Kingdom|Asia|Anandapur Ice Cream Truck": "ak-anandapur-ice-cream-truck",
  "Animal Kingdom|Pandora|Satu'li Canteen": "ak-satuli-canteen",
  "Animal Kingdom|Pandora|Pongu Pongu": "ak-pongu-pongu",
  "Animal Kingdom|Main Entrance|Rainforest Cafe at Disney's Animal Kingdom": "ak-rainforest-cafe",
};

/** Every minted venue key. */
export const DINING_VENUE_KEY_VALUES: readonly string[] =
  Object.values(DINING_VENUE_KEYS);

/** Immutable key for a canonicalId, or undefined when the venue is unknown. */
export function venueKeyForCanonicalId(canonicalId: string): string | undefined {
  return DINING_VENUE_KEYS[canonicalId];
}

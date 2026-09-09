/**
 * Dining domain types.
 *
 * Dining is NOT an attraction. It shares the park/slug routing shape with
 * attractions, but nothing else: there is no wait time, no Lightning Lane,
 * no height requirement. Types here are deliberately independent.
 *
 * The domain is a discriminated union on `kind`, so a permanent restaurant
 * and a temporary festival marketplace can never be confused:
 *
 *   DiningItem
 *   ├── PermanentDiningVenue   (source of truth: iOS -> lib/generated/dining.json)
 *   └── FestivalBooth          (source of truth: content/dining/festivals/*.json)
 */

import type { ParkId } from "./types";

/** Parks with Dining coverage today. Not every ParkId qualifies. */
export const DINING_PARK_IDS = ["epcot", "hollywood-studios"] as const;
export type DiningParkId = (typeof DINING_PARK_IDS)[number];

/** Machine values from the generated dataset. Never mutated for display. */
export const DINING_TYPES = ["quickService", "tableService", "snackStand", "lounge"] as const;
export type DiningType = (typeof DINING_TYPES)[number];

/** Menu-item categories, taken from Disney's own section headings. */
export const MENU_ITEM_KINDS = ["food", "nonAlcoholicBeverage", "alcoholicBeverage"] as const;
export type MenuItemKind = (typeof MENU_ITEM_KINDS)[number];

// ── Permanent ───────────────────────────────────────────────────────────────

/**
 * Parkio editorial. Present for only 13 of 62 venues — `undefined` is a
 * first-class state, never a defect to paper over.
 */
export interface DiningEditorial {
  priceTier: number;
  parkioScore: number;
  shortVerdict: string;
  signatureItems: string[];
  mobileOrderAvailable: boolean;
  indoorSeating: boolean;
  kidFriendly: boolean;
  dietaryFlags: string[];
}

export interface PermanentDiningVenue {
  kind: "permanent";
  /** iOS stableID. Internal join key — never a public URL. */
  canonicalId: string;
  /**
   * Website-owned immutable identity. The durable key a Community Rating is
   * filed against — it outlives renames, land changes and URL changes.
   * Infrastructure identity only: never rendered, never used as SEO copy.
   */
  venueKey: string;
  /** Website-owned public slug. */
  slug: string;
  parkId: DiningParkId;
  name: string;
  land: string;
  type: DiningType;
  latitude?: number;
  longitude?: number;
  externalId?: string;
  editorial?: DiningEditorial;
}

// ── Seasonal ────────────────────────────────────────────────────────────────

export interface MenuPrice {
  /** Disney's exact printed string, e.g. "$5.99" or "$6.00 to $9.75". */
  display: string;
  /** Only set when `display` is a single clean amount. */
  amountUSD?: number;
}

export interface FestivalMenuItem {
  id: string;
  name: string;
  itemKind?: MenuItemKind;
  price?: MenuPrice;
  plantBased?: boolean;
  allergenSafeFor?: string[];
}

export interface FestivalBooth {
  kind: "festivalBooth";
  id: string;
  festivalId: string;
  name: string;
  parkId: DiningParkId;
  /** Disney's factual location text. NOT the permanent `land` taxonomy. */
  locationText: string;
  /** Present when the offering is hosted at an existing permanent venue. */
  venueCanonicalId?: string;
  /** Booth window; inherits the festival window when absent. */
  startsOn?: string;
  endsOn?: string;
  sourceUrl?: string;
  sourceNote?: string;
  menu: FestivalMenuItem[];
}

export interface Festival {
  id: string;
  name: string;
  edition: number;
  parkId: DiningParkId;
  startsOn: string;
  endsOn: string;
  timeZone?: string;
}

export type DiningItem = PermanentDiningVenue | FestivalBooth;

export function isPermanent(item: DiningItem): item is PermanentDiningVenue {
  return item.kind === "permanent";
}
export function isFestivalBooth(item: DiningItem): item is FestivalBooth {
  return item.kind === "festivalBooth";
}

// ── Presentation mapping (Website-owned; never written back to source) ───────

const DINING_TYPE_LABELS: Record<DiningType, string> = {
  quickService: "Quick Service",
  tableService: "Table Service",
  snackStand: "Snack & Kiosk",
  lounge: "Lounge",
};

export function diningTypeLabel(type: DiningType): string {
  return DINING_TYPE_LABELS[type];
}

const MENU_ITEM_KIND_LABELS: Record<MenuItemKind, string> = {
  food: "Food",
  nonAlcoholicBeverage: "Non-alcoholic",
  alcoholicBeverage: "Alcoholic",
};

/**
 * Factual classification only. Seven items sit under Disney headings that
 * state no category; they return undefined rather than being guessed, and
 * no ranking or recommendation logic is built on alcohol.
 */
export function menuItemKindLabel(kind: MenuItemKind | undefined): string | undefined {
  return kind ? MENU_ITEM_KIND_LABELS[kind] : undefined;
}

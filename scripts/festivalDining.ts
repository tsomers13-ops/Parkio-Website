//
//  festivalDining.ts — parser + validator for authored seasonal Dining content.
//
//  Seasonal content is Website-owned and hand-authored. There is deliberately
//  NO generated seasonal artifact: the authored file is already directly
//  consumable and validated, so a second generated copy would add drift
//  surface for no benefit.
//
//  Permanent Dining (lib/generated/dining.json) is untouched by this module.
//

import { readFileSync } from "node:fs";
import path from "node:path";

export const FESTIVAL_DIR = "content/dining/festivals";
export const SUPPORTED_SCHEMA_VERSION = 1;
export const SUPPORTED_ITEM_KINDS = ["food", "nonAlcoholicBeverage", "alcoholicBeverage"] as const;
export const FESTIVAL_TIME_ZONE = "America/New_York";

export interface FestivalPrice { display: string; amountUSD?: number }

export interface FestivalMenuItem {
  id: string;
  name: string;
  itemKind?: (typeof SUPPORTED_ITEM_KINDS)[number];
  price?: FestivalPrice;
  plantBased?: boolean;
  /** Only ever populated from Disney's allergy-friendly pages. */
  allergenSafeFor?: string[];
}

export interface FestivalBooth {
  id: string;
  festivalId: string;
  name: string;
  kind: "festivalBooth";
  locationText: string;
  /** Set when the offering is hosted by an existing permanent venue. */
  venueCanonicalId?: string;
  startsOn?: string;
  endsOn?: string;
  latitude?: number;
  longitude?: number;
  externalId?: string;
  sourceUrl?: string;
  sourceNote?: string;
  menu: FestivalMenuItem[];
}

export interface FestivalDocument {
  schemaVersion: number;
  festival: {
    id: string; name: string; edition: number; parkId: string;
    startsOn: string; endsOn: string; timeZone?: string;
  };
  provenance: {
    verifiedAt: string; sourceUrls: string[];
    boothCount: number; menuItemCount: number;
  };
  booths: FestivalBooth[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function loadFestival(repoRoot: string, file: string): FestivalDocument {
  return JSON.parse(
    readFileSync(path.join(repoRoot, FESTIVAL_DIR, file), "utf8"),
  ) as FestivalDocument;
}

/** canonicalIds of the committed permanent Dining venues. */
export function permanentCanonicalIds(repoRoot: string): Set<string> {
  const raw = readFileSync(path.join(repoRoot, "lib/generated/dining.json"), "utf8");
  const parsed = JSON.parse(raw) as { venues: { canonicalId: string }[] };
  return new Set(parsed.venues.map((v) => v.canonicalId));
}

export function validateFestival(doc: FestivalDocument, permanentIds: Set<string>): string[] {
  const errors: string[] = [];

  // ── Festival ──────────────────────────────────────────────────────────
  if (doc.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    errors.push(`unsupported schemaVersion ${doc.schemaVersion}`);
  }
  const f = doc.festival;
  if (!f?.id) errors.push("festival.id missing");
  if (!f?.name?.trim()) errors.push("festival.name empty");
  if (f?.parkId !== "epcot") errors.push(`festival.parkId '${f?.parkId}' != 'epcot'`);
  if (!ISO_DATE.test(f?.startsOn ?? "")) errors.push("festival.startsOn is not YYYY-MM-DD");
  if (!ISO_DATE.test(f?.endsOn ?? "")) errors.push("festival.endsOn is not YYYY-MM-DD");
  if (ISO_DATE.test(f?.startsOn ?? "") && ISO_DATE.test(f?.endsOn ?? "") && f.startsOn > f.endsOn) {
    errors.push("festival.startsOn is after festival.endsOn");
  }
  if (f?.timeZone && f.timeZone !== FESTIVAL_TIME_ZONE) {
    errors.push(`festival.timeZone '${f.timeZone}' != '${FESTIVAL_TIME_ZONE}'`);
  }

  // ── Booths ────────────────────────────────────────────────────────────
  const boothIds = new Set<string>();
  const itemIds = new Set<string>();
  const hostedVenues = new Map<string, string>();

  for (const b of doc.booths ?? []) {
    const where = b.id ?? "(booth with no id)";
    if (!b.id) errors.push("booth with no id");
    else if (boothIds.has(b.id)) errors.push(`duplicate booth id '${b.id}'`);
    else boothIds.add(b.id);

    if (!b.name?.trim()) errors.push(`${where}: empty booth name`);
    if (b.kind !== "festivalBooth") errors.push(`${where}: unsupported kind '${b.kind}'`);
    if (b.festivalId !== f?.id) errors.push(`${where}: festivalId '${b.festivalId}' does not resolve`);
    if (!b.locationText?.trim()) errors.push(`${where}: empty locationText`);

    for (const key of ["startsOn", "endsOn"] as const) {
      const v = b[key];
      if (v !== undefined && !ISO_DATE.test(v)) errors.push(`${where}: ${key} '${v}' is not YYYY-MM-DD`);
    }
    const bs = b.startsOn ?? f?.startsOn;
    const be = b.endsOn ?? f?.endsOn;
    if (bs && be && bs > be) errors.push(`${where}: effective startsOn after endsOn`);
    if (b.startsOn && f && b.startsOn < f.startsOn) errors.push(`${where}: startsOn precedes the festival`);
    if (b.endsOn && f && b.endsOn > f.endsOn) errors.push(`${where}: endsOn extends past the festival`);
    if ("isActive" in (b as object)) errors.push(`${where}: isActive is forbidden — lifecycle is date-driven`);

    if (b.venueCanonicalId !== undefined) {
      if (!permanentIds.has(b.venueCanonicalId)) {
        errors.push(`${where}: venueCanonicalId '${b.venueCanonicalId}' does not resolve against lib/generated/dining.json`);
      }
      const prior = hostedVenues.get(b.venueCanonicalId);
      if (prior) errors.push(`${where}: permanent venue '${b.venueCanonicalId}' already hosted by ${prior}`);
      else hostedVenues.set(b.venueCanonicalId, where);
    }

    const hasLat = b.latitude !== undefined;
    const hasLon = b.longitude !== undefined;
    if (hasLat !== hasLon) errors.push(`${where}: half a coordinate pair`);
    if (hasLat && hasLon) {
      const bad =
        !Number.isFinite(b.latitude!) || !Number.isFinite(b.longitude!) ||
        b.latitude! < -90 || b.latitude! > 90 ||
        b.longitude! < -180 || b.longitude! > 180 ||
        (b.latitude === 0 && b.longitude === 0);
      if (bad) errors.push(`${where}: malformed coordinate`);
    }
    if (b.menu === undefined || !Array.isArray(b.menu)) {
      errors.push(`${where}: menu must be an array (use [] when no menu is published)`);
      continue;
    }
    if (b.menu.length === 0 && !b.sourceNote) {
      errors.push(`${where}: empty menu must carry a sourceNote explaining the gap`);
    }

    // ── Menu ────────────────────────────────────────────────────────────
    for (const item of b.menu) {
      const iw = item.id ?? `${where} (item with no id)`;
      if (!item.id) errors.push(`${where}: menu item with no id`);
      else if (itemIds.has(item.id)) errors.push(`duplicate menu item id '${item.id}'`);
      else itemIds.add(item.id);
      if (!item.id?.startsWith(`${b.id}-`)) errors.push(`${iw}: id is not scoped to its booth`);
      if (!item.name?.trim()) errors.push(`${iw}: empty item name`);
      if (item.itemKind !== undefined &&
          !(SUPPORTED_ITEM_KINDS as readonly string[]).includes(item.itemKind)) {
        errors.push(`${iw}: unsupported itemKind '${item.itemKind}'`);
      }
      if (item.price !== undefined) {
        const display = item.price.display;
        if (!display?.trim()) errors.push(`${iw}: price present but display empty`);
        if (item.price.amountUSD !== undefined &&
            (!Number.isFinite(item.price.amountUSD) || item.price.amountUSD < 0)) {
          errors.push(`${iw}: amountUSD must be finite and >= 0`);
        }
        // Gate 2E: Disney publishes ranges such as "$6.00 to $9.75". Collapsing
        // one into a single number would invent a price, so amountUSD is only
        // legal when the display is exactly one clean amount.
        const single = /^\$\d+(?:\.\d{2})?$/.test(display ?? "");
        if (!single && item.price.amountUSD !== undefined) {
          errors.push(`${iw}: amountUSD set for non-single price display '${display}'`);
        }
        if (single && item.price.amountUSD === undefined) {
          errors.push(`${iw}: single price display '${display}' should carry amountUSD`);
        }
      }
      if (item.plantBased !== undefined && typeof item.plantBased !== "boolean") {
        errors.push(`${iw}: plantBased must be boolean when present`);
      }
      if (item.allergenSafeFor !== undefined &&
          (!Array.isArray(item.allergenSafeFor) || item.allergenSafeFor.some((a) => !a?.trim()))) {
        errors.push(`${iw}: malformed allergenSafeFor`);
      }
    }
  }

  // ── Provenance ────────────────────────────────────────────────────────
  const p = doc.provenance;
  if (!p) errors.push("provenance missing");
  else {
    if (!ISO_DATE.test(p.verifiedAt ?? "")) errors.push("provenance.verifiedAt is not YYYY-MM-DD");
    if (!Array.isArray(p.sourceUrls) || p.sourceUrls.length === 0) {
      errors.push("provenance.sourceUrls is empty");
    } else {
      for (const u of p.sourceUrls) {
        if (!/^https:\/\//.test(u)) errors.push(`provenance.sourceUrls: '${u}' is not an https URL`);
      }
    }
    if (p.boothCount !== doc.booths?.length) {
      errors.push(`provenance.boothCount ${p.boothCount} != ${doc.booths?.length} booths`);
    }
    const actualItems = (doc.booths ?? []).reduce((n, b) => n + (b.menu?.length ?? 0), 0);
    if (p.menuItemCount !== actualItems) {
      errors.push(`provenance.menuItemCount ${p.menuItemCount} != ${actualItems} items`);
    }
  }
  return errors;
}

// ── Lifecycle ────────────────────────────────────────────────────────────

export type LifecycleState = "upcoming" | "active" | "expired";

/** Park-local calendar date (America/New_York), no time-of-day. */
export function parkLocalDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FESTIVAL_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

/** Inclusive date-window comparison. No isActive flag exists anywhere. */
export function lifecycleState(startsOn: string, endsOn: string, today: string): LifecycleState {
  if (today < startsOn) return "upcoming";
  if (today > endsOn) return "expired";
  return "active";
}

export function boothWindow(doc: FestivalDocument, booth: FestivalBooth): [string, string] {
  return [booth.startsOn ?? doc.festival.startsOn, booth.endsOn ?? doc.festival.endsOn];
}

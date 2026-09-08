//
//  diningPipeline.ts — shared join + validation for the Dining dataset.
//
//  Used by both `dining:generate` and `dining:verify` so the two commands can
//  never disagree about what a valid dataset is.
//
//  Inputs:  authoritative iOS exporter JSON  +  Website-owned slug manifest.
//  Output:  the exact bytes committed to lib/generated/dining.json.
//

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { RIDES, PARKS } from "../lib/data";
import { DINING_SLUGS, DINING_SLUG_PATTERN, DINING_PILOT_PARK_IDS } from "../lib/diningSlugs";

export const SCHEMA_VERSION = 1;
export const SOURCE_REPOSITORY = "tsomers13-ops/parkio";
export const GENERATED_PATH = "lib/generated/dining.json";

/** Dining venue types the Website understands. Mirrors iOS AttractionType. */
export const SUPPORTED_TYPES = [
  "quickService",
  "snackStand",
  "tableService",
  "lounge",
] as const;

/** DietaryFlag raw values from the iOS model. */
export const DIETARY_FLAGS = [
  "Vegetarian", "Vegan", "Gluten-Friendly", "Dairy-Free",
  "Nut-Free", "Halal", "Kids Menu",
] as const;

// ── Source (exporter) shapes ────────────────────────────────────────────────

export interface SourceEditorial {
  priceTier: number;
  parkioScore: number;
  shortVerdict: string;
  signatureItems: string[];
  mobileOrderAvailable: boolean;
  indoorSeating: boolean;
  kidFriendly: boolean;
  dietaryFlags: string[];
}

export interface SourceVenue {
  id: string;
  name: string;
  park: string;
  parkId: string;
  land: string;
  type: string;
  externalId?: string;
  coordinate?: { lat: number; lon: number };
  editorial?: SourceEditorial;
}

export interface SourceExport {
  schemaVersion: number;
  generator: string;
  sourceCommit: string;
  sourceDirty: boolean;
  venueCount: number;
  venues: SourceVenue[];
}

// ── Generated (Website) shapes ──────────────────────────────────────────────

export interface DiningRecord {
  canonicalId: string;
  slug: string;
  parkId: string;
  name: string;
  land: string;
  type: string;
  latitude?: number;
  longitude?: number;
  externalId?: string;
  editorial?: SourceEditorial;
}

export interface DiningDataset {
  schemaVersion: number;
  sourceRepository: string;
  sourceCommit: string;
  sourceDirty: boolean;
  entityCount: number;
  venues: DiningRecord[];
}

// ── Reserved routes ─────────────────────────────────────────────────────────

/**
 * Public path segments a Dining slug must never shadow: every top-level
 * App Router segment plus every park id. Read from disk so a future route
 * automatically joins the collision check.
 */
export function reservedRouteSegments(repoRoot: string): string[] {
  const appDir = path.join(repoRoot, "app");
  const segments = readdirSync(appDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((n) => !n.startsWith("[") && !n.startsWith("(") && !n.startsWith("_"));
  return [...new Set([...segments, ...PARKS.map((p) => p.id)])].sort();
}

// ── Loading ─────────────────────────────────────────────────────────────────

export function readSource(inputPath: string): SourceExport {
  const raw = readFileSync(inputPath, "utf8");
  const parsed = JSON.parse(raw) as SourceExport;
  if (!Array.isArray(parsed.venues)) {
    throw new Error(`${inputPath}: not a Parkio dining export (no venues array)`);
  }
  if (parsed.venues.length !== parsed.venueCount) {
    throw new Error(
      `${inputPath}: venueCount ${parsed.venueCount} != venues.length ${parsed.venues.length}`,
    );
  }
  return parsed;
}

// ── Join + validate ─────────────────────────────────────────────────────────

function validateEditorial(e: SourceEditorial, where: string, errors: string[]): void {
  if (!Number.isInteger(e.priceTier) || e.priceTier < 1 || e.priceTier > 4) {
    errors.push(`${where}: priceTier ${e.priceTier} outside 1-4`);
  }
  if (!Number.isInteger(e.parkioScore) || e.parkioScore < 1 || e.parkioScore > 10) {
    errors.push(`${where}: parkioScore ${e.parkioScore} outside 1-10`);
  }
  if (typeof e.shortVerdict !== "string" || e.shortVerdict.trim() === "") {
    errors.push(`${where}: empty shortVerdict`);
  }
  if (!Array.isArray(e.signatureItems) || e.signatureItems.some((s) => !s || !s.trim())) {
    errors.push(`${where}: malformed signatureItems`);
  }
  for (const key of ["mobileOrderAvailable", "indoorSeating", "kidFriendly"] as const) {
    if (typeof e[key] !== "boolean") errors.push(`${where}: ${key} is not a boolean`);
  }
  if (!Array.isArray(e.dietaryFlags)) {
    errors.push(`${where}: dietaryFlags is not an array`);
  } else {
    for (const f of e.dietaryFlags) {
      if (!(DIETARY_FLAGS as readonly string[]).includes(f)) {
        errors.push(`${where}: unknown dietary flag '${f}'`);
      }
    }
    const sorted = [...e.dietaryFlags].sort();
    if (JSON.stringify(sorted) !== JSON.stringify(e.dietaryFlags)) {
      errors.push(`${where}: dietaryFlags not sorted (non-deterministic)`);
    }
    if (new Set(e.dietaryFlags).size !== e.dietaryFlags.length) {
      errors.push(`${where}: duplicate dietary flags`);
    }
  }
}

export function buildDataset(
  source: SourceExport,
  repoRoot: string,
): { dataset: DiningDataset; errors: string[] } {
  const errors: string[] = [];
  const pilot = new Set<string>(DINING_PILOT_PARK_IDS);
  const byCanonicalId = new Map(source.venues.map((v) => [v.id, v]));

  // 1. Manifest shape --------------------------------------------------------
  const manifestEntries = Object.entries(DINING_SLUGS);
  if (manifestEntries.length !== 62) {
    errors.push(`manifest has ${manifestEntries.length} entries, expected 62`);
  }

  const seenSlugs = new Map<string, string>();
  for (const [canonicalId, slug] of manifestEntries) {
    if (!DINING_SLUG_PATTERN.test(slug)) {
      errors.push(`manifest: slug '${slug}' fails syntax rules`);
    }
    const prior = seenSlugs.get(slug);
    if (prior) errors.push(`manifest: duplicate slug '${slug}' (${prior} and ${canonicalId})`);
    seenSlugs.set(slug, canonicalId);

    const venue = byCanonicalId.get(canonicalId);
    if (!venue) {
      errors.push(`manifest: orphaned canonicalId '${canonicalId}' (not in export)`);
      continue;
    }
    if (!pilot.has(venue.parkId)) {
      errors.push(`manifest: '${canonicalId}' is in ${venue.parkId}, outside the pilot`);
    }
    const expectedPrefix = venue.parkId === "epcot" ? "ep-" : "hs-";
    if (!slug.startsWith(expectedPrefix)) {
      errors.push(`manifest: slug '${slug}' prefix does not match park ${venue.parkId}`);
    }
  }

  // 2. Collisions ------------------------------------------------------------
  const attractionSlugs = new Set(RIDES.map((r) => r.id));
  const reserved = new Set(reservedRouteSegments(repoRoot));
  for (const [canonicalId, slug] of manifestEntries) {
    if (attractionSlugs.has(slug)) {
      errors.push(`manifest: slug '${slug}' collides with an attraction slug (${canonicalId})`);
    }
    if (reserved.has(slug)) {
      errors.push(`manifest: slug '${slug}' collides with a reserved route segment`);
    }
  }

  // 3. Completeness: no pilot venue may lack a slug ---------------------------
  for (const venue of source.venues) {
    if (pilot.has(venue.parkId) && !(venue.id in DINING_SLUGS)) {
      errors.push(`export: pilot venue '${venue.id}' has no manifest slug`);
    }
  }

  // 4. Build records ---------------------------------------------------------
  const venues: DiningRecord[] = [];
  for (const [canonicalId, slug] of manifestEntries) {
    const v = byCanonicalId.get(canonicalId);
    if (!v) continue;

    if (!(SUPPORTED_TYPES as readonly string[]).includes(v.type)) {
      errors.push(`${canonicalId}: unsupported type '${v.type}'`);
    }
    if (v.coordinate) {
      const { lat, lon } = v.coordinate;
      const bad =
        !Number.isFinite(lat) || !Number.isFinite(lon) ||
        lat < -90 || lat > 90 || lon < -180 || lon > 180 ||
        (lat === 0 && lon === 0);
      if (bad) errors.push(`${canonicalId}: malformed coordinate (${lat}, ${lon})`);
    }
    if (v.editorial) validateEditorial(v.editorial, canonicalId, errors);

    // Fixed key order — part of the deterministic contract.
    const record: DiningRecord = {
      canonicalId,
      slug,
      parkId: v.parkId,
      name: v.name,
      land: v.land,
      type: v.type,
    };
    if (v.coordinate) {
      record.latitude = v.coordinate.lat;
      record.longitude = v.coordinate.lon;
    }
    if (v.externalId) record.externalId = v.externalId;
    if (v.editorial) record.editorial = v.editorial;
    venues.push(record);
  }

  // 5. Deterministic order: parkId, then slug ---------------------------------
  venues.sort((a, b) =>
    a.parkId === b.parkId ? (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)
                          : a.parkId < b.parkId ? -1 : 1,
  );

  const dataset: DiningDataset = {
    schemaVersion: SCHEMA_VERSION,
    sourceRepository: SOURCE_REPOSITORY,
    sourceCommit: source.sourceCommit,
    sourceDirty: source.sourceDirty,
    entityCount: venues.length,
    venues,
  };
  return { dataset, errors };
}

/** The exact committed bytes: 2-space JSON, LF endings, trailing newline. */
export function serialize(dataset: DiningDataset): string {
  return JSON.stringify(dataset, null, 2).replace(/\r\n/g, "\n") + "\n";
}

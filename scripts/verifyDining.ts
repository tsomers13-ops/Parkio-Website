//
//  verifyDining.ts — verification only. Never mutates the committed artifact.
//
//  Usage:
//    npm run dining:verify                              (internal consistency)
//    npm run dining:verify -- --input <exporter-json>   (+ regenerate & compare)
//
//  Without --input this checks the committed dataset against the Website slug
//  manifest, the attraction slugs and the route table. With --input it also
//  regenerates from the authoritative iOS export and requires byte equality,
//  which is what detects cross-repo drift.
//

import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  buildDataset, readSource, serialize, reservedRouteSegments,
  GENERATED_PATH, SCHEMA_VERSION, SOURCE_REPOSITORY, SUPPORTED_TYPES,
  type DiningDataset,
} from "./diningPipeline";
import { RIDES } from "../lib/data";
import { DINING_SLUGS, DINING_SLUG_PATTERN, DINING_PILOT_PARK_IDS } from "../lib/diningSlugs";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const repoRoot = path.resolve(__dirname, "..");
const committedPath = path.join(repoRoot, GENERATED_PATH);
const failures: string[] = [];

const committedBytes = readFileSync(committedPath, "utf8");
const committed = JSON.parse(committedBytes) as DiningDataset;

// ── 1. Provenance + shape ───────────────────────────────────────────────────
if (committed.schemaVersion !== SCHEMA_VERSION) {
  failures.push(`schemaVersion ${committed.schemaVersion} != ${SCHEMA_VERSION}`);
}
if (committed.sourceRepository !== SOURCE_REPOSITORY) {
  failures.push(`sourceRepository '${committed.sourceRepository}' != '${SOURCE_REPOSITORY}'`);
}
if (!/^[0-9a-f]{40}$/.test(committed.sourceCommit)) {
  failures.push(`sourceCommit '${committed.sourceCommit}' is not a full 40-char SHA`);
}
if (committed.sourceDirty !== false) {
  failures.push(`sourceDirty is ${committed.sourceDirty}; datasets must be generated from a clean tree`);
}
if (committed.entityCount !== committed.venues.length) {
  failures.push(`entityCount ${committed.entityCount} != venues.length ${committed.venues.length}`);
}
if ("generatedAt" in committed) {
  failures.push("dataset carries a wall-clock generatedAt field (breaks determinism)");
}

// ── 2. Manifest agreement ───────────────────────────────────────────────────
const manifestIds = new Set(Object.keys(DINING_SLUGS));
const datasetIds = new Set(committed.venues.map((v) => v.canonicalId));
for (const id of manifestIds) {
  if (!datasetIds.has(id)) failures.push(`manifest entry missing from dataset: ${id}`);
}
for (const id of datasetIds) {
  if (!manifestIds.has(id)) failures.push(`dataset record orphaned (no manifest entry): ${id}`);
}
if (datasetIds.size !== committed.venues.length) failures.push("duplicate canonicalId in dataset");

const slugs = committed.venues.map((v) => v.slug);
if (new Set(slugs).size !== slugs.length) failures.push("duplicate slug in dataset");
for (const v of committed.venues) {
  if (DINING_SLUGS[v.canonicalId] !== v.slug) {
    failures.push(`${v.canonicalId}: dataset slug '${v.slug}' != manifest slug '${DINING_SLUGS[v.canonicalId]}'`);
  }
  if (!DINING_SLUG_PATTERN.test(v.slug)) failures.push(`${v.slug}: fails slug syntax`);
}

// ── 3. Collisions ───────────────────────────────────────────────────────────
const attractionSlugs = new Set(RIDES.map((r) => r.id));
const reserved = new Set(reservedRouteSegments(repoRoot));
for (const v of committed.venues) {
  if (attractionSlugs.has(v.slug)) failures.push(`${v.slug}: collides with an attraction slug`);
  if (reserved.has(v.slug)) failures.push(`${v.slug}: collides with a reserved route segment`);
}

// ── 4. Park / type / coordinate sanity ──────────────────────────────────────
const pilot = new Set<string>(DINING_PILOT_PARK_IDS);
for (const v of committed.venues) {
  if (!pilot.has(v.parkId)) failures.push(`${v.slug}: park '${v.parkId}' is outside the pilot`);
  if (!(SUPPORTED_TYPES as readonly string[]).includes(v.type)) {
    failures.push(`${v.slug}: unsupported type '${v.type}'`);
  }
  const hasLat = v.latitude !== undefined;
  const hasLon = v.longitude !== undefined;
  if (hasLat !== hasLon) failures.push(`${v.slug}: half a coordinate pair`);
  if (hasLat && hasLon) {
    const bad =
      !Number.isFinite(v.latitude!) || !Number.isFinite(v.longitude!) ||
      v.latitude! < -90 || v.latitude! > 90 ||
      v.longitude! < -180 || v.longitude! > 180 ||
      (v.latitude === 0 && v.longitude === 0);
    if (bad) failures.push(`${v.slug}: malformed coordinate`);
  }
  if (v.editorial !== undefined && (v.editorial === null || typeof v.editorial !== "object")) {
    failures.push(`${v.slug}: editorial present but not an object`);
  }
}

// ── 5. Byte-level determinism of the committed file ─────────────────────────
if (serialize(committed) !== committedBytes) {
  failures.push("committed file is not byte-identical to its own canonical serialization (ordering, indent or newline drift)");
}

// ── 6. Optional: regenerate from the authoritative export and compare ───────
const input = arg("--input");
if (input) {
  const source = readSource(input);
  const { dataset, errors } = buildDataset(source, repoRoot);
  for (const e of errors) failures.push(`regenerate: ${e}`);
  const regenerated = serialize(dataset);
  if (regenerated !== committedBytes) {
    failures.push(
      `committed dataset differs from a fresh generation of ${input} — ` +
      `run \`npm run dining:generate -- --input ${input}\` and review the diff`,
    );
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
const sha = createHash("sha256").update(committedBytes).digest("hex");
if (failures.length > 0) {
  console.error(`dining:verify FAILED — ${failures.length} problem(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("dining:verify OK");
console.log(`  ${GENERATED_PATH}`);
console.log(`  sha256       : ${sha}`);
console.log(`  entityCount  : ${committed.entityCount}`);
console.log(`  sourceCommit : ${committed.sourceCommit} (dirty=${committed.sourceDirty})`);
console.log(`  regenerated  : ${input ? `compared against ${input} — byte-identical` : "not compared (no --input)"}`);

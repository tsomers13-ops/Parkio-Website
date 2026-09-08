//
//  generateDining.ts — produce lib/generated/dining.json.
//
//  Usage: npm run dining:generate -- --input <exporter-json>
//
//  Joins the authoritative iOS exporter output with the Website-owned slug
//  manifest. Never invents data and never edits the manifest.
//

import { writeFileSync } from "node:fs";
import path from "node:path";
import { buildDataset, readSource, serialize, GENERATED_PATH } from "./diningPipeline";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const repoRoot = path.resolve(__dirname, "..");
const input = arg("--input");
if (!input) {
  console.error("usage: npm run dining:generate -- --input <exporter-json>");
  process.exit(2);
}

const source = readSource(input);
const { dataset, errors } = buildDataset(source, repoRoot);

if (errors.length > 0) {
  console.error(`dining:generate — refusing to write, ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const outPath = path.join(repoRoot, GENERATED_PATH);
const bytes = serialize(dataset);
writeFileSync(outPath, bytes, "utf8");

const byPark = dataset.venues.reduce<Record<string, number>>((acc, v) => {
  acc[v.parkId] = (acc[v.parkId] ?? 0) + 1;
  return acc;
}, {});

console.log(`wrote ${GENERATED_PATH} (${Buffer.byteLength(bytes)} bytes)`);
console.log(`  sourceCommit : ${dataset.sourceCommit}`);
console.log(`  sourceDirty  : ${dataset.sourceDirty}`);
console.log(`  entityCount  : ${dataset.entityCount}`);
console.log(`  by park      : ${Object.entries(byPark).sort().map(([k, n]) => `${k}=${n}`).join(" ")}`);
console.log(`  editorial    : ${dataset.venues.filter((v) => v.editorial).length}`);
console.log(`  coordinates  : ${dataset.venues.filter((v) => v.latitude !== undefined).length}`);
console.log(`  externalId   : ${dataset.venues.filter((v) => v.externalId).length}`);

//
//  validateFestivalDining.ts — structural validation only.
//  Deterministic: does not consult the wall clock, so a passing build stays
//  passing as time advances. Lifecycle reporting lives in festivalDiningStatus.
//
import { readdirSync } from "node:fs";
import path from "node:path";
import { FESTIVAL_DIR, loadFestival, permanentCanonicalIds, validateFestival } from "./festivalDining";

const repoRoot = path.resolve(__dirname, "..");
const files = readdirSync(path.join(repoRoot, FESTIVAL_DIR)).filter((f) => f.endsWith(".json")).sort();

if (files.length === 0) {
  console.error("dining:festival:validate — no festival files found");
  process.exit(1);
}

const permanentIds = permanentCanonicalIds(repoRoot);
const seenFestivalIds = new Set<string>();
let failed = 0;

for (const file of files) {
  const doc = loadFestival(repoRoot, file);
  const errors = validateFestival(doc, permanentIds);
  if (seenFestivalIds.has(doc.festival?.id)) errors.push(`duplicate festival id '${doc.festival.id}'`);
  seenFestivalIds.add(doc.festival?.id);

  if (errors.length > 0) {
    failed += 1;
    console.error(`FAIL ${file} — ${errors.length} problem(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    continue;
  }
  const hosts = doc.booths.filter((b) => b.venueCanonicalId).length;
  const noMenu = doc.booths.filter((b) => b.menu.length === 0).length;
  const overrides = doc.booths.filter((b) => b.startsOn || b.endsOn).length;
  const coords = doc.booths.filter((b) => b.latitude !== undefined).length;
  console.log(`OK   ${file}`);
  console.log(`       festival     : ${doc.festival.id} (${doc.festival.startsOn} → ${doc.festival.endsOn})`);
  console.log(`       booths       : ${doc.booths.length} (${hosts} permanent-venue hosts, ${doc.booths.length - hosts} standalone)`);
  console.log(`       menu items   : ${doc.provenance.menuItemCount}  |  booths without a menu: ${noMenu}`);
  console.log(`       overrides    : ${overrides}  |  booths with coordinates: ${coords}`);
  console.log(`       verifiedAt   : ${doc.provenance.verifiedAt}`);
}
if (failed > 0) process.exit(1);

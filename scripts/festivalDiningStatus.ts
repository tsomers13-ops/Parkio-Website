//
//  festivalDiningStatus.ts — lifecycle / staleness reporting.
//  Separated from validation so normal builds never fail merely because the
//  wall clock advanced.
//
import { readdirSync } from "node:fs";
import path from "node:path";
import { FESTIVAL_DIR, boothWindow, lifecycleState, loadFestival, parkLocalDate } from "./festivalDining";

const repoRoot = path.resolve(__dirname, "..");
const today = parkLocalDate();
const files = readdirSync(path.join(repoRoot, FESTIVAL_DIR)).filter((f) => f.endsWith(".json")).sort();

console.log(`park-local date (America/New_York): ${today}`);
for (const file of files) {
  const doc = loadFestival(repoRoot, file);
  const state = lifecycleState(doc.festival.startsOn, doc.festival.endsOn, today);
  const active = doc.booths.filter((b) => {
    const [s, e] = boothWindow(doc, b);
    return lifecycleState(s, e, today) === "active";
  });
  const ageDays = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${doc.provenance.verifiedAt}T00:00:00Z`)) / 86_400_000,
  );
  console.log(`\n${doc.festival.name} (${doc.festival.id})`);
  console.log(`  window       : ${doc.festival.startsOn} → ${doc.festival.endsOn}`);
  console.log(`  state        : ${state.toUpperCase()}`);
  console.log(`  booths active: ${active.length}/${doc.booths.length}`);
  for (const b of doc.booths) {
    const [s, e] = boothWindow(doc, b);
    const bs = lifecycleState(s, e, today);
    if (bs !== "active") console.log(`    ${bs.padEnd(8)} ${b.name} (${s} → ${e})`);
  }
  console.log(`  verifiedAt   : ${doc.provenance.verifiedAt} (${ageDays} day(s) ago)`);
  if (state === "active" && ageDays > 14) {
    console.log("  NOTE: source last verified more than 14 days ago — menus and prices change mid-festival.");
  }
  if (state === "expired") {
    console.log("  NOTE: festival has ended — retained for history, must be excluded from current Dining decisions.");
  }
}

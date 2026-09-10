/**
 * Generate the iOS venueKey mapping from the Website registry.
 *
 * The Website owns venueKey. Hand-copying 62 pairs into a second repository
 * would guarantee they drift, so the Swift file is generated from
 * lib/diningVenueKeys.ts and committed to the iOS repo as generated output.
 *
 * The registry is already keyed by the iOS stableID — "{Park}|{land}|{name}" —
 * so the two platforms join on a value both already compute, with no name
 * matching and no fuzzy resolution anywhere.
 *
 * Usage:
 *   npm run dining:venuekeys:swift -- --output <path-to-iOS>/Parkio/Models/DiningVenueKeys.swift
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { DINING_VENUE_KEYS, VENUE_KEY_PATTERN } from "../lib/diningVenueKeys";

function argument(name: string): string | undefined {
  const argv = process.argv;
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

const output = argument("--output");
const sidecar = argument("--sidecar");
if (!output || !sidecar) {
  console.error(
    "usage: exportVenueKeysSwift --output <path/DiningVenueKeys.swift> --sidecar <path/DiningVenueKeys.json>",
  );
  process.exit(2);
}

const entries = Object.entries(DINING_VENUE_KEYS).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

// Fail closed before writing anything.
const problems: string[] = [];
const seenKeys = new Set<string>();
for (const [stableId, venueKey] of entries) {
  if (!VENUE_KEY_PATTERN.test(venueKey)) problems.push(`malformed venueKey '${venueKey}'`);
  if (seenKeys.has(venueKey)) problems.push(`duplicate venueKey '${venueKey}'`);
  seenKeys.add(venueKey);
  if (stableId.split("|").length !== 3) problems.push(`stableID is not Park|land|name: '${stableId}'`);
  if (stableId.includes('"') || stableId.includes("\\")) problems.push(`unescapable stableID: '${stableId}'`);
}
if (problems.length > 0) {
  console.error("venueKey registry is invalid:\n  " + problems.join("\n  "));
  process.exit(1);
}

const sourcePath = resolve(__dirname, "../lib/diningVenueKeys.ts");
const sourceSha = createHash("sha256").update(readFileSync(sourcePath)).digest("hex");

const rows = entries
  .map(([stableId, venueKey]) => `        "${stableId}": "${venueKey}",`)
  .join("\n");

const swift = `// DiningVenueKeys.swift — GENERATED. Do not edit by hand.
//
// Source of truth: Parkio-Website-Live/lib/diningVenueKeys.ts
// Regenerate with:
//   npm run dining:venuekeys:swift -- --output <iOS>/Parkio/Models/DiningVenueKeys.swift \\
//                                      --sidecar <iOS>/Tools/VenueKeys/DiningVenueKeys.json
//
// sourceSha256: ${sourceSha}
// entries: ${entries.length}
//
// venueKey is the Website-owned immutable identity a Community Rating is filed
// against. It is NOT a slug, NOT a stableID and NOT a display name, and it is
// never derived from a name at runtime — the mapping below is exhaustive and
// explicit, so an unmapped venue is simply not rateable rather than guessed at.
//
// The dictionary is keyed by the iOS stableID, "{Park.rawValue}|{land}|{name}",
// which is the same string the Website registry already uses as its key.

import Foundation

enum DiningVenueKeys {

    /// stableID → venueKey, for every venue the ratings backend accepts today.
    static let byStableID: [String: String] = [
${rows}
    ]

    /// Number of venues the backend currently accepts. Guards against a
    /// silent partial regeneration.
    static let expectedCount = ${entries.length}

    /// The venueKey for a venue, or nil when it is not rateable yet.
    static func venueKey(forStableID stableID: String) -> String? {
        byStableID[stableID]
    }

    /// Whether this venue can currently be rated.
    static func isRateable(stableID: String) -> Bool {
        byStableID[stableID] != nil
    }
}
`;

writeFileSync(output, swift, "utf8");

// A JSON sidecar the iOS exporter cross-checks against the real 86 venues.
// It lives under Tools/, outside the synchronized Parkio/ folder, so it is
// never bundled into the shipping app.
writeFileSync(
  sidecar,
  JSON.stringify({ sourceSha256: sourceSha, count: entries.length, byStableID: Object.fromEntries(entries) }, null, 2) + "\n",
  "utf8",
);

console.log(`wrote ${output}`);
console.log(`wrote ${sidecar}`);
console.log(`  entries      : ${entries.length}`);
console.log(`  distinct keys: ${seenKeys.size}`);
console.log(`  sourceSha256 : ${sourceSha}`);

/**
 * Planning-time land grouping for park discovery.
 *
 * Presentation logic only. `Ride.land` stays canonical and untouched —
 * the attraction page still shows "World Showcase — Norway", because
 * that is where the ride actually is. This module only decides which
 * heading a ride sits under when browsing a park.
 *
 * ── Why a separator split, and why it is safe ────────────────────────
 *
 * A handful of lands use the shape "{Neighbourhood} — {Pavilion}". Today
 * that is exactly three EPCOT entries (Norway, France, Mexico), which
 * would otherwise render as three single-ride headings and bury the fact
 * that they are all World Showcase. Grouping on the separator collapses
 * EPCOT's 6 raw lands into 4 planning groups.
 *
 * The split is deliberately narrow: an em-dash surrounded by spaces, and
 * only the first occurrence. No other land in the dataset contains a dash
 * of any kind — `tests/lands.test.ts` asserts that, so if a different
 * "X — Y" convention ever appears the assumption gets re-examined rather
 * than silently applied.
 */

import type { Ride } from "./types";

/** Separator used by "{Neighbourhood} — {Pavilion}" land values. */
const LAND_SEPARATOR = " — ";

export interface LandGroup {
  /** Heading shown when browsing the park, e.g. "World Showcase". */
  name: string;
  /** Rides in this group, in canonical dataset order. */
  rides: Ride[];
}

/**
 * The planning heading for a canonical land value.
 *
 * "World Showcase — Norway" → "World Showcase"
 * "Toy Story Land"          → "Toy Story Land"
 */
export function planningLand(land: string): string {
  const index = land.indexOf(LAND_SEPARATOR);
  return index === -1 ? land : land.slice(0, index);
}

/**
 * True when the ride's canonical land carries detail beyond its planning
 * group — i.e. the pavilion is worth showing alongside the ride.
 */
export function hasPavilionDetail(land: string): boolean {
  return land.includes(LAND_SEPARATOR);
}

/**
 * The pavilion portion, or null when the land has no extra detail.
 *
 * "World Showcase — Norway" → "Norway"
 */
export function pavilionName(land: string): string | null {
  const index = land.indexOf(LAND_SEPARATOR);
  return index === -1 ? null : land.slice(index + LAND_SEPARATOR.length);
}

/**
 * Group a park's rides for discovery.
 *
 * Group order follows first appearance in the supplied list, and rides
 * keep their given order, so the output is deterministic and matches the
 * order the dataset was authored in.
 *
 * The caller is responsible for passing a single park's rides; this
 * function does not filter, so it can never silently mix parks.
 */
export function groupRidesByLand(rides: Ride[]): LandGroup[] {
  const groups: LandGroup[] = [];
  const byName = new Map<string, LandGroup>();

  for (const ride of rides) {
    const name = planningLand(ride.land);
    let group = byName.get(name);
    if (!group) {
      group = { name, rides: [] };
      byName.set(name, group);
      groups.push(group);
    }
    group.rides.push(ride);
  }

  return groups;
}

/**
 * Single source of truth for how a wait time is presented to guests.
 *
 * Parkio shows exactly three states, and never blurs them:
 *
 *   live        — a real posted standby wait from the upstream feed.
 *   typical     — Parkio's own planning estimate for the attraction.
 *                 DETERMINISTIC: the same ride always produces the same
 *                 number. It must never drift with the clock or with a
 *                 pseudo-random offset, because a number that moves reads
 *                 as a measurement.
 *   unavailable — no trustworthy number. Show the operational status, or
 *                 say plainly that no wait is posted. Never invent one.
 *
 * Presentational components ask for a state and a label; they don't
 * re-derive the rules themselves.
 */

import { statusLabel } from "./utils";
import type { ApiAttractionStatus, Ride } from "./types";

export type WaitStateKind = "live" | "typical" | "unavailable";

export interface WaitState {
  kind: WaitStateKind;
  /**
   * Posted minutes when `kind` is "live", Parkio's planning estimate when
   * "typical", and null when "unavailable".
   */
  wait: number | null;
  status: ApiAttractionStatus;
}

/** The shape we need off a live attraction row. */
export interface LiveWaitInput {
  status: ApiAttractionStatus;
  waitMinutes: number | null;
}

/**
 * Parkio's planning estimate for an attraction, rounded to the nearest
 * five minutes with a five-minute floor.
 *
 * Deterministic by design — no clock, no randomness. Called twice a year
 * apart, it returns the same number.
 */
export function typicalWait(ride: Pick<Ride, "baseWait">): number {
  return Math.max(5, Math.round(ride.baseWait / 5) * 5);
}

/**
 * Resolve a ride plus its (possibly missing) live row into one state.
 *
 * `live === null | undefined` means the upstream had no row for this ride
 * — still loading, or the attraction isn't in the feed. Both fall back to
 * the planning estimate rather than to nothing, so the surface stays
 * useful; the label makes the difference obvious.
 */
export function deriveWaitState(
  ride: Pick<Ride, "baseWait">,
  live?: LiveWaitInput | null,
): WaitState {
  if (!live) {
    return { kind: "typical", wait: typicalWait(ride), status: "OPERATING" };
  }

  if (live.status === "OPERATING") {
    return typeof live.waitMinutes === "number"
      ? { kind: "live", wait: live.waitMinutes, status: "OPERATING" }
      : { kind: "unavailable", wait: null, status: "OPERATING" };
  }

  // The upstream admitting it doesn't know is not the same as the ride
  // being closed — fall back to the planning estimate.
  if (live.status === "UNKNOWN") {
    return { kind: "typical", wait: typicalWait(ride), status: "OPERATING" };
  }

  // DOWN / CLOSED / REFURBISHMENT
  return { kind: "unavailable", wait: null, status: live.status };
}

/** Full-length guest label, e.g. "25 min" / "Typically ~35 min". */
export function waitStateLabel(state: WaitState): string {
  switch (state.kind) {
    case "live":
      return `${state.wait} min`;
    case "typical":
      return `Typically ~${state.wait} min`;
    case "unavailable":
      return state.status === "OPERATING"
        ? "No wait posted"
        : statusLabel(state.status);
  }
}

/**
 * Compact label for space-constrained surfaces (map pins, small pills).
 * "25 min" / "~35 min" / "—" or a short status word.
 */
export function waitStateCompactLabel(state: WaitState): string {
  switch (state.kind) {
    case "live":
      return `${state.wait} min`;
    case "typical":
      return `~${state.wait} min`;
    case "unavailable":
      return state.status === "OPERATING" ? "—" : statusLabel(state.status);
  }
}

import type { ApiAttractionStatus, CrowdLevel } from "./types";

export type WaitTier = "low" | "mid" | "high";

export function waitTier(minutes: number): WaitTier {
  if (minutes <= 30) return "low";
  if (minutes <= 60) return "mid";
  return "high";
}

export function waitColorClasses(tier: WaitTier) {
  switch (tier) {
    case "low":
      return {
        bg: "bg-emerald-50",
        text: "text-emerald-700",
        ring: "ring-emerald-200",
        dot: "bg-emerald-500",
        pin: "bg-emerald-500",
      };
    case "mid":
      return {
        bg: "bg-amber-50",
        text: "text-amber-700",
        ring: "ring-amber-200",
        dot: "bg-amber-500",
        pin: "bg-amber-500",
      };
    case "high":
      return {
        bg: "bg-rose-50",
        text: "text-rose-700",
        ring: "ring-rose-200",
        dot: "bg-rose-500",
        pin: "bg-rose-500",
      };
  }
}

/**
 * Guest-facing wording for a park's crowd level.
 *
 * `Park.crowd` is static Parkio editorial — it is not measured, and it
 * does not change during the day. The "Typically" framing keeps it useful
 * for planning without implying a live reading.
 */
export function crowdLabel(level: CrowdLevel): string {
  switch (level) {
    case "Low":
      return "Typically quiet";
    case "Moderate":
      return "Typically moderate";
    case "High":
      return "Typically busy";
  }
}

export function crowdColor(level: CrowdLevel) {
  switch (level) {
    case "Low":
      return {
        bg: "bg-emerald-50",
        text: "text-emerald-700",
        dot: "bg-emerald-500",
      };
    case "Moderate":
      return {
        bg: "bg-amber-50",
        text: "text-amber-700",
        dot: "bg-amber-500",
      };
    case "High":
      return {
        bg: "bg-rose-50",
        text: "text-rose-700",
        dot: "bg-rose-500",
      };
  }
}

export function formatTime(d: Date = new Date()): string {
  return d.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

/* ──────────────────────── Status helpers ──────────────────────── */

/**
 * Friendly short label for a ride's status. Worded for guests, not
 * for engineers. Used by the map pin and the ride bottom sheet.
 *
 * The website never renders "OPERATING" through this helper — that
 * path uses the wait minutes — so the OPERATING branch is only used
 * in defensive code.
 */
export function statusLabel(status: ApiAttractionStatus): string {
  switch (status) {
    case "DOWN":
      return "Down";
    case "CLOSED":
      return "Closed";
    case "REFURBISHMENT":
      // "Refurb" was internal jargon; "In refurb" reads as a state
      // a guest would actually understand at a glance.
      return "In refurb";
    case "UNKNOWN":
      return "No data";
    case "OPERATING":
      return "Open";
  }
}

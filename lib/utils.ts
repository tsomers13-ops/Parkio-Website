import type { CrowdLevel, Park, Ride } from "./types";

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

/**
 * Deterministic-ish "live" wait time around the ride's base wait.
 * Used as a fallback when the live API is unreachable or for rides
 * that don't have an externalId.
 */
export function simulatedWait(ride: Ride, now: number = Date.now()): number {
  const seed = hashString(ride.id);
  const slice = Math.floor(now / 30_000);
  const noise = pseudoRandom(seed + slice);
  const swing = 18; // +/- minutes
  const offset = Math.round((noise - 0.5) * swing * 2);
  const adjusted = ride.baseWait + offset;
  return Math.max(5, Math.round(adjusted / 5) * 5);
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pseudoRandom(seed: number): number {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function formatTime(d: Date = new Date()): string {
  return d.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

/* ──────────── Live wait times (themeparks.wiki API) ──────────── */

interface LiveQueueEntry {
  id: string;
  status?: "OPERATING" | "DOWN" | "CLOSED" | "REFURBISHMENT";
  queue?: {
    STANDBY?: { waitTime: number | null };
  };
}

interface LiveResponse {
  liveData?: LiveQueueEntry[];
}

/**
 * Fetch live wait times for a single park from themeparks.wiki.
 * Returns a Map keyed by ride externalId.
 *
 * Falls back to an empty map on error so callers can keep showing
 * simulated waits without breaking.
 */
export async function fetchLiveWaits(
  park: Park,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  try {
    const res = await fetch(
      `https://api.themeparks.wiki/v1/entity/${park.externalId}/live`,
      { cache: "no-store" },
    );
    if (!res.ok) return result;
    const data = (await res.json()) as LiveResponse;
    for (const entry of data.liveData ?? []) {
      const wait = entry.queue?.STANDBY?.waitTime;
      if (typeof wait === "number" && entry.status === "OPERATING") {
        result.set(entry.id, wait);
      }
    }
  } catch {
    // Network or parsing error — silent fallback.
  }
  return result;
}

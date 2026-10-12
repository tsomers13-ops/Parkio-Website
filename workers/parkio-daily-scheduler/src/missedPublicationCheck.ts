/**
 * Read-only check: has today's Parkio Daily article actually gone live by
 * the fallback time? Mirrors the same signal scripts/parkio-daily/
 * checkAlreadyPublished.mjs already uses in the main pipeline (the live
 * RSS feed), re-implemented here as a plain HTTP check since this Worker
 * is a separate deployable with no access to that Node script. Never
 * writes anything; never touches production.
 */

import { getEasternWallClock, easternDateKey } from "./easternTime";

export interface MissedPublicationCheck {
  shouldAlert: boolean;
  reason: string;
}

/**
 * `feedXml` is the already-fetched body of https://parkio.info/feed.xml.
 * `expectedSlug` is the slug we expect for today, e.g.
 * "parkio-daily-2026-10-12" — callers build this from easternDateKey(now).
 */
export function checkMissedPublication(
  now: Date,
  feedXml: string,
  expectedSlug: string,
  fallbackHour: number,
  fallbackMinute: number
): MissedPublicationCheck {
  const clock = getEasternWallClock(now);
  const nowMinutes = clock.hour * 60 + clock.minute;
  const fallbackMinutes = fallbackHour * 60 + fallbackMinute;

  if (nowMinutes < fallbackMinutes) {
    return { shouldAlert: false, reason: "before fallback check time — too early to call it missed" };
  }

  if (feedXml.includes(expectedSlug)) {
    return { shouldAlert: false, reason: `feed already contains ${expectedSlug}` };
  }

  return {
    shouldAlert: true,
    reason: `fallback time (${pad(fallbackHour)}:${pad(fallbackMinute)} ET) has passed and ${expectedSlug} is not in the RSS feed`,
  };
}

export function expectedSlugFor(now: Date): string {
  return `parkio-daily-${easternDateKey(now)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

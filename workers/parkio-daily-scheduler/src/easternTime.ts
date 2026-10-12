/**
 * America/New_York wall-clock time, computed from a real IANA timezone
 * database lookup rather than a fixed UTC offset. This is what lets the
 * scheduler track the EDT/EST transition automatically: the same function
 * returns the correct local hour/minute on both sides of the spring-forward
 * and fall-back changeovers, with no seasonal manual edits anywhere.
 *
 * Cloudflare Workers' `Intl.DateTimeFormat` ships with full tz data, so
 * this works the same in production as it does here under plain Node/Vitest.
 */

export interface EasternWallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  /** UTC offset in whole hours during this instant: -4 (EDT) or -5 (EST). */
  utcOffsetHours: number;
}

const FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function getEasternWallClock(now: Date): EasternWallClock {
  const parts = FORMATTER.formatToParts(now);
  const get = (type: string) => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Intl.DateTimeFormat did not return a "${type}" part`);
    return Number(part.value);
  };

  // hour12: false renders local midnight as "24"; normalize to 0 so
  // downstream hour comparisons (e.g. === 6) behave correctly.
  const rawHour = get("hour");
  const hour = rawHour === 24 ? 0 : rawHour;

  const year = get("year");
  const month = get("month");
  const day = get("day");
  const minute = get("minute");

  // Derive the real instantaneous UTC offset by diffing the UTC and
  // Eastern wall-clock readings of the SAME instant, rather than hardcoding
  // DST date rules (which can legislatively change, as they have before).
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  let hourDiff = hour - utcHour;
  const minuteDiff = minute - utcMinute;
  // Wrap across local midnight in either direction.
  if (hourDiff > 12) hourDiff -= 24;
  if (hourDiff < -12) hourDiff += 24;
  // A same-direction minute rollover (e.g. hour diff -4, minute diff -1 from
  // a UTC-side minute rollover) never happens for whole-hour US tz offsets,
  // but guard it anyway rather than assume.
  const utcOffsetHours = minuteDiff === 0 ? hourDiff : Math.round(hourDiff + minuteDiff / 60);

  return { year, month, day, hour, minute, utcOffsetHours };
}

/**
 * True iff, at `now`, the real America/New_York wall clock reads exactly
 * `targetHour:targetMinute`. Each of the scheduler's two cron entries
 * (bracketing EDT and EST) calls this once per firing; on any given day,
 * only the entry whose UTC time matches the currently-active offset will
 * see this return true.
 */
export function isTargetEasternMinute(now: Date, targetHour: number, targetMinute: number): boolean {
  const clock = getEasternWallClock(now);
  return clock.hour === targetHour && clock.minute === targetMinute;
}

/** YYYY-MM-DD for the current Eastern calendar date — the natural dedupe key. */
export function easternDateKey(now: Date): string {
  const clock = getEasternWallClock(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${clock.year}-${pad(clock.month)}-${pad(clock.day)}`;
}

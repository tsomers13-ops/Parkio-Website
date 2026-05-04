/**
 * Helpers for the "Today" SEO landing pages.
 *
 * The pages target high-intent search queries like
 *   "magic kingdom wait times today"
 *   "disneyland wait times today"
 * — each one renders today's date prominently so the page genuinely
 * matches the query intent and Google can serve it as a fresh result.
 *
 * `getTodayLandingDate` returns BOTH a machine ISO ("2026-05-04") and
 * a human display string ("Monday, May 4, 2026"). All times are
 * pinned to America/New_York — the WDW timezone — so the displayed
 * date matches what guests at the parks are actually experiencing.
 *
 * The pages themselves are statically rendered. The displayed date
 * therefore reflects the date of the LAST BUILD; Cloudflare Pages
 * rebuilds nightly via the daily-briefing commit, so the date is
 * never more than a few hours stale. If a freshness-critical version
 * is needed later, switch the page to dynamic rendering or add a tiny
 * client-side date-formatting island.
 */

export interface TodayLandingDate {
  /** YYYY-MM-DD (Eastern time) */
  iso: string;
  /** "Monday, May 4, 2026" (Eastern time) */
  long: string;
}

export function getTodayLandingDate(now: Date = new Date()): TodayLandingDate {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const long = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(now);

  return { iso, long };
}

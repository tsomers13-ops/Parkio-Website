/**
 * /feed.xml — RSS 2.0 feed of Parkio Daily briefings.
 *
 * Beehiiv's RSS-to-Email automation polls this feed and sends a teaser
 * email when a new <item> appears. Content philosophy mirrors the email
 * rules in docs/AUTOMATION.md: teaser + 3 bullets + CTA back to the site.
 *
 * Built at build time (Cloudflare Pages rebuild fires on each daily commit),
 * so this is a fully static endpoint — no per-request compute.
 */

import { listDailyPosts, type DailyPost } from "@/lib/guideDaily";

const SITE_URL = "https://parkio.info";

export const dynamic = "force-static";
export const revalidate = false;

/**
 * Rolling freshness window — do not remove without a deliberate decision.
 *
 * Originally a fixed backlog cutoff date: the public feed was stale for
 * weeks while the site ran on Cloudflare Pages (auto-deploy broken), and
 * flipping it back on as-is would have replayed that whole backlog as
 * "new" emails the moment the RSS-to-Email poll next ran. A fixed cutoff
 * date only solves that ONCE, though — it does nothing to stop the same
 * class of problem recurring later. Confirmed 2026-10-17: a "Parkio Daily
 * — October 9" email was delivered October 17, most likely because an
 * app rebuild re-surfaced old Daily content files as newly eligible —
 * this is about that re-surfacing risk in general, not a confirmed claim
 * about what Buttondown itself did internally.
 *
 * Replaced with a rolling window: eligible iff a post's date is today or
 * yesterday by America/New_York CALENDAR date (the WDW timezone Daily
 * slugs are already authored in — see docs/AUTOMATION.md's "Operational
 * notes"). "Yesterday" deliberately tolerates exactly one missed 6 AM
 * Eastern publish without requiring a human to notice and republish
 * same-day; anything older — including a week-old file that becomes
 * newly readable to this route after an unrelated app rebuild — is never
 * eligible again, with no manual cutoff to remember to update. Guide
 * pages, sitemap, and the homepage teaser are unaffected — this only
 * trims RSS eligibility. See eligibleForFeed/feedFreshnessWindow below.
 */

/**
 * Today's and yesterday's date by America/New_York CALENDAR date, as
 * "YYYY-MM-DD" strings. Pure function of `now` (default: the real current
 * instant) rather than a bare `new Date()` call inline, so tests can pin
 * the instant exactly — including a UTC instant that falls on the PRIOR
 * Eastern calendar date (e.g. 02:00 UTC is still ~10 PM the previous day
 * in America/New_York).
 */
function feedFreshnessWindow(
  now: Date = new Date(),
): { today: string; yesterday: string } {
  // en-CA formats as YYYY-MM-DD directly; the IANA America/New_York
  // entry already encodes EDT/EST transitions, so this is correct
  // across a DST boundary with no date-math of our own.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  // Pure calendar-day subtraction on the already-resolved Eastern date
  // string — deliberately NOT `now` minus 24h, which would be wrong
  // exactly at a DST transition (a "day" is 23 or 25 real hours twice a
  // year). Date.UTC here is just a calendar calculator, not a timezone
  // conversion: today's Y/M/D components are already the correct Eastern
  // values, so subtracting one calendar day from them needs no timezone
  // awareness at all.
  const [y, m, d] = today.split("-").map(Number);
  const yesterdayDate = new Date(Date.UTC(y, m - 1, d));
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  const yesterday = yesterdayDate.toISOString().slice(0, 10);

  return { today, yesterday };
}

/* ─────────────── helpers ─────────────── */

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/* ─────────────── story shaping ───────────────
 * Email philosophy (see PARKIO_NEWSLETTER_STRATEGY.md): answer in the
 * email, deepen in the app. Every story carries its actionable
 * "what to do" line (parkioInsight) so the reader gets real value
 * without clicking — then the CTA sends them to Parkio's LIVE tool,
 * not a static article. No JSON-schema changes: we just render fields
 * (parkioInsight, rightNow) the old teaser ignored.
 */

type Insight = { category?: string; text?: string };
type NewsItem = {
  title?: string;
  parkSlug?: string;
  parkioInsight?: Insight;
};
type Ride = { name?: string; parkSlug?: string; note?: string };

const PARK_PATH: Record<string, string> = {
  "magic-kingdom": "magic-kingdom-wait-times-today",
  epcot: "epcot-wait-times-today",
  "hollywood-studios": "hollywood-studios-wait-times-today",
  "animal-kingdom": "animal-kingdom-wait-times-today",
  disneyland: "disneyland-wait-times-today",
  "california-adventure": "california-adventure-wait-times-today",
};

function parkLink(parkSlug?: string): string {
  const path = parkSlug && PARK_PATH[parkSlug];
  return path ? `${SITE_URL}/${path}` : `${SITE_URL}/wait-times-today`;
}

/** Top stories with their actionable insight, deduped, breaking first. */
function pickStories(post: DailyPost, max = 4): NewsItem[] {
  const sec = (post.sections ?? {}) as Record<string, NewsItem[]>;
  const ordered: NewsItem[] = [];
  for (const key of ["breaking", "bignews", "topstories"]) {
    const arr = sec[key];
    if (Array.isArray(arr)) ordered.push(...arr);
  }
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const item of ordered) {
    const title = item?.title?.trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length === max) break;
  }
  return out;
}

/* ─────────────── feed item ─────────────── */

function renderItem(post: DailyPost): string {
  const url = `${SITE_URL}/guide/${post.slug}`;

  // 1) Snapshot: "best rides right now" — the live-data hook that leads.
  const rides = (post.rightNow?.rides ?? []) as Ride[];
  const snapshotHtml = rides.length
    ? `<p style="margin:0 0 4px;font-weight:700">🏰 Best rides right now</p>` +
      `<ul style="margin:0 0 18px">${rides
        .slice(0, 3)
        .map(
          (r) =>
            `<li>${escapeXml(r.name || "")}${
              r.note ? ` — ${escapeXml(r.note)}` : ""
            }</li>`,
        )
        .join("")}</ul>`
    : "";

  // 2) Stories, each with its actionable "what to do" line + a deep link
  //    to that park's LIVE wait-times page (drives app/site usage).
  const stories = pickStories(post);
  const storiesHtml = stories
    .map((s) => {
      const tip = s.parkioInsight?.text?.trim();
      const tipHtml = tip
        ? `<p style="margin:2px 0 0;font-size:14px"><strong>What to do:</strong> ${escapeXml(
            tip,
          )}</p>`
        : "";
      const live = `<p style="margin:4px 0 0;font-size:13px"><a href="${parkLink(
        s.parkSlug,
      )}">See live waits →</a></p>`;
      return (
        `<div style="margin:0 0 18px">` +
        `<p style="margin:0;font-weight:700">${escapeXml(s.title || "")}</p>` +
        tipHtml +
        live +
        `</div>`
      );
    })
    .join("");

  const contentHtml = `
<p>${escapeXml(post.teaser)}</p>
${snapshotHtml}
${storiesHtml}
<p><a href="${url}">Read the full briefing on Parkio Daily →</a></p>
<p style="font-size:12.5px;color:#888;margin-top:20px;font-style:italic">Crowd patterns can change throughout the day. <a href="https://parkio.info/parks" style="color:#888">Open Parkio for live wait times.</a></p>
<p style="font-size:13px;color:#888;margin-top:8px">Parkio Daily — fresh every morning at 6 AM ET.</p>
  `.trim();

  // RSS pubDate must be RFC-822. Anchor each post at ~6 AM ET (10:00 UTC).
  const pubDate = new Date(`${post.date}T10:00:00Z`).toUTCString();

  return `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(post.teaser)}</description>
      <content:encoded><![CDATA[${contentHtml}]]></content:encoded>
    </item>`.trim();
}

/* ─────────────── feed shell ─────────────── */

/**
 * Posts eligible for RSS — today or yesterday by America/New_York
 * calendar date. See feedFreshnessWindow above and the comment block it
 * follows for the full rationale. `now` is injectable for the same
 * testability reason feedFreshnessWindow's is.
 */
function eligibleForFeed(
  posts: DailyPost[],
  now: Date = new Date(),
): DailyPost[] {
  const { today, yesterday } = feedFreshnessWindow(now);
  return posts.filter((post) => post.date === today || post.date === yesterday);
}

/**
 * Builds the full feed XML from an arbitrary post list and instant —
 * split out from GET() so tests can exercise real XML generation
 * (including strict-parser validation) without touching the filesystem
 * via listDailyPosts().
 */
function buildFeedXml(posts: DailyPost[], now: Date = new Date()): string {
  const items = eligibleForFeed(posts, now).map(renderItem).join("\n    ");
  const lastBuild = now.toUTCString();

  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Parkio Daily</title>
    <link>${SITE_URL}/guide</link>
    <description>Disney park briefings — fresh every morning at 6 AM ET.</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
    ${items}
  </channel>
</rss>`;
}

export function GET(): Response {
  const xml = buildFeedXml(listDailyPosts());

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      // Edge cache 5 min — Pages rebuilds on each commit anyway, so freshness is fine.
      "Cache-Control": "public, max-age=300, s-maxage=300"
    }
  });
}

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
              r.note ? ` &mdash; ${escapeXml(r.note)}` : ""
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
      )}">See live waits &rarr;</a></p>`;
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
<p><a href="${url}">Read the full briefing on Parkio Daily &rarr;</a></p>
<p style="font-size:12.5px;color:#888;margin-top:20px;font-style:italic">Crowd patterns can change throughout the day. <a href="https://parkio.info/parks" style="color:#888">Open Parkio for live wait times.</a></p>
<p style="font-size:13px;color:#888;margin-top:8px">Parkio Daily &mdash; fresh every morning at 6 AM ET.</p>
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

export function GET(): Response {
  const posts = listDailyPosts();
  const items = posts.map(renderItem).join("\n    ");
  const lastBuild = new Date().toUTCString();

  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Parkio Daily</title>
    <link>${SITE_URL}/guide</link>
    <description>Disney park briefings &mdash; fresh every morning at 6 AM ET.</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
    ${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      // Edge cache 5 min — Pages rebuilds on each commit anyway, so freshness is fine.
      "Cache-Control": "public, max-age=300, s-maxage=300"
    }
  });
}

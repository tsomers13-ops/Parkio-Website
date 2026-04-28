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

/** Same bullet-picking logic the n8n teaser builder uses. */
function pickBullets(post: DailyPost, max = 3): string[] {
  const sec = post.sections ?? {};
  const candidates: string[] = [];
  for (const arr of [sec.breaking, sec.bignews, sec.topstories]) {
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const title = (item as { title?: string })?.title;
      if (title) candidates.push(title);
    }
  }
  const seen = new Set<string>();
  const bullets: string[] = [];
  for (const t of candidates) {
    const key = t.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    bullets.push(t.trim());
    if (bullets.length === max) break;
  }
  return bullets;
}

/* ─────────────── feed item ─────────────── */

function renderItem(post: DailyPost): string {
  const url = `${SITE_URL}/guide/${post.slug}`;
  const bullets = pickBullets(post);
  const bulletsHtml = bullets.length
    ? `<ul>${bullets.map((b) => `<li>${escapeXml(b)}</li>`).join("")}</ul>`
    : "";

  const contentHtml = `
<p>${escapeXml(post.teaser)}</p>
${bulletsHtml}
<p><a href="${url}">Read the full briefing on Parkio Daily &rarr;</a></p>
<p style="font-size:12.5px;color:#888;margin-top:20px;font-style:italic">Crowd patterns can change throughout the day. <a href="https://parkio.info/parks" style="color:#888">Use Parkio for live updates.</a></p>
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

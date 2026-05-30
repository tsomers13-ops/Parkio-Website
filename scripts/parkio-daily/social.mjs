#!/usr/bin/env node
/**
 * Parkio Daily — social draft generator
 * ======================================
 *
 * Turns a daily briefing JSON (content/guide/daily/{slug}.json) into
 * ready-to-post social drafts and writes them to content/social/{slug}.md:
 *   • a 30-second Short / Reel / TikTok script
 *   • an X / Threads post (top 3 headlines)
 *   • an Instagram carousel + caption (top 5)
 *
 * Deterministic, dependency-free, and ZERO API cost — it only reformats
 * the copy Claude already wrote in the briefing. Safe to run right after
 * build.mjs (or any time, for back-fills). Falls back to an evergreen
 * "what to ride right now" script on quiet / fallback days.
 *
 * Usage:
 *   node scripts/parkio-daily/social.mjs                # today (America/New_York)
 *   node scripts/parkio-daily/social.mjs 2026-05-30     # a specific date
 *   node scripts/parkio-daily/social.mjs path/to.json   # an explicit briefing file
 *   node scripts/parkio-daily/social.mjs --selftest     # built-in sample, prints only
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const SITE = "parkio.info";

/* High-share signal keywords, ranked group-first (urgency > novelty > money > policy). */
const HOT = [
  ["closing", "closure", "closed", "temporarily clos", "last chance", "final"],
  ["new ", "opening", "opens", "debut", "coming to", "first look", "reveal", "announced"],
  ["price", "free", "discount", "increase", "cost", "deal"],
  ["banned", " ban", "rule", "warning", "change", "overhaul", "permit", "refurb"],
];

const PARK = {
  "magic-kingdom": { tag: "#MagicKingdom", emoji: "🏰" },
  epcot: { tag: "#EPCOT", emoji: "🌍" },
  "hollywood-studios": { tag: "#HollywoodStudios", emoji: "🎬" },
  "animal-kingdom": { tag: "#AnimalKingdom", emoji: "🦁" },
  disneyland: { tag: "#Disneyland", emoji: "🏰" },
  "california-adventure": { tag: "#DisneyCaliforniaAdventure", emoji: "🎡" },
};
const BASE_TAGS = ["#DisneyWorld", "#DisneyParks", "#Disney", "#ParkioDaily"];

/* ── helpers ─────────────────────────────────────────────────── */

function todaysDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function trim(str, max) {
  const s = String(str || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

function loadBriefing(arg) {
  if (arg && arg.endsWith(".json")) {
    const post = JSON.parse(readFileSync(arg, "utf8"));
    return { post, slug: post.slug || path.basename(arg, ".json") };
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(arg || "") ? arg : todaysDate();
  const slug = `parkio-daily-${date}`;
  const file = path.join("content", "guide", "daily", `${slug}.json`);
  return { post: JSON.parse(readFileSync(file, "utf8")), slug };
}

function allStories(post) {
  const s = post.sections || {};
  const tag = (arr, section) =>
    (Array.isArray(arr) ? arr : []).map((x) => ({ ...x, section }));
  return [
    ...tag(s.breaking, "breaking"),
    ...tag(s.bignews, "bignews"),
    ...tag(s.topstories, "topstories"),
    ...tag(s.spotlight, "spotlight"),
    ...tag(s.icymi, "icymi"),
  ].filter((x) => x && x.title);
}

function score(story) {
  const t = (story.title + " " + (story.body || "")).toLowerCase();
  let sc = { breaking: 5, bignews: 3, spotlight: 2, topstories: 1, icymi: 0 }[
    story.section
  ] || 0;
  HOT.forEach((group, i) => {
    if (group.some((k) => t.includes(k))) sc += 4 - i + 2;
  });
  return sc;
}

function angle(story) {
  const t = (story.title + " " + (story.body || "")).toLowerCase();
  if (HOT[0].some((k) => t.includes(k))) return "urgency";
  if (HOT[1].some((k) => t.includes(k))) return "novelty";
  if (HOT[2].some((k) => t.includes(k))) return "money";
  if (HOT[3].some((k) => t.includes(k))) return "policy";
  return "general";
}

function hook(story) {
  return {
    urgency: "Ride it before it's gone —",
    novelty: "This is coming to Disney —",
    money: "Disney pricing just changed —",
    policy: "Disney just changed the rules —",
    general: "Today at Disney —",
  }[angle(story)];
}

function hashtagsFor(story) {
  const p = PARK[story?.parkSlug];
  return [...BASE_TAGS, p ? p.tag : null].filter(Boolean).join(" ");
}

function isFallback(post) {
  const r = post.meta?.fallbackReason;
  if (r) return true;
  const big = post.sections?.bignews || [];
  return (
    (post.sections?.breaking || []).length === 0 &&
    big.length <= 1 &&
    big.some((b) => /no major updates/i.test(b.title || ""))
  );
}

/* ── builders ────────────────────────────────────────────────── */

function buildShort(top, fallback) {
  if (fallback || !top) {
    return [
      "HOOK (0–2s): Stop reloading the Disney app.",
      "BEAT (3–20s): Parkio shows live wait times and color-codes what to ride right now — green means go. While everyone's stuck at the headliners, these are the walk-ons.",
      "PAYOFF (20–30s): Free, no download. parkio.info.",
      "ON-SCREEN TEXT: GREEN = GO   |   parkio.info",
      `CAPTION: The fastest way to check Disney wait times. Free, no app needed. ${BASE_TAGS.join(" ")} #waittimes`,
    ].join("\n");
  }
  const a = angle(top);
  const cta =
    a === "general"
      ? "Get the Disney news that matters every morning in 30 seconds — Parkio Daily, free at parkio.info."
      : "We track every closure, opening, and change so you never miss it — Parkio Daily, free at parkio.info.";
  return [
    `HOOK (0–2s): ${hook(top)} ${trim(top.title, 90)}`,
    `BEAT (3–20s): ${trim(top.body, 240)}`,
    top.parkioInsight?.text ? `TIP (insert ~15s): ${trim(top.parkioInsight.text, 160)}` : null,
    `PAYOFF (20–30s): ${cta}`,
    `ON-SCREEN TEXT: ${trim(top.title, 60)}  |  parkio.info`,
    `CAPTION: ${trim(top.title, 120)} ${hashtagsFor(top)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildXPost(ranked, fallback) {
  if (fallback || ranked.length === 0) {
    return `Disney parks are running normal today — but waits still swing hour to hour.\nSee live wait times + what to ride right now, free: ${SITE}\n${BASE_TAGS.slice(0, 2).join(" ")}`;
  }
  const bullets = ranked
    .slice(0, 3)
    .map((s) => `• ${trim(s.title, 70)}`)
    .join("\n");
  const tags = [...new Set(ranked.slice(0, 3).map((s) => PARK[s.parkSlug]?.tag).filter(Boolean))];
  return `🏰 Today at Disney:\n${bullets}\nFull briefing → ${SITE}\n${["#DisneyWorld", ...tags].slice(0, 3).join(" ")}`;
}

function buildInstagram(post, ranked, fallback) {
  const date = post.date || todaysDate();
  if (fallback || ranked.length === 0) {
    return {
      slides: [
        `SLIDE 1 (cover): Today at Disney — ${date}`,
        "SLIDE 2: Quiet news day — parks operating normally.",
        "SLIDE 3: But wait times still swing. Check live + what to ride now → parkio.info",
      ].join("\n"),
      caption: `Calm day at the parks. Check live wait times and the best rides right now, free at parkio.info.\n\n${BASE_TAGS.join(" ")}`,
    };
  }
  const picks = ranked.slice(0, 5);
  const slides = [`SLIDE 1 (cover): Today at Disney — ${date}`];
  picks.forEach((s, i) => {
    const e = PARK[s.parkSlug]?.emoji || "📍";
    slides.push(`SLIDE ${i + 2}: ${e} ${trim(s.title, 70)}\n   ${trim(s.body, 150)}`);
  });
  slides.push(`SLIDE ${picks.length + 2} (CTA): Full briefing every morning → parkio.info`);
  const caption =
    `${trim(post.teaser || picks[0].title, 150)}\n\n` +
    `The Disney news that matters, every morning — free at parkio.info. Link in bio.\n\n` +
    `${[...new Set(picks.map((s) => PARK[s.parkSlug]?.tag).filter(Boolean))].join(" ")} ${BASE_TAGS.join(" ")}`;
  return { slides: slides.join("\n"), caption };
}

function buildMarkdown(post, slug, ranked) {
  const date = post.date || slug.replace("parkio-daily-", "");
  const fallback = isFallback(post);
  const top = ranked[0];
  const short = buildShort(top, fallback);
  const xpost = buildXPost(ranked, fallback);
  const ig = buildInstagram(post, ranked, fallback);

  const used = fallback
    ? "_Quiet/fallback day — used the evergreen 'what to ride right now' angle._"
    : ranked
        .slice(0, 5)
        .map((s) => `- [${s.section}] ${s.title}`)
        .join("\n");

  return `# Parkio social drafts — ${date}

_Generated from the daily briefing. Zero AI cost — just reformatted. Paste-and-post; trim or reorder to taste. Record the Short over a screen-recording of Parkio (green rides), or B-roll of the relevant ride/park._

## 1. Short / Reel / TikTok (post to all three)

\`\`\`
${short}
\`\`\`

## 2. X / Threads

\`\`\`
${xpost}
\`\`\`

## 3. Instagram — carousel + caption

**Carousel slides**
\`\`\`
${ig.slides}
\`\`\`

**Caption**
\`\`\`
${ig.caption}
\`\`\`

## Source stories used (top-ranked by shareability)

${used}

---
_Built by scripts/parkio-daily/social.mjs from content/guide/daily/${slug}.json._
`;
}

/* ── self-test sample ────────────────────────────────────────── */

const SAMPLE = {
  slug: "parkio-daily-sample",
  date: "2026-05-30",
  teaser: "A classic ride bows out soon, Banana Ball is coming, and a queue change hits Animal Kingdom.",
  sections: {
    breaking: [
      {
        title: "One of Disney World's oldest rides is closing temporarily in a few weeks",
        body: "Disney confirmed a temporary closure for refurbishment, with a reopening expected later in the year.",
        parkSlug: "magic-kingdom",
        parkioInsight: { category: "avoid-risk", text: "Ride it in the next two weeks; standby tends to spike once a closure date is public." },
      },
    ],
    bignews: [
      {
        title: "Banana Ball coming to Disney World in 2026",
        body: "The viral baseball spectacle is heading to Walt Disney World next year.",
        parkSlug: "epcot",
        parkioInsight: { category: "opportunity", text: "Tickets for novelty events usually move fast; watch for the on-sale date." },
      },
    ],
    topstories: [
      {
        title: "Bluey's Wild World at Animal Kingdom eliminating its virtual queue",
        body: "The attraction is switching to standby-only.",
        parkSlug: "animal-kingdom",
        parkioInsight: { category: "timing-advantage", text: "Without a virtual queue, early-morning is your best window before lines build." },
      },
    ],
    icymi: [],
    spotlight: [],
  },
  meta: {},
};

/* ── main ────────────────────────────────────────────────────── */

function main() {
  const arg = process.argv[2];
  let post, slug, selftest = false;

  if (arg === "--selftest") {
    selftest = true;
    post = SAMPLE;
    slug = SAMPLE.slug;
  } else {
    ({ post, slug } = loadBriefing(arg));
  }

  const ranked = [...allStories(post)].sort((a, b) => score(b) - score(a));
  const md = buildMarkdown(post, slug, ranked);

  console.log(
    `[parkio-social] ${slug}: ${ranked.length} stories, ` +
      `fallback=${isFallback(post)}, top="${ranked[0]?.title ?? "n/a"}"`,
  );

  if (selftest) {
    console.log("\n" + md);
    return;
  }

  const outDir = path.join("content", "social");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${slug}.md`);
  writeFileSync(outPath, md, "utf8");
  console.log(`[parkio-social] Wrote ${outPath}`);
}

main();

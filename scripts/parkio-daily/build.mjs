#!/usr/bin/env node
/**
 * Parkio Daily — build script
 * ===========================
 *
 * Runs once a day via GitHub Actions (.github/workflows/parkio-daily.yml).
 * Replaces the previous n8n workflow node-for-node, with the same retry,
 * fallback, and JSON-validation behavior — see `n8n/parkio-daily.json`
 * for the archived source-of-truth recipe.
 *
 * Pipeline (all sequential except where noted):
 *
 *   1.  Fetch Disney Parks Blog RSS (raw XML, text)
 *   2.  Fetch 5 additional Disney sources in parallel (WDWNT, AllEars,
 *       Disney Food Blog, Disney Tourist Blog, Inside the Magic) —
 *       failures per source are isolated
 *   3.  Fetch themeparks.wiki destinations summary
 *   4.  Fetch YouTube broad search (last 48h, 50 results)
 *   5.  Fetch 2 featured-channel searches (PagingMrMorrow,
 *       WrightDownMainStreet — last 7 days, 5 results each)
 *   6.  Merge + dedupe YouTube IDs (cap 50, featured-first priority)
 *   7.  Fetch YouTube video stats (videos.list, snippet+statistics)
 *   8.  Rank into the daily Top 10 (featured guaranteed; rest by views)
 *   9.  Build the Claude prompt (long template literal — see PROMPT())
 *  10.  Call Claude (claude-sonnet-4-5) with retry: 3 attempts, 30s
 *       between, 120s per-call timeout. Non-2xx and timeouts are
 *       retried; only after all attempts fail do we drop to fallback.
 *  11.  Validate + normalize Claude's JSON; on parse failure or
 *       schema violation, drop to fallback content
 *  12.  Write the JSON to content/guide/daily/{slug}.json
 *  13.  Log token usage + estimated cost for the run
 *
 * The GitHub Action that wraps this script handles the actual
 * `git commit + push` — no GitHub API call needed.
 *
 * Required environment variables:
 *   ANTHROPIC_API_KEY   — Anthropic console key (Repo Secret)
 *   YOUTUBE_API_KEY     — YouTube Data API v3 key  (Repo Secret)
 *
 * Run locally:
 *   ANTHROPIC_API_KEY=… YOUTUBE_API_KEY=… node scripts/parkio-daily/build.mjs
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* ──────────────────────────────────────────────────────────────
 * Tunables — keep mirrored with n8n/parkio-daily.json on changes
 * ────────────────────────────────────────────────────────────── */

const MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 6000;

const CLAUDE_RETRIES = 3;
const CLAUDE_WAIT_MS = 30_000;
const CLAUDE_TIMEOUT_MS = 120_000;

const SOURCE_TIMEOUT_MS = 30_000;
const PARKS_TIMEOUT_MS = 60_000;
const YOUTUBE_TIMEOUT_MS = 30_000;

/* Anthropic public pricing (per 1M tokens) — used for the per-run
 * cost log. Update if Anthropic changes pricing.                    */
const PRICE_INPUT_PER_M = 3.0;
const PRICE_OUTPUT_PER_M = 15.0;

const PARKIO_USER_AGENT =
  "Mozilla/5.0 (compatible; ParkioBot/1.0; +https://parkio.info)";

/* ──────────────────────────────────────────────────────────────
 * Entry point — only runs main() when invoked as a script, NOT on
 * import. Lets unit tests pull helpers out of this file without
 * firing the whole pipeline.
 * ────────────────────────────────────────────────────────────── */

const isMain =
  process.argv[1] && import.meta.url === pathToHref(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error("[parkio-daily] FATAL:", err?.stack || err?.message || err);
    process.exit(1);
  });
}

function pathToHref(p) {
  try {
    return new URL("file://" + path.resolve(p)).href;
  } catch {
    return "";
  }
}

// Export the deterministic helpers so a future test file (or an
// ad-hoc node -e) can exercise them without hitting the network.
export {
  todaysSlugAndDate,
  mergeYouTubeIds,
  rankTop10,
  stitchAdditionalSources,
  buildPrompt,
  buildPost,
};

async function main() {
  requireEnv(["ANTHROPIC_API_KEY", "YOUTUBE_API_KEY"]);

  const { etDate, slug, niceDate } = todaysSlugAndDate();
  console.log(`[parkio-daily] Building briefing for ${etDate} (slug: ${slug})`);

  // ── Sources ─────────────────────────────────────────────────
  const [parksBlogRss, additionalSources, parksDestinations] =
    await Promise.all([
      fetchParksBlogRss(),
      fetchAdditionalSources(),
      fetchThemeparksDestinations(),
    ]);

  // ── YouTube ─────────────────────────────────────────────────
  const [broadSearch, morrowSearch, wrightSearch] = await Promise.all([
    fetchYouTubeBroad(),
    fetchYouTubeFeatured("UCscn2aSpMrS2U_mf7OF-UwQ"),
    fetchYouTubeFeatured("UCCE7kTsZ1icykc8hazTRNjg"),
  ]);
  const { ids, featuredMeta } = mergeYouTubeIds(
    broadSearch.items,
    morrowSearch.items,
    wrightSearch.items,
  );
  const videoStats = ids.length > 0 ? await fetchYouTubeStats(ids) : { items: [] };
  const rankedVideos = rankTop10(videoStats.items, featuredMeta);
  console.log(
    `[parkio-daily] YouTube: ${broadSearch.items.length} broad + ` +
      `${morrowSearch.items.length} Morrow + ${wrightSearch.items.length} Wright ` +
      `→ ${ids.length} unique → ${rankedVideos.length} top-10 picks`,
  );

  // ── Claude ──────────────────────────────────────────────────
  const prompt = buildPrompt({
    etDate,
    slug,
    rssText: stringSlice(parksBlogRss, 25_000),
    additionalText: stitchAdditionalSources(additionalSources),
    parksJson: JSON.stringify(parksDestinations).slice(0, 4_000),
    videosJson: JSON.stringify(rankedVideos),
  });
  const claudeBody = JSON.stringify({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  });
  const claudeResult = await callClaudeWithRetry(claudeBody);

  // ── Validate + format ──────────────────────────────────────
  const post = buildPost({
    claudeResult,
    etDate,
    slug,
    niceDate,
    rankedVideos,
  });

  // ── Write to disk ──────────────────────────────────────────
  const outDir = path.join("content", "guide", "daily");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${slug}.json`);
  writeFileSync(outPath, JSON.stringify(post, null, 2) + "\n", "utf8");
  console.log(`[parkio-daily] Wrote ${outPath}`);

  // ── Cost log ───────────────────────────────────────────────
  if (claudeResult?.usage) {
    logCost(claudeResult.usage);
  }

  // ── Exit ───────────────────────────────────────────────────
  if (post.meta?.fallbackReason) {
    console.warn(
      `[parkio-daily] DONE (fallback: ${post.meta.fallbackReason})`,
    );
  } else {
    console.log("[parkio-daily] DONE");
  }
}

/* ──────────────────────────────────────────────────────────────
 * Date / slug helpers
 * ────────────────────────────────────────────────────────────── */

function todaysSlugAndDate() {
  const now = new Date();
  // YYYY-MM-DD in America/New_York (handles EDT/EST transitions)
  const etDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const slug = `parkio-daily-${etDate}`;
  const niceDate = new Date(etDate + "T00:00:00Z").toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return { etDate, slug, niceDate };
}

/* ──────────────────────────────────────────────────────────────
 * RSS + themeparks.wiki + additional sources
 * ────────────────────────────────────────────────────────────── */

async function fetchParksBlogRss() {
  return await getText("https://disneyparksblog.com/feed/", {
    headers: {
      "User-Agent": PARKIO_USER_AGENT,
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    },
    timeoutMs: PARKS_TIMEOUT_MS,
  });
}

async function fetchAdditionalSources() {
  const SOURCES = [
    { name: "WDWNT", url: "https://wdwnt.com/feed/" },
    { name: "AllEars.Net", url: "https://allears.net/feed/" },
    { name: "Disney Food Blog", url: "https://www.disneyfoodblog.com/feed/" },
    { name: "Disney Tourist Blog", url: "https://www.disneytouristblog.com/feed/" },
    { name: "Inside the Magic", url: "https://insidethemagic.net/feed/" },
  ];
  const headers = {
    "User-Agent": PARKIO_USER_AGENT,
    Accept: "application/rss+xml, application/xml, text/xml, */*",
  };
  // Isolated failures — one slow blog cannot take down the run.
  return await Promise.all(
    SOURCES.map(async (src) => {
      try {
        const xml = await getText(src.url, {
          headers,
          timeoutMs: SOURCE_TIMEOUT_MS,
        });
        return {
          name: src.name,
          ok: true,
          bytes: xml.length,
          xml: xml.slice(0, 8_000),
        };
      } catch (err) {
        return {
          name: src.name,
          ok: false,
          err: String(err?.message || err).slice(0, 200),
        };
      }
    }),
  );
}

async function fetchThemeparksDestinations() {
  return await getJson("https://api.themeparks.wiki/v1/destinations", {
    headers: { "User-Agent": PARKIO_USER_AGENT },
    timeoutMs: PARKS_TIMEOUT_MS,
  });
}

function stitchAdditionalSources(sources) {
  // Mirror the n8n shape Claude was already prompted against:
  // `=== name ===\n{xml}` blocks separated by `\n\n---\n\n`.
  return sources
    .map((s) =>
      s.ok
        ? `=== ${s.name} ===\n${s.xml}`
        : `=== ${s.name} ===\n[unavailable: ${s.err || "unknown error"}]`,
    )
    .join("\n\n---\n\n");
}

/* ──────────────────────────────────────────────────────────────
 * YouTube
 * ────────────────────────────────────────────────────────────── */

function fetchYouTubeBroad() {
  const publishedAfter = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  return getJson(
    "https://www.googleapis.com/youtube/v3/search?" +
      new URLSearchParams({
        part: "snippet",
        q:
          'disney parks OR disneyland OR "walt disney world" OR ' +
          '"magic kingdom" OR epcot OR "hollywood studios" OR "animal kingdom"',
        type: "video",
        publishedAfter,
        maxResults: "50",
        order: "date",
        relevanceLanguage: "en",
        regionCode: "US",
        safeSearch: "moderate",
        videoEmbeddable: "true",
        key: process.env.YOUTUBE_API_KEY,
      }).toString(),
    { timeoutMs: YOUTUBE_TIMEOUT_MS },
  );
}

function fetchYouTubeFeatured(channelId) {
  const publishedAfter = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  return getJson(
    "https://www.googleapis.com/youtube/v3/search?" +
      new URLSearchParams({
        part: "snippet",
        type: "video",
        channelId,
        publishedAfter,
        maxResults: "5",
        order: "date",
        videoEmbeddable: "true",
        key: process.env.YOUTUBE_API_KEY,
      }).toString(),
    { timeoutMs: YOUTUBE_TIMEOUT_MS },
  );
}

function fetchYouTubeStats(ids) {
  return getJson(
    "https://www.googleapis.com/youtube/v3/videos?" +
      new URLSearchParams({
        part: "snippet,statistics",
        id: ids.join(","),
        key: process.env.YOUTUBE_API_KEY,
      }).toString(),
    { timeoutMs: YOUTUBE_TIMEOUT_MS },
  );
}

function mergeYouTubeIds(broad, morrow, wright) {
  // Tagged source so we know which channel a video came from. Dedupe
  // by videoId, preferring the 'featured' tag if it appears in both
  // sets. Cap at 50 (YouTube videos.list per-request limit).
  const tagged = [];
  for (const v of broad ?? []) {
    if (v?.id?.videoId) tagged.push({ id: v.id.videoId, source: "broad" });
  }
  for (const v of morrow ?? []) {
    if (v?.id?.videoId) {
      tagged.push({
        id: v.id.videoId,
        source: "featured",
        channelHandle: "PagingMrMorrow",
      });
    }
  }
  for (const v of wright ?? []) {
    if (v?.id?.videoId) {
      tagged.push({
        id: v.id.videoId,
        source: "featured",
        channelHandle: "wrightdownmainstreet",
      });
    }
  }

  const map = new Map();
  for (const t of tagged) {
    const existing = map.get(t.id);
    if (!existing || existing.source !== "featured") map.set(t.id, t);
  }
  const all = [...map.values()];
  const featured = all.filter((t) => t.source === "featured");
  const broadOnly = all.filter((t) => t.source === "broad");
  const capped = [...featured, ...broadOnly].slice(0, 50);

  const ids = capped.map((t) => t.id);
  const featuredMeta = {};
  for (const t of capped) {
    if (t.source === "featured") {
      featuredMeta[t.id] = { channelHandle: t.channelHandle };
    }
  }
  return { ids, featuredMeta };
}

function rankTop10(items, featuredMeta) {
  const all = (items ?? [])
    .filter((v) => v && v.id && v.statistics && v.statistics.viewCount)
    .map((v) => {
      const thumbs = v.snippet?.thumbnails || {};
      const thumb = thumbs.medium || thumbs.high || thumbs.default || {};
      const fm = featuredMeta[v.id];
      return {
        videoId: v.id,
        title: v.snippet?.title || "",
        channel: v.snippet?.channelTitle || "",
        publishedAt: v.snippet?.publishedAt || "",
        thumbnailUrl: thumb.url || "",
        viewCount: parseInt(v.statistics.viewCount, 10) || 0,
        url: `https://www.youtube.com/watch?v=${v.id}`,
        featuredHandle: fm?.channelHandle || null,
      };
    })
    .filter((v) => v.title && v.channel);

  // Reserve one slot per featured channel — most recent upload.
  const FEATURED_HANDLES = ["PagingMrMorrow", "wrightdownmainstreet"];
  const featuredPicks = [];
  for (const handle of FEATURED_HANDLES) {
    const fromChannel = all
      .filter((v) => v.featuredHandle === handle)
      .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
    if (fromChannel.length > 0) featuredPicks.push(fromChannel[0]);
  }
  const featuredIds = new Set(featuredPicks.map((v) => v.videoId));
  const fillers = all
    .filter((v) => !featuredIds.has(v.videoId))
    .sort((a, b) => b.viewCount - a.viewCount);
  const slotsLeft = Math.max(0, 10 - featuredPicks.length);
  const combined = [...featuredPicks, ...fillers.slice(0, slotsLeft)];
  combined.sort((a, b) => b.viewCount - a.viewCount);

  // Strip the featuredHandle helper field — keep the schema clean.
  return combined.slice(0, 10).map(({ featuredHandle, ...keep }) => keep);
}

/* ──────────────────────────────────────────────────────────────
 * Claude prompt template
 * ────────────────────────────────────────────────────────────── */

function buildPrompt({
  etDate,
  slug,
  rssText,
  additionalText,
  parksJson,
  videosJson,
}) {
  return `You are writing the Parkio Daily briefing for ${etDate}.

Parkio Daily is a fast, trusted morning briefing for Disney park guests. It is NOT a blog. It feels like a quick read that helps a guest plan their park day. Every word is yours — no copy/paste from sources, no paraphrased blog posts.

Output ONE JSON object — no commentary, no markdown fences — that conforms exactly to the schema below.

GUARDRAILS — read carefully, follow strictly:
1. ORIGINAL LANGUAGE ONLY. Do NOT copy any phrasing from the source feeds. Do NOT paraphrase entire articles. Each story must be summarized in 1–2 sentences using ENTIRELY ORIGINAL language. The Parkio voice is fast, plain, direct. If you find yourself echoing source phrasing, rewrite.
2. COMBINE DUPLICATES. If multiple sources cover the same story (e.g., WDWNT, AllEars, and Inside the Magic all covering one announcement), merge into ONE summary item. Never list the same story twice.
3. NO INVENTION. Every factual claim — names, dates, closures, openings, prices — MUST be supported by AT LEAST ONE source feed below or by themeparks.wiki status. If you cannot ground a claim, drop the item. Do not speculate.
4. NO-NEWS FALLBACK. If overall source data is weak (no real news today), respond with a single bignews item titled "No major updates today" and a short body noting the parks are operating normally. Set sections.breaking and sections.icymi to [].
5. PREFER FEWER, HIGHER-QUALITY STORIES. It is better to ship 4 strong items than 10 weak ones. If you can only ground 3 stories, ship 3 — do not pad with speculation or filler. Quality over volume.
6. TOPIC DIVERSITY — strict. Each item across ALL sections (breaking + bignews + topstories + icymi + spotlight) must cover a DISTINCT story. Aim for breadth — different parks, different categories (attractions, food, merchandise, entertainment, transportation, characters, news), different angles. A reader should never feel like they're reading the same story rephrased twice.
7. PARKIO INSIGHT — REQUIRED for every item in breaking, bignews, topstories, and spotlight. This is the Parkio differentiator. The field is an OBJECT with two keys:
   {
     "category": one of EXACTLY: "crowd-impact" | "timing-advantage" | "opportunity" | "avoid-risk",
     "text": 1–2 sentences, clear and actionable, guest-focused
   }
   Categories — pick the SINGLE best fit:
     • "crowd-impact"     — heavier waits, traffic, congestion likely from this story
     • "timing-advantage" — a window where the guest gets a clear edge (early entry, off-peak, etc.)
     • "opportunity"      — something new to seek out (food, merch, character meet)
     • "avoid-risk"       — a reason to skip, reroute, or expect disappointment
   SOFT LANGUAGE — never absolute. Use probabilistic phrasing: "likely", "usually", "tends to", "may", "often". Do NOT promise outcomes ("will", "guaranteed", "definitely"). Crowd patterns vary hour-to-hour; the insight is guidance, not a forecast.
   Tell the guest what to DO next ("Ride X early", "Skip Tomorrowland after lunch", "Grab the new merch before noon") — do NOT just restate the story.
   Examples (good):
     - { "category": "crowd-impact",     "text": "Tomorrowland tends to fill up by 11am with the new attraction open. Riding TRON or Space Mountain in the first hour usually keeps waits under 20 minutes." }
     - { "category": "timing-advantage", "text": "EPCOT's festival crowds usually thin during the dinner hour. Walk-on windows for Soarin' often open between 6–7pm." }
     - { "category": "opportunity",      "text": "The new Toy Story merchandise is likely to sell out fast at flagship locations. Worth a stop at Once Upon a Toy in Disney Springs early today." }
     - { "category": "avoid-risk",       "text": "Hollywood Studios construction noise tends to be loudest mid-morning near Sunset Boulevard. Plan dining or relaxation breaks elsewhere until after 1pm." }
   Examples (BAD — do not write):
     - "Expect crowds." (too short, generic)
     - "TRON wait times will hit 90 minutes today." (absolute prediction)
     - "This is exciting news." (not actionable)
     - "Wait times are increasing." (just restates the story)
   Do NOT include parkioInsight on icymi items (those are recap-only).
8. TONE. Fast. Clear. Actionable. Sounds like a daily briefing a smart friend would text you, not a press release. Short sentences. No clickbait. No emojis. No exclamation points.
9. VIDEO SUMMARIES are 1–2 sentences and based ONLY on the video's title + channel. Do not invent details about what's inside the video.
10. EXACT VIDEOS. Use the EXACT 10 videos provided in TOP 10 YOUTUBE VIDEOS — copy each field verbatim and ADD a "summary" field per video.
11. NO BREAKING-NEWS UNLESS SOURCED. Every breaking-news item must be supported by the source data. If nothing is genuinely breaking, set sections.breaking to [].

SCHEMA (produce this object):
{
  "title": string,
  "slug": string (must equal "${slug}"),
  "date": string (must equal "${etDate}"),
  "teaser": string (1–2 sentences, ≤160 chars; SEO + email teaser; no source phrasing),
  "rightNow": {
    "headline": "Best rides right now",
    "rides": [ { "name": string, "parkSlug": string, "note": string } ]   // 2–3 items
  },
  "sections": {
    "breaking":   [ { "title", "body", "parkSlug?", "source?": { "label", "url" }, "parkioInsight": { "category", "text" } } ],   // 0–2
    "bignews":    [ { ...same shape with parkioInsight object } ],                                                                  // 1–3
    "topstories": [ { ...same shape with parkioInsight object } ],                                                                  // 2–4
    "icymi":      [ { "title", "body", "parkSlug?", "source?": { "label", "url" } } ],                                              // 1–3, NO parkioInsight
    "spotlight":  [ { "title", "body", "parkSlug?", "ctaLabel?", "parkioInsight": { "category", "text" } } ]                        // exactly 1
  },
  "videos": [
    { "title", "channel", "url", "thumbnailUrl", "videoId", "viewCount", "publishedAt", "summary" }
  ]
}

parkSlug enum: magic-kingdom | epcot | hollywood-studios | animal-kingdom | disneyland | california-adventure.

RESEARCH — Disney Parks Blog RSS (official):
${rssText}

RESEARCH — Additional Disney sources (community blogs, RSS feeds):
${additionalText}

RESEARCH — themeparks.wiki destinations summary (live park status):
${parksJson}

TOP 10 YOUTUBE VIDEOS (last 48h, ranked by views — copy verbatim into "videos", add a 1–2 sentence "summary" for each):
${videosJson}

Return the JSON object only.`;
}

/* ──────────────────────────────────────────────────────────────
 * Claude API call (with retry)
 * ────────────────────────────────────────────────────────────── */

async function callClaudeWithRetry(body) {
  for (let attempt = 1; attempt <= CLAUDE_RETRIES; attempt++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
        },
        body,
        signal: AbortSignal.timeout(CLAUDE_TIMEOUT_MS),
      });
      if (res.ok) {
        return await res.json();
      }
      // Capture Anthropic's error body so callers can surface details.
      let errBody = null;
      try {
        errBody = await res.json();
      } catch {
        try {
          errBody = { message: (await res.text()).slice(0, 500) };
        } catch {
          errBody = null;
        }
      }
      const detail =
        errBody?.error?.message ||
        errBody?.message ||
        errBody?.error?.type ||
        `HTTP ${res.status}`;
      console.warn(
        `[parkio-daily] Claude attempt ${attempt}/${CLAUDE_RETRIES} failed: ${res.status} ${detail}`,
      );
      // Retry on 5xx + 429 (transient). 4xx other than 429 = configuration
      // problem (bad key, invalid model, malformed body) — won't help to retry.
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable) {
        return {
          parkioFailure: true,
          statusCode: res.status,
          error: errBody?.error || { message: detail },
        };
      }
    } catch (err) {
      console.warn(
        `[parkio-daily] Claude attempt ${attempt}/${CLAUDE_RETRIES} threw: ${
          err?.message || err
        }`,
      );
    }
    if (attempt < CLAUDE_RETRIES) await sleep(CLAUDE_WAIT_MS);
  }
  return {
    parkioFailure: true,
    statusCode: null,
    error: { message: "all-retries-exhausted" },
  };
}

/* ──────────────────────────────────────────────────────────────
 * Validate + format JSON (matches the n8n Validate node behavior)
 * ────────────────────────────────────────────────────────────── */

const VALID_PARKS = [
  "magic-kingdom",
  "epcot",
  "hollywood-studios",
  "animal-kingdom",
  "disneyland",
  "california-adventure",
];

function buildPost({ claudeResult, etDate, slug, niceDate, rankedVideos }) {
  const hadFailure =
    !claudeResult ||
    claudeResult.parkioFailure ||
    claudeResult.type === "error" ||
    (typeof claudeResult.statusCode === "number" &&
      claudeResult.statusCode >= 400);
  const rawText = claudeResult?.content?.[0]?.text ?? "";

  // Fallback path — same minimal-but-valid DailyPost shape the n8n
  // validate node produces. Videos pass through from the upstream rank
  // step so the rail still has content.
  function fallbackPost(reason, detail) {
    return {
      title: `Parkio Daily — ${niceDate}`,
      slug,
      date: etDate,
      teaser:
        "No major Disney parks updates today. Operations look normal — check Parkio for live wait times.",
      rightNow: { headline: "Best rides right now", rides: [] },
      sections: {
        breaking: [],
        bignews: [
          {
            title: "No major updates today",
            body: "No major updates found today. Check live park data in Parkio.",
            parkioInsight: {
              category: "opportunity",
              text: "Quiet news days often mean shorter standby waits at headliners. Check live waits in Parkio and pick a high-priority ride to start with.",
            },
          },
        ],
        topstories: [],
        icymi: [],
        spotlight: [],
      },
      videos: (rankedVideos ?? []).map((v) => ({ ...v, summary: v.title || "" })),
      meta: {
        aiGenerated: false,
        fallbackReason: reason,
        fallbackDetail: detail || null,
        sources: ["fallback"],
      },
    };
  }

  let post;
  let usedFallback = false;
  let fallbackReason = null;

  if (hadFailure || !rawText) {
    usedFallback = true;
    fallbackReason = "claude-failure";
    const detail =
      claudeResult?.error?.message ||
      claudeResult?.error?.type ||
      claudeResult?.message ||
      (typeof claudeResult?.statusCode === "number"
        ? `HTTP ${claudeResult.statusCode}`
        : "no-response");
    post = fallbackPost(fallbackReason, detail);
  } else {
    // Strip any accidental markdown fence
    const jsonStr = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    try {
      post = JSON.parse(jsonStr);
    } catch (e) {
      // Non-JSON output — fall back rather than throw, so the morning
      // still publishes something.
      usedFallback = true;
      fallbackReason = "json-parse-failure";
      post = fallbackPost(fallbackReason, e.message);
    }
  }

  if (!usedFallback) {
    // Required top-level fields — these throw because they indicate a
    // schema/prompt bug, not a transient failure. Failing the workflow
    // surface-level lets us notice in the GitHub Actions run.
    const required = ["title", "slug", "date", "teaser"];
    for (const k of required) {
      if (!post[k] || typeof post[k] !== "string") {
        throw new Error(`Missing required field: ${k}`);
      }
    }
    if (!/^parkio-daily-\d{4}-\d{2}-\d{2}$/.test(post.slug)) {
      throw new Error(`Slug doesn't match parkio-daily-YYYY-MM-DD: ${post.slug}`);
    }
    if (post.teaser.length > 220) {
      throw new Error(`Teaser too long (${post.teaser.length} chars)`);
    }
    for (const sec of Object.values(post.sections ?? {})) {
      if (!Array.isArray(sec)) continue;
      for (const item of sec) {
        if (item.parkSlug && !VALID_PARKS.includes(item.parkSlug)) {
          throw new Error(`Invalid parkSlug: ${item.parkSlug}`);
        }
      }
    }
    for (const ride of post.rightNow?.rides ?? []) {
      if (ride.parkSlug && !VALID_PARKS.includes(ride.parkSlug)) {
        throw new Error(`Invalid rightNow parkSlug: ${ride.parkSlug}`);
      }
    }
    if (!Array.isArray(post.videos)) {
      throw new Error("post.videos must be an array");
    }
    if (post.videos.length > 10) post.videos = post.videos.slice(0, 10);
    for (const v of post.videos) {
      for (const k of ["title", "channel", "url", "summary"]) {
        if (!v[k] || typeof v[k] !== "string") {
          throw new Error(`Video missing field: ${k}`);
        }
      }
      if (
        typeof v.viewCount !== "undefined" &&
        typeof v.viewCount !== "number"
      ) {
        v.viewCount = parseInt(v.viewCount, 10) || 0;
      }
    }
  }

  // Auto-attach internal metadata so the website renders the AI badge
  post.updatedAt = new Date().toISOString();
  post.type = "daily-briefing";
  post.meta = Object.assign(
    {
      aiGenerated: !usedFallback,
      sources: [
        "Disney Parks Blog RSS",
        "themeparks.wiki destinations",
        "YouTube Data API v3 (top 10 last 48h)",
      ],
      generatedAt: new Date().toISOString(),
    },
    post.meta || {},
  );
  if (usedFallback) post.meta.fallbackReason = fallbackReason;

  // Detect Claude's own "no-news" fallback
  if (!usedFallback) {
    const breaking = post.sections?.breaking ?? [];
    const big = post.sections?.bignews ?? [];
    if (
      breaking.length === 0 &&
      big.some((b) => /no major updates/i.test(b.title))
    ) {
      post.meta.fallbackReason = "no-news";
    }
  }

  // Per-run token usage — preserved on the post so cost can be tracked
  // historically via a grep across content/guide/daily.
  if (claudeResult?.usage) {
    post.meta.tokens = {
      input: claudeResult.usage.input_tokens,
      output: claudeResult.usage.output_tokens,
      costUsd: Number(
        (
          (claudeResult.usage.input_tokens * PRICE_INPUT_PER_M +
            claudeResult.usage.output_tokens * PRICE_OUTPUT_PER_M) /
          1_000_000
        ).toFixed(4),
      ),
    };
  }

  return post;
}

/* ──────────────────────────────────────────────────────────────
 * Helpers — fetch wrappers, env, sleep, cost log
 * ────────────────────────────────────────────────────────────── */

async function getText(url, { headers = {}, timeoutMs = 30_000 } = {}) {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return await res.text();
}

async function getJson(url, { headers = {}, timeoutMs = 30_000 } = {}) {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`${url} → HTTP ${res.status}: ${detail}`);
  }
  return await res.json();
}

function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stringSlice(maybeStr, max) {
  return typeof maybeStr === "string"
    ? maybeStr.slice(0, max)
    : JSON.stringify(maybeStr).slice(0, max);
}

function logCost(usage) {
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cost =
    (input * PRICE_INPUT_PER_M + output * PRICE_OUTPUT_PER_M) / 1_000_000;
  console.log(
    `[parkio-daily] Claude usage: ${input} input + ${output} output tokens ≈ $${cost.toFixed(
      4,
    )}`,
  );
}

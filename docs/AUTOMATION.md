# Parkio Daily — Automation setup

Runbook for n8n + GitHub + Cloudflare + Beehiiv. The website code is
already in place; this doc explains how the daily-content pipeline
hooks in.

> **Live workflow:** https://parkio.app.n8n.cloud/workflow/XWPcRzW8r2chhoRt
> **Source-of-truth JSON:** [`n8n/parkio-daily.json`](../n8n/parkio-daily.json) — re-import to restore.

## Architecture

```
6 AM ET ─► n8n
            │
            ├─► Disney Parks Blog RSS
            ├─► themeparks.wiki destinations
            ├─► YouTube Data API v3 (search → stats → rank top 10)
            │
            ▼
        Build research context (Code)
            │
            ▼
        Compose with Claude (claude-sonnet-4-5, with guardrails)
            │
            ▼
        Validate + format JSON (schema check, attach AI metadata)
            │
            ▼
        Commit to GitHub  ─►  Cloudflare Pages auto-rebuild  ─►  /guide/{slug} live
            │
            ▼
        Wait 90s
            │
            ▼
        Build email teaser (Code, teaser-only HTML)
            │
            ▼
        Beehiiv — Create Post (DRAFT)  ◄─ disabled until API key exists
```

The website post is the **canonical** copy. The Beehiiv email is a
**teaser only** — subject + 2–3 bullets + a link back to the website.
Email recipients click through and land on a page with conversion
blocks that funnel them into Parkio.

## Email rules — strict

The email MUST NOT contain the full briefing or any YouTube content.
The `Build email teaser` Code node enforces this contract:

```
Subject:       {post.title}
Subtitle:      {post.teaser}
Preview text:  first ~100 chars of post.teaser (truncated with …)
Body:          <p>{post.teaser}</p>
               <ul>
                 <li>{breaking[0].title || bignews[0].title}</li>
                 <li>{bignews[0].title  || topstories[0].title}</li>
                 <li>{topstories[0].title || topstories[1].title}</li>
               </ul>
               <a href="https://parkio.info/guide/{slug}">Read the full briefing →</a>
               (small footer with "Open Parkio" + "Check live waits" links)
```

Bullets are deduped against each other. **No section bodies. No
videos. No CTA copy.** The website is where conversion happens.

Why: the website post has the Right Now hero + nine conversion
surfaces. Email subscribers who get the full content in their inbox
never visit the site, never see those funnels, never download the
app. That defeats the whole point.

## YouTube section — Top 10 by views (last 48h)

How it works:

1. **YouTube — Search recent (48h)** — `youtube/v3/search` with
   `publishedAfter = now - 48h`, `order=date`, `maxResults=50`,
   `regionCode=US`, `safeSearch=moderate`, `videoEmbeddable=true`.
   Query targets Disney/theme-park keywords.
2. **YouTube — Get video stats** — `youtube/v3/videos` for the IDs
   from step 1, requesting `snippet,statistics`.
3. **Rank Top 10 by views** (Code node) — sorts by `viewCount`
   descending, drops anything missing a title or channel, keeps 10.
4. The ranked array (with `videoId`, `title`, `channel`,
   `publishedAt`, `thumbnailUrl`, `viewCount`, `url`) is passed to
   the LLM, which **must copy each video verbatim** and add a 1–2
   sentence editorial `summary` based only on title + channel.

Quota: search costs 100 units, videos.list ~1 unit per video. Daily
free quota is 10,000, so this run uses ~150 units — well under.

## Content file location and naming

Each daily briefing is **one JSON file**:

```
content/guide/daily/parkio-daily-YYYY-MM-DD.json
```

Slug rule: `parkio-daily-` + ISO date in **Eastern Time** (the
WDW timezone). Example: `parkio-daily-2026-04-26.json`. The slug
is the URL path: `parkio.info/guide/parkio-daily-2026-04-26`.

## JSON schema (n8n contract)

The TypeScript types live in `lib/guideDaily.ts`. n8n must produce:

```jsonc
{
  "title":   "Parkio Daily — April 26, 2026",
  "slug":    "parkio-daily-2026-04-26",
  "date":    "2026-04-26",
  "teaser":  "1–2 sentences. SEO meta + email teaser. Under ~160 chars.",
  "updatedAt": "2026-04-26T06:00:00-04:00",
  "type":    "daily-briefing",

  "rightNow": {
    "headline": "Best rides right now",
    "rides": [
      { "name": "TRON Lightcycle / Run", "parkSlug": "magic-kingdom",   "note": "Just reopened" },
      { "name": "Soarin'",               "parkSlug": "epcot",           "note": "Walk-on now" },
      { "name": "Tower of Terror",       "parkSlug": "hollywood-studios", "note": "Late-afternoon dip" }
    ]
  },

  "sections": {
    "breaking": [
      {
        "title":    "Headline",
        "body":     "Plain-text body. No markdown.",
        "parkSlug": "magic-kingdom",
        "source":   { "label": "Disney Parks Blog", "url": "https://..." }
      }
    ],
    "bignews":    [ /* same shape as breaking */ ],
    "topstories": [ /* same shape as breaking */ ],
    "icymi":      [ /* same shape as breaking */ ],
    "spotlight":  [
      {
        "title":     "Spotlight headline",
        "body":      "Long-form paragraph.",
        "parkSlug":  "epcot",
        "ctaLabel":  "Open EPCOT on Parkio"
      }
    ]
  },

  "videos": [
    {
      "title":        "Video title",
      "channel":      "Channel name",
      "url":          "https://www.youtube.com/watch?v=...",
      "thumbnailUrl": "https://i.ytimg.com/.../mqdefault.jpg",
      "videoId":      "abc123",
      "viewCount":    482917,
      "publishedAt":  "2026-04-25T14:30:00Z",
      "summary":      "1–2 sentence editorial blurb based on the title + channel."
    }
  ],

  "meta": {
    "aiGenerated": true,
    "sources": [
      "Disney Parks Blog RSS",
      "themeparks.wiki destinations",
      "YouTube Data API v3 (top 10 last 48h)"
    ],
    "generatedAt": "2026-04-26T06:00:00-04:00"
  }
}
```

### Field rules

| Field | Notes |
|---|---|
| `slug` | Must equal the filename (without `.json`) |
| `date` | ISO `YYYY-MM-DD`, Eastern time |
| `teaser` | ≤ 160 chars; used for SEO description AND email teaser body |
| `rightNow.rides` | 2–3 rides recommended; renders as 3-column grid (1-col mobile) |
| `parkSlug` | One of: `magic-kingdom`, `epcot`, `hollywood-studios`, `animal-kingdom`, `disneyland`, `california-adventure` |
| `body` | Plain text — no markdown parser at render time |
| `sections.*` | Any subset present. Renderer enforces order: breaking → bignews → topstories → icymi → spotlight |
| `videos` | Up to 10. Each must have `title`, `channel`, `url`, `summary`. `viewCount` numeric. |
| `meta.aiGenerated` | `true` whenever the briefing was produced by the n8n flow. The website surfaces this as a small badge so readers know the editorial mix. |

n8n omits any section whose `items` would be empty. Don't ship an
empty array.

### Validation

The `Validate + format JSON` node hard-throws on any of:

- Missing `title`, `slug`, `date`, `teaser`
- Slug not matching `^parkio-daily-\d{4}-\d{2}-\d{2}$`
- `teaser.length > 220`
- Any `parkSlug` outside the enum
- `videos` not an array, or any video missing `title`/`channel`/`url`/`summary`

A schema violation **stops the workflow** — no commit, no email.
Better to skip a day than ship a broken post.

## Guardrails (LLM prompt)

The Compose node hardcodes these guardrails into Claude's prompt:

1. **Do NOT invent breaking news.** Every breaking-news item must
   be supported by the Disney Parks Blog RSS or a clearly
   newsworthy themeparks.wiki status.
2. **No-news fallback.** If the source data is weak, emit a single
   bignews item titled "No major updates today" and set
   `sections.breaking` and `sections.icymi` to `[]`. The
   `Validate` node detects this and sets `meta.fallbackReason = 'no-news'`.
3. **Ground every factual claim** in the provided source data.
4. **Tone:** helpful, fast, guest-focused. No clickbait. No emojis.
5. **Video summaries** are 1–2 sentences and based only on the
   video's title + channel — no inventing details about the
   contents.
6. **Use the exact 10 videos** provided by the upstream YouTube
   ranking — copy each field verbatim and add a `summary`.

## n8n workflow node-by-node

| # | Node | Type | Purpose |
|---|---|---|---|
| 1 | Daily 6 AM ET | scheduleTrigger | `0 6 * * *` America/New_York |
| 2 | Fetch Disney Parks Blog RSS | httpRequest | Raw text RSS feed |
| 3 | Fetch themeparks.wiki destinations | httpRequest | Park status JSON |
| 4 | YouTube — Search recent (48h) | httpRequest | Generic Query Auth credential `YouTube API Key` |
| 5 | YouTube — Get video stats | httpRequest | Same credential, `videos.list` for IDs |
| 6 | Rank Top 10 by views | code | Sort + slice top 10 |
| 7 | Build research context | code | Bundle RSS + parks + videos, compute slug/date |
| 8 | Compose with Claude | httpRequest | Anthropic credential `anthropicApi`, `claude-sonnet-4-5` |
| 9 | Validate + format JSON | code | Schema check + AI metadata + file payload |
| 10 | Commit to GitHub | github | accessToken credential, repo `tsomers13-ops/Parkio-Website` |
| 11 | Wait 90s for Cloudflare deploy | wait | Pages typically rebuilds in ≤45s |
| 12 | Build email teaser | code | Teaser-only HTML body, 3 bullets |
| 13 | Beehiiv — Create Post (DRAFT) | httpRequest | Header Auth credential `Beehiiv API`, **disabled until key exists** |

## Required credentials in n8n

| Credential | Type | Used by | How to set up |
|---|---|---|---|
| `Anthropic API` | Anthropic API | Compose with Claude | Settings → Credentials → New → "Anthropic API" → paste key |
| `GitHub` | GitHub API (access token) | Commit to GitHub | Create fine-grained PAT at github.com/settings/personal-access-tokens with `Contents: Read and write` on `tsomers13-ops/Parkio-Website` only |
| `YouTube API Key` | Generic → Query Auth | YouTube Search + Stats | name=`key`, value=`<your YouTube Data API v3 key>` |
| `Beehiiv API` | Generic → Header Auth | Beehiiv — Create Post | name=`X-API-Key`, value=`<your Beehiiv API key>` (after Stripe ID verification) |

Re-use the same `YouTube API Key` credential on both YouTube nodes —
they share quota.

## GitHub setup

- Repo: `tsomers13-ops/Parkio-Website`
- Path: `content/guide/daily/`
- Permissions: fine-grained PAT with `Contents: Read and write` on
  this repo. `Metadata: Read-only` is also required by GitHub.
- Direct commits to `main` are fine — daily briefings don't need PR
  review. If review is desired later, branch + auto-merge via Action.

## Cloudflare Pages setup

Already configured. On every push to `main`, Pages rebuilds with:

```
Build command:  npx @cloudflare/next-on-pages@1
Output dir:     .vercel/output/static
Compat flag:    nodejs_compat (production + preview)
```

The build calls `listDailySlugs()` in `lib/guideDaily.ts`, which uses
`fs.readdirSync()` on the `content/guide/daily/` directory. **Every
JSON file becomes a statically pre-rendered page**. Removing a file
deletes the page on the next deploy. `dynamicParams = false` is the
safety net.

## Beehiiv setup

1. Create the **Parkio Daily** publication in Beehiiv (done).
2. Find the embed URL — Settings → Forms → Embed.
3. Set this env var in Cloudflare Pages → Settings → Environment variables:

```
NEXT_PUBLIC_BEEHIIV_EMBED_URL=https://subscribe-forms.beehiiv.com/<form-id>
```

The `/newsletter` page picks this up and renders the Beehiiv embed
inline. Until set, the page shows a clean placeholder.

For the daily send, the workflow POSTs to
`https://api.beehiiv.com/v2/publications/{pub_id}/posts` with
`status: "draft"`. **Posts are draft until the user trusts the
flow** — flip to `"confirmed"` inside the `Build email teaser`
Code node when ready.

## App Store URL

When the iPhone app ships, set:

```
NEXT_PUBLIC_APP_STORE_URL=https://apps.apple.com/...
```

Until then, every "App Store" CTA across the site (homepage CTA,
Parkio Daily article banners, ConversionBlock variant `app`)
gracefully falls back to "Open Parkio" → `/parks` so the funnel never
breaks.

## Operational notes

- **Time zone**: Slugs and `date` fields are in Eastern Time (WDW).
  The renderer formats them with `timeZone: "UTC"` to keep the
  displayed date stable across viewer timezones.
- **Backfill**: Drop a JSON with an older date. The sitemap, listing
  page, and routing all handle it.
- **Edits**: Update the JSON, bump `updatedAt`. The page header shows
  freshness.
- **Deletion**: Delete the file, commit. URL 404s on next deploy.
- **No-news days**: When `meta.fallbackReason === 'no-news'`, the
  page still renders cleanly — Big News carries the "No major
  updates today" item and the rest of the structure is intact.

## Where conversion happens on the page

For each daily post, a reader meets these doors into the live product:

1. **Top of article — Right Now hero** (3 ride cards + Open Parkio + Check live waits)
2. **Top CTA cluster** (3-pill row: Open Parkio · Check live waits · Subscribe)
3. **Inline ConversionBlock("picks")** — after Top Stories
4. **Inline ConversionBlock("waits")** — after Spotlight
5. **Per-news-item links** — "View on map" + "Check live waits" on every story with a `parkSlug`
6. **Inline ConversionBlock("app")** — after Videos
7. **Mid-article newsletter card**
8. **End-of-article dark CTA** — "Open Parkio and let the picks decide"
9. **Bottom-of-page App Store banner**

That's 9 separate funnel surfaces. The article copy itself stays
clean and skimmable; the conversion blocks are visually distinct
cards interleaved between sections, not crammed inline.

## Restoring the workflow from the JSON file

If the live workflow is ever lost or you want to reset to the
canonical version:

```bash
# In n8n: Workflows → Import from File → select n8n/parkio-daily.json
# Or via API (replace ID and cookie):
curl -X PATCH https://parkio.app.n8n.cloud/rest/workflows/XWPcRzW8r2chhoRt \
  -H "Content-Type: application/json" \
  -H "Cookie: <session>" \
  --data @n8n/parkio-daily.json
```

The workflow ID `XWPcRzW8r2chhoRt` is permanent — its URL stays the
same across updates as long as you PATCH instead of recreating.

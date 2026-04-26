# Parkio Daily — Automation setup

Runbook for n8n + GitHub + Cloudflare + Beehiiv. The website code is
already in place; this doc explains how the daily-content pipeline
hooks in.

## Architecture

```
6 AM ET ──► n8n workflow ──► generates JSON ──► commits to GitHub
                                                         │
                                                         ▼
                                            Cloudflare Pages auto-rebuilds
                                                         │
                                                         ▼
                                  /guide and /guide/{slug} go live (static)
                                                         │
                                                         ▼
                            n8n triggers Beehiiv with TEASER ONLY + canonical link
```

The website post is the **canonical** copy. The Beehiiv email is a
**teaser only** — subject + 2–3 bullets + a link back to the website.
Email recipients click through and land on a page with conversion
blocks that funnel them into Parkio.

## Email rules — strict

The email MUST NOT contain the full briefing. From the n8n flow,
build the email with exactly:

```
Subject:  {post.title}
Preview:  first 100 chars of post.teaser
Body:     {post.teaser}
          • {breaking[0].title}
          • {bignews[0].title}
          • {topstories[0].title}
          → Read the full briefing on Parkio Daily
            https://parkio.info/guide/{post.slug}
```

Why this matters: the website post has the Right Now hero + three
conversion blocks (Picks, Waits, App). Email subscribers who get the
full content in their inbox never visit the site, never see those
funnels, never download the app. That defeats the whole point.

## Content file location and naming

Each daily briefing is **one JSON file**:

```
content/guide/daily/disney-park-news-YYYY-MM-DD.json
```

Slug rule: `disney-park-news-` + ISO date in **Eastern Time** (the
WDW timezone). Example: `disney-park-news-2026-04-26.json`. The slug
is the URL path: `parkio.info/guide/disney-park-news-2026-04-26`.

## JSON schema (n8n contract)

The TypeScript types live in `lib/guideDaily.ts`. n8n must produce:

```jsonc
{
  "title":   "Disney Park News — April 26, 2026",
  "slug":    "disney-park-news-2026-04-26",
  "date":    "2026-04-26",
  "teaser":  "1–2 sentences. SEO meta + email teaser. Under ~160 chars.",
  "updatedAt": "2026-04-26T06:00:00-04:00",

  "rightNow": {
    "headline": "Best rides right now",
    "rides": [
      { "name": "TRON Lightcycle / Run", "parkSlug": "magic-kingdom", "note": "Just reopened" },
      { "name": "Soarin'",                "parkSlug": "epcot",        "note": "Walk-on now" },
      { "name": "Tower of Terror",        "parkSlug": "hollywood-studios", "note": "Late-afternoon dip" }
    ]
  },

  "sections": {
    "breaking": [
      {
        "title":    "Headline",
        "body":     "Plain-text body. No markdown.",
        "parkSlug": "magic-kingdom",
        "source":   { "label": "Source name", "url": "https://..." }
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
      "url":          "https://www.youtube.com/...",
      "thumbnailUrl": "https://i.ytimg.com/.../hqdefault.jpg"
    }
  ]
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
| `videos` | 0–3 items work best. More than 3 still renders, just fills more rows |

n8n omits any section whose `items` would be empty. Don't ship an
empty array.

### Validation

The renderer is defensive (missing fields render as empty), but the
n8n flow should still validate the JSON before commit. Suggested:
JSON-schema-validate against the types in `lib/guideDaily.ts` (export
to JSON Schema with a TS-to-JSON-schema tool, or hand-author a
schema once and lint against it). Reject + retry on parse error.

## n8n workflow outline

1. **Cron trigger** — `0 6 * * *` America/New_York
2. **Research nodes** — fetch sources (Disney Parks Blog, themeparks
   APIs, social media) to gather raw bullets
3. **LLM compose** — pass raw bullets to Claude/OpenAI with the JSON
   schema as the response format constraint. Have it produce the full
   JSON object including `rightNow` (which 2–3 rides to feature).
4. **Validate** — JSON-schema-validate; reject and retry on failure
5. **GitHub commit**:
   - `path: content/guide/daily/{slug}.json`
   - `message: "Daily: {date} briefing"`
   - `branch: main`
6. **Wait** for Cloudflare deploy (poll the deploy status API or just
   sleep ~60s — Pages typically rebuilds in ≤45s)
7. **Beehiiv send** — POST the teaser email per the rules above

## GitHub setup

- Repo: `tsomers13-ops/Parkio-Website`
- Path: `content/guide/daily/`
- Permissions: n8n needs a fine-grained PAT or GitHub App with:
  - Contents: read/write on this repo
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
deletes the page on the next deploy (the URL 404s). `dynamicParams =
false` is the safety net.

## Beehiiv setup

1. Create the **Parkio Daily** publication in Beehiiv
2. Find the embed URL — Settings → Forms → Embed
3. Set this env var in Cloudflare Pages → Settings → Environment variables:

```
NEXT_PUBLIC_BEEHIIV_EMBED_URL=https://embeds.beehiiv.com/{publication-id}
```

The `/newsletter` page picks this up and renders the Beehiiv embed
inline. Until set, the page shows a clean placeholder so it's never
broken.

For the daily send, use Beehiiv's API or the Zapier connector. The
n8n flow POSTs the teaser email per the **Email rules** section above.

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

## Where conversion happens on the page

For each daily post, a reader meets these doors into the live product:

1. **Top of article — Right Now hero** (3 ride cards + Open Parkio + Check live waits)
2. **Top CTA cluster** (3-pill row: Open Parkio · Check live waits · Subscribe)
3. **Inline ConversionBlock("picks")** — after the Top Stories section
4. **Inline ConversionBlock("waits")** — after Spotlight
5. **Per-news-item links** — "View on map" + "Check live waits" on every story with a `parkSlug`
6. **Inline ConversionBlock("app")** — after Videos
7. **Mid-article newsletter card**
8. **End-of-article dark CTA** — "Open Parkio and let the picks decide"
9. **Bottom-of-page App Store banner**

That's 9 separate funnel surfaces. The article copy itself stays
clean and skimmable; the conversion blocks are visually distinct
cards interleaved between sections, not crammed inline.

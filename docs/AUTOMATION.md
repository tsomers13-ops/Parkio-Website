# Parkio Daily — Automation setup

This file documents how to wire up daily-briefing automation. The
website code is already in place; this is the runbook for n8n,
GitHub, Cloudflare, and Beehiiv.

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
                            n8n triggers Beehiiv with teaser + canonical link
```

The website post is the **canonical** copy. The Beehiiv email is a
**teaser only** that links back to the website. This is what funnels
email traffic into the live product on each post.

## File location and naming

Each daily briefing is a single JSON file at:

```
content/guide/daily/disney-park-news-YYYY-MM-DD.json
```

**Slug rule:** `disney-park-news-` + ISO date in the park's local
timezone (Eastern). Example: `disney-park-news-2026-04-26.json`. The
slug is the URL — `parkio.info/guide/disney-park-news-2026-04-26`.

## JSON schema

The full type definition is in `lib/guideDaily.ts`. n8n must produce
JSON matching this shape:

```jsonc
{
  "slug": "disney-park-news-2026-04-26",
  "type": "daily-briefing",
  "title": "Disney Park News — April 26, 2026",
  "publishedAt": "2026-04-26",
  "updatedAt": "2026-04-26T06:00:00-04:00",
  "summary": "1–2 sentences. Used as SEO description AND email teaser.",
  "sections": [
    {
      "kind": "breaking-news",
      "items": [
        {
          "title": "Headline",
          "body": "Plain-text body. No markdown.",
          "source": { "label": "Source name", "url": "https://..." },
          "parkSlug": "magic-kingdom"
        }
      ]
    },
    { "kind": "big-news",     "items": [...] },
    { "kind": "top-stories",  "items": [...] },
    { "kind": "icymi",        "items": [...] },
    {
      "kind": "spotlight",
      "items": [
        {
          "title": "Spotlight headline",
          "body": "Long-form paragraph.",
          "ctaParkSlug": "epcot",
          "ctaLabel": "Open EPCOT on Parkio"
        }
      ]
    },
    {
      "kind": "videos",
      "items": [
        {
          "title": "Video title",
          "channel": "Channel name",
          "url": "https://www.youtube.com/...",
          "thumbnailUrl": "https://i.ytimg.com/.../hqdefault.jpg"
        }
      ]
    }
  ]
}
```

**Field constraints:**

| Field | Notes |
|---|---|
| `slug` | Must match the filename (without `.json`) |
| `type` | Always `"daily-briefing"` |
| `summary` | Keep under ~160 chars — used for SEO meta |
| `parkSlug` / `ctaParkSlug` | One of: `magic-kingdom`, `epcot`, `hollywood-studios`, `animal-kingdom`, `disneyland`, `california-adventure` |
| `body` | Plain text. Single newlines render as paragraph breaks. No markdown parser. |
| Section order | Renderer respects the order in the array. Recommended: breaking → big → top → icymi → spotlight → videos |

Sections are optional individually — n8n can omit any section that
has no content. Don't ship a section with an empty `items` array.

## n8n workflow outline

A reasonable schedule and shape:

1. **Cron trigger** — `0 6 * * *` America/New_York
2. **Research nodes** — fetch sources (Disney Parks Blog, themeparks
   APIs, social media) to gather raw bullets
3. **LLM compose** — pass raw bullets into Claude/OpenAI with the JSON
   schema above as the response format constraint. Have it produce
   the full JSON object.
4. **Validation** — JSON-schema-validate the output. Reject and retry
   on failure.
5. **GitHub commit**:
   - `path: content/guide/daily/{slug}.json`
   - `message: "Daily: {date} briefing"`
   - `branch: main`
6. **Wait** for Cloudflare deploy (poll the deploy status API or just
   sleep ~60s — Pages typically rebuilds in ≤45s)
7. **Beehiiv send** — POST to Beehiiv API with:
   - subject: `{title}`
   - preview: first ~100 chars of `summary`
   - body: short teaser (the `summary` plus 1–2 hooks from the
     breaking-news section) + a CTA button to
     `https://parkio.info/guide/{slug}`

The Beehiiv email should NEVER include the full briefing — only the
hook + link. That's how the website becomes the funnel.

## GitHub setup

- Repo: `tsomers13-ops/Parkio-Website`
- Path: `content/guide/daily/`
- Permissions: n8n needs a fine-grained PAT or GitHub App with:
  - Contents: read/write on this repo
  - Workflows: not required (Cloudflare Pages auto-deploys on push)
- Direct commits to `main` are fine — daily briefings don't need PR
  review. If review is desired later, branch + auto-merge via a
  GitHub Action.

## Cloudflare Pages setup

Already configured. On every push to `main`, Pages rebuilds with:

```
Build command:  npx @cloudflare/next-on-pages@1
Output dir:     .vercel/output/static
Compat flag:    nodejs_compat (enabled in production + preview)
```

The build runs `generateStaticParams` at build time, which calls
`listDailySlugs()` in `lib/guideDaily.ts`. That function reads every
file in `content/guide/daily/`, so every JSON file becomes a
statically-rendered page. **Removing a file deletes the page on the
next deploy** — the URL will 404.

## Beehiiv setup

1. Create the Parkio Daily publication in Beehiiv
2. Find the embed URL for the signup form — Settings → Forms → Embed
3. Set this env var in Cloudflare Pages (Settings → Environment variables):

```
NEXT_PUBLIC_BEEHIIV_EMBED_URL=https://embeds.beehiiv.com/{publication-id}
```

The `/newsletter` page picks this up and renders the embed inline.
Until the var is set, the page shows a clean placeholder so it never
looks broken.

For the daily send, Beehiiv has both an API and a Zapier connector.
The n8n flow sends a POST to the API with the teaser + canonical URL.

## App Store URL

When the iPhone app ships, set:

```
NEXT_PUBLIC_APP_STORE_URL=https://apps.apple.com/...
```

Until then, every "App Store" CTA gracefully falls back to "Open
Parkio" (the live web experience at `/parks`). No code changes needed
when the URL goes live — set the var, redeploy, done.

## Operational notes

- **Time zone**: All dates in slugs and `publishedAt` are in Eastern
  Time (the WDW timezone). The renderer formats them as "Sunday,
  April 26, 2026" using `timeZone: "UTC"` so the displayed date is
  stable regardless of the visitor's timezone.
- **Backfill**: To publish a backdated briefing, drop a JSON file
  with the older date and commit. The sitemap includes it, the index
  page sorts correctly (newest first), and the URL goes live.
- **Edits**: To correct a published briefing, edit the JSON file and
  commit. Update the `updatedAt` timestamp; the page header shows the
  freshness.
- **Deletion**: Delete the JSON file and commit. The URL stops
  building on the next deploy and starts returning 404. The sitemap
  drops the entry. (`dynamicParams = false` is the safety net here —
  Next.js doesn't try to render unknown slugs.)

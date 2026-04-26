# Parkio

Skip the lines. Own your day.

Parkio is a public website that helps you make smarter Disney park days
with **real-time wait times, live park status, and a clean,
glanceable map**. Built with Next.js 14 (App Router), Tailwind CSS, and
TypeScript. The same Next.js app also serves Parkio's JSON API at
`/api/*`.

## What's inside

- **Landing page** — hero, features, how-it-works, product preview, FAQ, CTA
- **Park selection** — six U.S. Disney parks (4 Walt Disney World + 2 Disneyland Resort) with live "open today" status that hydrates from `/api/parks`
- **Park map** — full-screen Leaflet map with real GPS-pinned attractions, color-coded live wait times, status pills (Down / Closed / Refurb), drag-to-pan, pinch/wheel-to-zoom, marker clustering, and a draggable bottom sheet
- **Support** + **Privacy Policy** pages
- **JSON API** under `/api/*` (see [API.md](./API.md))

## Tech

- Next.js 14 · App Router (edge-runtime API routes)
- React 18
- Tailwind CSS 3.4 with a small custom design system (`ink`, `accent`,
  wait-tier palettes; soft shadows; fade/slide animations)
- TypeScript (strict)
- Leaflet + react-leaflet + leaflet.markercluster (CARTO Voyager basemap)
- Zustand installed for future cross-page state — not yet used
- Live data: themeparks.wiki public API, fetched server-side and cached

## Run locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

API routes are reachable at `http://localhost:3000/api/parks` etc.

Production build:

```bash
npm run build
npm start
```

## Project structure

```
parkio/
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   ├── page.tsx                     # Landing
│   ├── parks/
│   │   ├── page.tsx                 # Park selection
│   │   └── [parkId]/page.tsx        # Park map
│   ├── support/page.tsx
│   ├── privacy/page.tsx
│   └── api/                         # See API.md
│       ├── parks/route.ts
│       ├── parks/[parkSlug]/route.ts
│       ├── parks/[parkSlug]/live/route.ts
│       ├── parks/[parkSlug]/hours/route.ts
│       ├── resorts/[resortSlug]/route.ts
│       └── attractions/[attractionSlug]/route.ts
├── components/
│   ├── Hero.tsx, Features.tsx, HowItWorks.tsx, AppPreview.tsx, FAQ.tsx,
│   ├── CTASection.tsx, Navbar.tsx, Footer.tsx, LegalLayout.tsx
│   ├── ParkCard.tsx, ParkCardLive.tsx, ParksStatusSummary.tsx
│   ├── ParkMap.tsx, LeafletMap.tsx, BottomSheet.tsx, RideDetailPanel.tsx
│   └── WaitTimeBadge.tsx
└── lib/
    ├── parkioClient.ts              # Browser fetchers for /api/*
    ├── disneyParkConfig.ts          # 6 parks + 2 resorts
    ├── themeparksApi.ts             # Server-only upstream client
    ├── parkioNormalizer.ts          # themeparks.wiki → Parkio JSON
    ├── cache.ts                     # In-memory TTL cache
    ├── data.ts                      # Static UI mock (theme colors, ride menu)
    ├── types.ts                     # Park, Ride, ApiPark, ApiAttraction, …
    └── utils.ts                     # statusLabel, simulatedWait, color helpers
```

## How the website talks to its data

```
themeparks.wiki  →  Parkio API (cache + normalize)  →  Website
```

The browser **never** calls themeparks.wiki directly anymore. Every
piece of live data flows through Parkio's own `/api/*` routes:

| Page                    | Routes consumed                                                      |
| ----------------------- | -------------------------------------------------------------------- |
| `/parks` (selection)    | `/api/parks`                                                         |
| `/parks/[slug]` (map)   | `/api/parks/[slug]`, `/api/parks/[slug]/live` (refreshed every 60s)  |

That means:

- The same routes the website depends on are public, documented, and
  testable
- The upstream rate limit is shared and protected by an in-memory + CDN
  cache (`s-maxage` = 5min for live, 30min for hours)
- If themeparks.wiki ever goes down, every route returns a graceful
  fallback shape with `live: false` / `status: "UNKNOWN"` — clients
  render a "showing estimates" state instead of breaking

Full API reference: [API.md](./API.md).

## Fallback states the UI handles

| Situation                                  | What the user sees                                 |
| ------------------------------------------ | -------------------------------------------------- |
| First fetch in flight                      | "Loading" pill in the top bar                      |
| `/api/.../live` returned `live: false`     | "Estimates" pill; pins fall back to simulated      |
| Live row reports OPERATING, no wait number | Pin renders "—"; bottom sheet says "No data"       |
| Live row reports DOWN/CLOSED/REFURBISHMENT | Gray pin + status word; bottom sheet status card   |
| `/api/parks/[slug]` returns CLOSED         | Rose-tone "Park is closed today" strip in top bar  |
| Last-updated freshness                     | "Updated 2m ago" pill next to the park name        |

## Caching at a glance

| Endpoint                    | In-memory TTL | CDN s-maxage   |
| --------------------------- | ------------- | -------------- |
| `/api/parks/[slug]/live`    | 5 min         | 5 min (SWR 20m) |
| `/api/parks/[slug]/hours`   | 30 min        | 30 min          |
| `/api/parks/[slug]` & list  | 30 min        | 30 min          |
| `/api/resorts/[slug]`       | 30 min        | 30 min          |
| `/api/attractions/[slug]`   | shares park-level live cache | 5 min |

## Deployment

See [DEPLOY.md](./DEPLOY.md). The site needs a runtime now (real API
routes), so the previous static-export setup no longer applies. Two
supported paths: Vercel (zero-config) or Cloudflare Pages with the
`@cloudflare/next-on-pages` adapter.

## QA checklist (run before each deploy)

A 5-minute pass on the live preview URL. Most items are click-through.

### Pages load

- [ ] `/` — hero renders, "Resort Cards" show real "Open today" + "Avg wait"
- [ ] `/parks` — all 6 cards present, "Today's overview" tiles populate
- [ ] `/parks/{slug}` — open each of the 6 parks, map loads
- [ ] `/waits` — per-park top waits show
- [ ] `/about`, `/support`, `/privacy` — render
- [ ] `/__not-real` — 404 page with sitemap-style links

### Navigation

- [ ] Top nav: **Parks**, **Wait Times**, **API**, **About** all resolve
- [ ] Mobile hamburger opens, closes via Escape, link tap, and backdrop tap
- [ ] All footer links resolve (no Terms-style 404s)
- [ ] Hero "See how it works" scrolls to How-It-Works section

### Live data

- [ ] Park-map top bar shows the live "Open today" hours window
- [ ] "Live" pill goes live (green dot) within ~3s of page load
- [ ] Pins show real waits; closed/down rides render gray status pills
- [ ] "Last updated Xm ago" refreshes every 30s
- [ ] When `/api/...` is artificially blocked (DevTools → Network →
      Block request URL), pills fall back to "Estimates" — never blank

### Empty + error states

- [ ] First load shows "Loading" pill (not blank)
- [ ] Park with no live data: insights cards say "Loading…" → graceful empty
- [ ] Operating ride with no wait number → pin shows "—", bottom sheet
      says "No data"
- [ ] Park status `CLOSED` → "Park is closed today" strip visible

### SEO + assets

- [ ] `<title>` differs per page (no double "· Parkio" suffix)
- [ ] `/sitemap.xml` lists every route + the 6 parks
- [ ] `/robots.txt` allows `/`, disallows `/api/`
- [ ] `/opengraph-image` returns a 1200×630 PNG
- [ ] `/icon` returns a 32×32 PNG; favicon visible in tab
- [ ] [Open Graph debugger](https://www.opengraph.xyz/) renders the
      preview correctly when given the prod URL

### Mobile (iPhone-sized viewport)

- [ ] Top nav: hamburger opens cleanly; menu doesn't scroll background
- [ ] Park-map top bar pills don't overflow at 375px
- [ ] Bottom sheet drag-to-dismiss works
- [ ] Ride list panel opens via right-rail button, scrolls
- [ ] All grids stack to one column

### Console + network

- [ ] No hydration warnings in the console
- [ ] No 4xx/5xx in the Network tab on page load
- [ ] All `/api/*` responses return JSON with `Cache-Control` header
- [ ] OG image + favicon return 200

## Notes on scope

This is intentionally tight. **No** auth, accounts, favorites, day
planner, or push notifications yet. The data layer, types, design
system, and API are the parts that needed to be right first.

---

## Future: Parkio iPhone app

Parkio's roadmap includes an iPhone companion app. The current API was
shaped with that in mind — every endpoint returns a stable JSON shape
with iOS-friendly slugs — but **iOS work is paused until the public
website is fully production-ready**.

When iOS work resumes, drop-in Swift Codable models live in
[SWIFT_MODELS.md](./SWIFT_MODELS.md). The iPhone app will consume the
exact same `/api/*` routes documented in [API.md](./API.md). The
iPhone app should never call themeparks.wiki directly.

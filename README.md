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

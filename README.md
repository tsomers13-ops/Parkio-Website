# Parkio

Skip the lines. Own your day.

A modern Disney park planning + navigation experience built with Next.js 14 (App Router), Tailwind CSS, and TypeScript. Designed iPhone-first, with a clean, premium feel and zero clutter.

## What's inside

- **Landing page** — hero, feature grid, product preview, CTA, footer
- **Park selection** — all six Disney parks: Walt Disney World (Magic Kingdom, EPCOT, Hollywood Studios, Animal Kingdom) and Disneyland Resort (Disneyland Park, Disney California Adventure), with live status + crowd indicators
- **Park map (the core experience)** — full-screen SVG map with ride pins, color-coded wait times, drag-to-pan, pinch/wheel-to-zoom, and a draggable bottom sheet for ride details
- **Ride detail** — wait time, trend (rising/falling/steady), Lightning Lane status, height requirements, description, "Add to plan"
- **Simulated live data** — wait times jiggle every 30 seconds with a deterministic pseudo-random model so the app feels alive without an API

## Tech

- Next.js 14 · App Router
- React 18
- Tailwind CSS 3.4 with a small custom design system (`ink`, `accent`, `wait` palettes, soft shadows, fade/slide animations)
- TypeScript (strict)
- Zustand (installed for future state expansion — not yet used)
- Zero map dependencies — the park map is a custom SVG canvas built for a clean, premium feel

## Run locally

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server
npm run dev

# 3. Open http://localhost:3000
```

Build for production:

```bash
npm run build
npm start
```

## Project structure

```
parkio/
├── app/
│   ├── layout.tsx              # Root layout, fonts, metadata
│   ├── globals.css             # Tailwind + design tokens
│   ├── page.tsx                # Landing page
│   └── parks/
│       ├── page.tsx            # Park selection
│       └── [parkId]/
│           └── page.tsx        # Full-screen park map
├── components/
│   ├── Navbar.tsx
│   ├── Footer.tsx
│   ├── Hero.tsx
│   ├── Features.tsx
│   ├── AppPreview.tsx
│   ├── CTASection.tsx
│   ├── ParkCard.tsx
│   ├── WaitTimeBadge.tsx
│   ├── ParkMap.tsx             # Map surface, zoom/pan, top bar
│   ├── RidePin.tsx             # Animated map pin with live wait
│   ├── BottomSheet.tsx         # Drag-to-dismiss bottom sheet
│   └── RideDetailPanel.tsx     # Ride info inside the sheet
├── lib/
│   ├── types.ts
│   ├── data.ts                 # Mock parks + rides
│   └── utils.ts                # Wait-tier color logic, simulated waits
├── tailwind.config.ts
├── postcss.config.mjs
├── next.config.mjs
├── tsconfig.json
└── package.json
```

## Design system at a glance

- 8pt spacing rhythm
- Rounded corners (`rounded-2xl`, `rounded-3xl`, `rounded-4xl`)
- Soft, layered shadows (`shadow-soft`, `shadow-lift`, `shadow-glow`)
- Wait-time color coding: green (≤30m), amber (31–60m), rose (60m+)
- Glass surfaces over the map (`surface-glass`)
- Inter typeface for clean, modern hierarchy

## Future-ready

- `lib/data.ts` is structured to swap in a real wait-times API (themeparks.wiki, queue-times, or a custom backend) by replacing `simulatedWait()` and the static `RIDES` array — components consume types, not the data shape directly.
- Zustand is wired up as a dependency for cross-page state when planning, favorites, and itineraries are added.
- Ride pins are coordinate-based (`0–100` x/y), so swapping the SVG backdrop for a real licensed map is a one-component change.

## Parkio API

The website also serves Parkio's public JSON API at `/api/*`. The iOS app
consumes the same endpoints — clients should never call themeparks.wiki
directly.

**Architecture:**

```
themeparks.wiki  →  Parkio API (cache + normalize)  →  Website + iPhone app
```

**Endpoints:**

| Method | Path                                | Purpose                              |
| ------ | ----------------------------------- | ------------------------------------ |
| GET    | `/api/parks`                        | List supported parks + today's hours |
| GET    | `/api/parks/{parkSlug}`             | Single park metadata                 |
| GET    | `/api/parks/{parkSlug}/live`        | Live wait times + ride status        |
| GET    | `/api/parks/{parkSlug}/hours`       | Today's hours + 14-day forecast      |
| GET    | `/api/resorts/{resortSlug}`         | Resort + its parks                   |
| GET    | `/api/attractions/{attractionSlug}` | Single attraction                    |

Supported `parkSlug` values: `magic-kingdom`, `epcot`, `hollywood-studios`,
`animal-kingdom`, `disneyland`, `california-adventure`. Supported
`resortSlug` values: `walt-disney-world`, `disneyland-resort`.

**Caching:** Live wait times cache for 5 minutes (in-memory + CDN edge
cache); park hours cache for 30 minutes. If themeparks.wiki is
unreachable, routes fall back to Parkio's static attraction list with
`status: "UNKNOWN"` so the UI can render a graceful "estimates
unavailable" state.

Full reference: see [`API.md`](./API.md).

## iOS integration

Swift `Codable` models for every response shape live in
[`SWIFT_MODELS.md`](./SWIFT_MODELS.md). Drop them into the iPhone app to
consume `/api/*` directly. **Slugs are stable for iOS** — persist by
slug, not by themeparks.wiki UUID.

## API layer file map

```
lib/
├── disneyParkConfig.ts   # 6 parks + 2 resorts; canonical externalIds
├── themeparksApi.ts      # Raw upstream client (server-only)
├── parkioNormalizer.ts   # themeparks.wiki → Parkio JSON
└── cache.ts              # In-memory TTL cache + TTL constants

app/api/
├── _lib/respond.ts                    # Shared JSON helpers
├── parks/route.ts                     # GET list
├── parks/[parkSlug]/route.ts          # GET one
├── parks/[parkSlug]/live/route.ts     # GET live waits
├── parks/[parkSlug]/hours/route.ts    # GET hours
├── resorts/[resortSlug]/route.ts      # GET resort
└── attractions/[attractionSlug]/route.ts  # GET one attraction
```

All routes use `export const runtime = 'edge'` so they ship on
Cloudflare Pages (with `@cloudflare/next-on-pages`) or Vercel.

## Deployment

See [`DEPLOY.md`](./DEPLOY.md). Static export is no longer used — the
new API routes need a runtime. Both Vercel and Cloudflare Pages (via
`@cloudflare/next-on-pages`) are supported.

## Notes on scope

This build deliberately keeps things tight: no auth, no accounts, no
favorites, no day-planner page. Those are intentional gaps — the data
layer, types, design system, and API are the parts that needed to be
right first.

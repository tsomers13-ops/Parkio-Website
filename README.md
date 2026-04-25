# Parkio

Skip the lines. Own your day.

A modern Disney park planning + navigation experience built with Next.js 14 (App Router), Tailwind CSS, and TypeScript. Designed mobile-first, with a clean, premium feel and zero clutter.

## What's inside

- **Landing page** — hero, feature grid, product preview, CTA, footer
- **Park selection** — Magic Kingdom, EPCOT, Hollywood Studios, Animal Kingdom with live status + crowd indicators
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

## Notes on scope

This build deliberately keeps things tight: no auth, no real API yet, no day planner page. Those slots are clean to add — the data layer, types, and design system are the parts that needed to be right first.

# Cloudflare Pages → Workers migration (OpenNext)

Status: **Preview deployed and validated. Production NOT cut over.**

Preview Worker: `parkio-preview` at https://parkio-preview.tsomers13.workers.dev,
bound to `parkio-history-preview`. Rate limiting is live there with **approximate
burst semantics** — see the rate-limit runbook. Before any Production move, read
[PRODUCTION-DEPLOYMENT-PLAN.md](./PRODUCTION-DEPLOYMENT-PLAN.md).

`parkio.info` is still served by Cloudflare Pages. That deployment is the
rollback target and must not be touched until a separately authorised cutover.

## Why

Two problems that Pages could not solve:

1. **Historical deployment exposure.** Pages publishes an immutable
   `<hash>.parkio.pages.dev` alias for every deployment ever made, all bound to
   the Production D1 database. Bindings are baked in at deploy time, so old
   deployments keep Production write authority and new application code cannot
   reach them.
2. **No rate limiting.** The Workers Rate Limiting binding is not available to
   Pages Functions, and `ratelimits` is not a supported key in a Pages Wrangler
   configuration. Free-plan WAF rate limiting allows one rule, a 10 s period,
   and cannot match on HTTP method — so it would throttle the public aggregate
   GET that Dining discovery depends on.

Workers fixes both while keeping `parkio.info`, every URL, and the iOS
`productionBaseURL` unchanged.

## Adapter

`@opennextjs/cloudflare`. `vinext` was evaluated and **rejected**: it could not
prerender even a dependency-free route (1 of 331), served everything as
`Cache-Control: no-store`, and supports no explicit prerender route list.

OpenNext consumes Next's own build output, so all ~320 prerendered pages
survive.

## Required, non-obvious configuration

### `populateCache` is mandatory

Prerendered pages are stored as cache entries, not raw HTML assets. The
static-assets incremental cache reads them back from Workers Static Assets:

```ts
// open-next.config.ts
incrementalCache: staticAssetsIncrementalCache
```

**Without `opennextjs-cloudflare populateCache`, every SSG route returns 404.**
It is wired into `npm run workers:build` and into CI. Do not remove it.

This override suits Parkio exactly because nothing revalidates: every generated
route pairs `generateStaticParams` with `dynamicParams = false`. It needs no R2,
KV or D1 bucket, and static-asset requests are free and unlimited.

### `wrangler types --include-runtime=false`

The full Workers runtime globals collide with the DOM lib the component tests
use (28 TypeScript errors with them, 0 without). Use `npm run cf:types`.

### Node 22+

OpenNext and Wrangler 4 need Node 22 or later. The Pages build stays on
`NODE_VERSION=20` and is unaffected.

### Preview hostnames must be allowed explicitly

Deploying Preview as a *Worker* rather than a Pages preview alias broke both
host-authorisation layers, because each allowed `*.parkio.pages.dev` and
localhost only. Fixed in `51ee64e`: `lib/ratingsWriteHost.ts` and
`lib/ratingsOrigin.ts` now also allow `parkio-preview.<subdomain>.workers.dev`,
**in the non-production policy only**, matching on both a `parkio-preview.`
prefix and a `.workers.dev` suffix so the shared workers.dev namespace is not
trusted wholesale. If Preview is ever renamed, update both files together.

### React 19 and react-leaflet 5

Next 15 pairs with React 19. `react-leaflet@4` peers on React 18 only, so it
moves to `react-leaflet@5` (which peers `leaflet@^1.9` — already satisfied).

### Bindings: vars vs objects

Plain variables and secrets still arrive on `process.env`, so
`lib/ratingsIdentity.ts` and `lib/ratingsWriteHost.ts` are unchanged.

Binding *objects* cannot: `process.env` coerces values to strings, so a D1
database or rate limiter would arrive as `"[object Object]"`. Those come from
the request context via `lib/cloudflareEnv.ts`. Only `lib/ratingsDb.ts` and
`app/api/parks/[parkSlug]/live/route.ts` needed changing, and both keep a
`process.env` fallback so `next dev` and the Pages build behave as before.

### Edge runtime removed

All 13 `export const runtime = "edge"` declarations are gone — OpenNext runs the
Node.js runtime. None depended on an Edge-only API. Two side benefits: Next 15
rejects edge runtime combined with `generateStaticParams`, and removing it made
`/icon` and `/opengraph-image` statically generated (330 pages, up from 323).

## Preview environment

| | |
|---|---|
| Worker | `parkio-preview` (deliberately not `parkio`) |
| D1 | `parkio-history-preview` — **never** Production |
| `PARKIO_COMMUNITY_WRITE_ENV` | `preview` |
| Rate-limit namespaces | 2001 / 2002 (Production will use 1001 / 1002) |
| `workers_dev` | `true` **for Preview only**; Production ships `false` |
| Secret | a Preview-only `RATINGS_IDENTITY_SECRET`, never the Production value |

Production iOS credentials are not expected to validate against Preview. That is
correct: it is a separate signing domain.

## Rollback

Pre-migration Production commit: **`ce1ed15`**.

Nothing has been detached or deleted. Production continues to deploy from the
Pages GitHub integration, so today rollback is "do nothing — or revert this
branch". `@cloudflare/next-on-pages` and `build:cloudflare` are retained for
exactly that reason.

**After cutover this changes, and it changes twice.** Rollback has two distinct
phases with different capabilities:

- **Before Pages deletion** — move `parkio.info` back to the intact Pages
  project. No data operation; both platforms bind the same `parkio-history` by
  id.
- **After Pages deletion** — Pages rollback **no longer exists**. The only
  immediate rollback is to a known-good Worker version via `wrangler rollback`.

Both procedures, their prerequisites and their limitations are in
[PRODUCTION-DEPLOYMENT-PLAN.md](./PRODUCTION-DEPLOYMENT-PLAN.md) §9 and §10. Do
not plan a rollback from this file.

## Deployment order

**Superseded.** The authoritative, gated sequence — including the
`parkio-worker-canary.parkio.info` staging hostname, the go/no-go gates, and the
single reviewed route swap — lives in
[PRODUCTION-DEPLOYMENT-PLAN.md](./PRODUCTION-DEPLOYMENT-PLAN.md) §7.

Keeping a second summary here would be a second source of truth, and the two
would drift. Deleting the Pages project remains the only irreversible step, is
separately authorised, and is not authorised today.

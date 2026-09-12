# Cloudflare Pages → Workers migration (OpenNext)

Status: **Preview implemented, Production NOT cut over.**

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
Pages GitHub integration. To roll back, do nothing — or revert this branch.
`@cloudflare/next-on-pages` and `build:cloudflare` are retained for exactly
this reason and should only be removed after cutover and soak.

## Deployment order (future cutover, not yet authorised)

1. Deploy and validate the Preview Worker.
2. Create the Production Worker with `workers_dev: false`, namespaces 1001/1002,
   Production D1, and the Production secret.
3. Validate it on its own hostname before it is canonical.
4. Detach `parkio.info` from Pages, attach to the Worker.
5. Soak at least 7 days. Keep the Pages project.
6. Only then retire Pages — which is what finally removes the historical
   `<hash>.parkio.pages.dev` aliases.

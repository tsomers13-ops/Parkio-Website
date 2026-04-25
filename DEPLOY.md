# Deploying the Parkio website

The Parkio site is the production target right now. iOS work is paused
until the website is fully ready (see the README's Future section).

The site is a Next.js 14 App Router app with **real API routes** under
`app/api/*`. It needs a runtime — a fully-static export won't work. Pick
one of the two supported deployment paths below.

---

## Path A — Vercel (recommended for the simplest path)

```bash
# Install once
npm i -g vercel

# From the repo root
vercel
```

Follow the prompts and accept the defaults. Push commits to `main` and
Vercel auto-redeploys. PRs get preview URLs.

### Custom domain (`parkio.info`)

1. Vercel dashboard → project → **Settings → Domains** → add `parkio.info`.
2. In Cloudflare DNS for `parkio.info`, point the CNAME to
   `cname.vercel-dns.com`. Cloudflare can stay as the DNS host either way.

---

## Path B — Cloudflare Pages with `@cloudflare/next-on-pages`

The previous static-export deployment to Cloudflare Pages won't work
once the API routes exist. Migration is one-time and takes ~5 minutes.

### 1. Add the adapter

```bash
npm install --save-dev @cloudflare/next-on-pages
```

### 2. Update Cloudflare Pages build settings

In the Cloudflare dashboard → **Workers & Pages → parkio →
Settings → Builds**:

| Field                  | New value                            |
| ---------------------- | ------------------------------------ |
| Build command          | `npx @cloudflare/next-on-pages@1`    |
| Build output directory | `.vercel/output/static`              |
| `NODE_VERSION` env     | `20`                                 |

### 3. Add the compatibility flag

Cloudflare Pages → **Settings → Functions → Compatibility flags**:

- Production: add `nodejs_compat`
- Preview: add `nodejs_compat`

### 4. Redeploy

Push to `main`. Cloudflare picks up the new build command, runs the
adapter, and `app/api/*` is now live as edge functions on the same
domain.

---

## Local development

```bash
npm install
npm run dev
```

API routes are reachable at `http://localhost:3000/api/parks`,
`http://localhost:3000/api/parks/magic-kingdom/live`, etc.

To preview what Cloudflare's edge runtime will see:

```bash
npm run build && npx @cloudflare/next-on-pages@1
npx wrangler pages dev .vercel/output/static --compatibility-flag=nodejs_compat
```

---

## Caching

The API routes set `Cache-Control: public, s-maxage=…` so the platform's
edge CDN caches every response. There's also an in-memory TTL cache
inside the route handlers that gates upstream calls to themeparks.wiki:

| Endpoint                       | In-memory TTL | s-maxage |
| ------------------------------ | ------------- | -------- |
| `/api/parks/{slug}/live`       | 5 min         | 5 min    |
| `/api/parks/{slug}/hours`      | 30 min        | 30 min   |
| `/api/parks/{slug}` & list     | 30 min        | 30 min   |
| `/api/resorts/{slug}`          | 30 min        | 30 min   |
| `/api/attractions/{slug}`      | 5 min (shared)| 5 min    |

In-memory cache is per-isolate. If the site grows to need
multi-region durability or more aggressive cache hits, swap
`lib/cache.ts` for Cloudflare KV — the `getOrFetch` signature stays the
same.

---

## Future: iPhone app

Once the website is fully production-ready, the iPhone app can ship
against the exact same API routes (see [API.md](./API.md)). No
deployment changes needed for that — the existing routes already use
edge runtime and stable slugs.

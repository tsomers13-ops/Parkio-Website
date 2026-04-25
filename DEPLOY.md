# Deploying Parkio

Parkio is now a Next.js 14 App Router app with **real API routes** under
`app/api/*`. That means it needs a runtime — a fully-static export won't
work anymore. Pick one of:

1. **Vercel** — zero-config, App Router + edge runtime out of the box.
2. **Cloudflare Pages with `@cloudflare/next-on-pages`** — keeps you on
   Cloudflare; one-time build adapter swap.

Both options run the API routes on edge runtime. The site behaves the
same on either platform.

---

## Path A — Vercel (recommended for a clean slate)

```bash
# 1. Install the Vercel CLI once
npm i -g vercel

# 2. From the repo root
vercel
```

Follow the prompts — pick the default settings. Push commits to `main`
and Vercel redeploys automatically.

To map a custom domain (`parkio.info`):

1. Vercel dashboard → project → **Settings → Domains** → add `parkio.info`.
2. Cloudflare DNS for `parkio.info`:
   - Either change the CNAME for `parkio.info` to `cname.vercel-dns.com`
   - Or use Cloudflare's *Origin Server* mode and let Cloudflare proxy.

That's it.

---

## Path B — Cloudflare Pages (`@cloudflare/next-on-pages`)

The previous deployment shipped a static export to Cloudflare Pages.
With API routes added, the build command and output directory both
change. You'll do this once.

### 1. Add the adapter

```bash
npm install --save-dev @cloudflare/next-on-pages
```

### 2. Update Cloudflare Pages build settings

In the Cloudflare dashboard → **Workers & Pages → parkio → Settings → Builds**:

| Field                  | New value                                     |
| ---------------------- | --------------------------------------------- |
| Build command          | `npx @cloudflare/next-on-pages@1`             |
| Build output directory | `.vercel/output/static`                       |
| `NODE_VERSION` env     | `20`                                          |

### 3. Add the compatibility flag

Cloudflare Pages → **Settings → Functions → Compatibility flags**:

- Production: add `nodejs_compat`
- Preview: add `nodejs_compat`

### 4. Redeploy

Push to `main`. Cloudflare picks up the new build command, runs the
adapter, and your `app/api/*` routes are now live edge functions on
the same domain (`parkio.info`).

---

## Local development

```bash
npm install
npm run dev
```

API routes are reachable at `http://localhost:3000/api/parks` etc.

To test what Cloudflare's edge runtime will see:

```bash
npm run build && npx @cloudflare/next-on-pages@1
npx wrangler pages dev .vercel/output/static --compatibility-flag=nodejs_compat
```

---

## Caching note

The API routes set `Cache-Control: public, s-maxage=…` so the platform's
edge CDN caches each response. There's also an in-memory TTL cache
inside the route handlers that gates upstream calls to themeparks.wiki:

| Endpoint                       | In-memory TTL | s-maxage |
| ------------------------------ | ------------- | -------- |
| `/api/parks/{slug}/live`       | 5 min         | 5 min    |
| `/api/parks/{slug}/hours`      | 30 min        | 30 min   |
| `/api/parks/{slug}` & list     | 30 min        | 30 min   |
| `/api/resorts/{slug}`          | 30 min        | 30 min   |
| `/api/attractions/{slug}`      | 5 min (shared)| 5 min    |

In-memory cache is per-isolate. If you scale to many regions and want
stricter cache hits, swap `lib/cache.ts` for Cloudflare KV (the
`getOrFetch` signature stays the same).

# Deploy Parkio to Cloudflare Pages

Parkio is configured as a fully static Next.js export. `npm run build` writes everything to `./out` — that's the folder Cloudflare serves.

There are two paths. Pick the first one for a real production setup; pick the second for a one-shot upload.

---

## Path A — Git integration (recommended)

This connects your repo to Cloudflare. Every push redeploys automatically.

### 1. Push the project to GitHub

From the project root:

```bash
git init
git add .
git commit -m "Initial Parkio commit"
git branch -M main

# Create an empty repo on github.com first (e.g. parkio), then:
git remote add origin https://github.com/<your-username>/parkio.git
git push -u origin main
```

### 2. Create the Pages project

1. Go to **dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git**.
2. Authorize Cloudflare to read your GitHub repos and pick `parkio`.
3. Configure the build:

| Setting | Value |
| --- | --- |
| Framework preset | **Next.js (Static HTML Export)** |
| Build command | `npm run build` |
| Build output directory | `out` |
| Root directory | _(leave blank)_ |
| Node version env var | `NODE_VERSION` = `20` |

4. Click **Save and Deploy**.

The first build takes ~2 minutes. You'll get a URL like `parkio.pages.dev`. Every push to `main` redeploys; PRs get preview deployments automatically.

### 3. (Optional) Custom domain

In the project's **Custom domains** tab, add your domain. Cloudflare handles SSL.

---

## Path B — Direct upload via Wrangler CLI

Faster for a one-shot deploy. No GitHub needed.

```bash
# 1. Build the static site
npm install
npm run build

# 2. Deploy with Wrangler (uses your Cloudflare account)
npx wrangler pages deploy ./out --project-name=parkio
```

The first run will open a browser to authenticate with Cloudflare. You'll be asked whether to create a new project — say yes, and it'll publish to `parkio.pages.dev`.

To redeploy after changes, repeat steps 1 and 2.

---

## Why static export

Parkio has no API routes, no server actions, and no SSR — every page is pre-rendered at build time, including all four park maps via `generateStaticParams`. That means:

- No edge runtime needed (no `@cloudflare/next-on-pages`)
- Fast global CDN delivery on Cloudflare's network
- Zero cold starts, zero per-request cost

When you wire up a real wait-times API later, swap `lib/utils.ts → simulatedWait()` for a `fetch` to your endpoint — keep it client-side and you stay on the static export. If you want server-side fetching with ISR, switch to the `@cloudflare/next-on-pages` adapter then.

---

## Troubleshooting

**Build fails with "Page X with `dynamic = "force-dynamic"` could not be exported"** — you've added a server-only feature. Either remove it or move to `@cloudflare/next-on-pages`.

**404 on a park route** — the `dynamicParams = false` in `app/parks/[parkId]/page.tsx` means only the four pre-built park IDs work. That's intentional.

**Local preview of the built site** — `npx serve out` serves the `out` folder on `localhost:3000` so you can sanity-check before deploying.

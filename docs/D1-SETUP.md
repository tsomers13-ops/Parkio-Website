# Cloudflare D1 — Historical wait-time collection

Walkthrough for enabling Parkio's write-only history collection.

The code is already shipped. Until you complete the steps below, the
`/api/parks/[parkSlug]/live` route runs exactly as before — the writer
is a silent no-op when the D1 binding isn't present.

## What's collected

A row per attraction is appended to the `wait_snapshots` table **only
when the live API actually pulls fresh data from themeparks.wiki**
(i.e., on a cache miss). Cached responses never write. The route
returns immediately; the DB write happens in the background via
`ctx.waitUntil`.

The schema is in [`migrations/0001_wait_snapshots.sql`](../migrations/0001_wait_snapshots.sql):

| Column              | Notes |
|---|---|
| `id`                | autoincrement primary key |
| `taken_at`          | ISO 8601, when Parkio recorded the sample |
| `park_slug`         | Parkio canonical (`magic-kingdom`, `epcot`, …) |
| `attraction_slug`   | Parkio canonical (stable across upstream renames) |
| `attraction_id`     | themeparks.wiki entityId — for auditing/joining |
| `wait_minutes`      | INTEGER, NULL when not `OPERATING` |
| `status`            | `OPERATING` \| `DOWN` \| `CLOSED` \| `REFURBISHMENT` \| `UNKNOWN` |
| `source_updated_at` | ISO 8601 from upstream `lastUpdated`, may be NULL |

Indexes: `(park_slug, taken_at DESC)`, `(attraction_slug, taken_at DESC)`,
`(taken_at)`. Optimized for "give me recent samples" queries.

## Setup

### 1. Install Wrangler (one-time, on your machine)

```bash
npm install -g wrangler
wrangler login
```

This opens a browser to authorize Wrangler against your Cloudflare account.

### 2. Create the D1 database

```bash
wrangler d1 create parkio-history
```

The command prints a database ID. Copy it — you'll paste it into the
Cloudflare Pages dashboard in step 4.

### 3. Apply the migration

Apply against the **remote** database (the one Cloudflare Pages will
talk to):

```bash
wrangler d1 execute parkio-history --remote --file=./migrations/0001_wait_snapshots.sql
```

If you also want to run it against a local SQLite for `wrangler dev`:

```bash
wrangler d1 execute parkio-history --local --file=./migrations/0001_wait_snapshots.sql
```

### 4. Bind the database to the Cloudflare Pages project

In the Cloudflare dashboard:

1. **Workers & Pages** → **parkio** (the project) → **Settings**
2. Scroll to **Functions** → **D1 database bindings**
3. Click **Add binding**
4. **Variable name:** `DB`  ← *must match exactly — the code reads `env.DB`*
5. **D1 database:** select **parkio-history**
6. Save

Repeat for **Production** AND **Preview** environments if you want
preview deploys to write history too. (Most users only enable
Production.)

### 5. Trigger a fresh deploy

The new binding is only attached on the next deploy. Push a no-op
commit, or open the Pages dashboard and click **Retry deployment** on
the latest build.

## Verify snapshots are being saved

After the deploy completes, hit the live endpoint a couple of times:

```bash
# Two requests — the first is a cache miss (writes), the second is a hit (no write).
curl -s 'https://parkio.info/api/parks/magic-kingdom/live' >/dev/null
curl -s 'https://parkio.info/api/parks/magic-kingdom/live' >/dev/null
```

Then count rows:

```bash
wrangler d1 execute parkio-history --remote --command="SELECT COUNT(*) AS rows FROM wait_snapshots"
```

Should be ~the number of attractions in Magic Kingdom (a single batch
is one row per attraction). Expect ~30–40.

Inspect a few rows:

```bash
wrangler d1 execute parkio-history --remote --command="
  SELECT taken_at, park_slug, attraction_slug, wait_minutes, status
  FROM wait_snapshots
  ORDER BY taken_at DESC
  LIMIT 10
"
```

If you see rows, the binding is working end-to-end.

If `COUNT(*)` is 0 even after several minutes:

1. Confirm the binding name in the Pages dashboard is exactly **`DB`**.
2. Confirm the migration ran — `wrangler d1 execute parkio-history --remote --command="SELECT name FROM sqlite_master WHERE type='table'"` should list `wait_snapshots`.
3. Check Pages → your-project → **Functions logs** for `[history] snapshot write failed` warnings. The most common cause is forgetting step 5 (re-deploying after adding the binding).

## Risks / tradeoffs

### Volume vs. D1 free-tier limits

The free D1 tier allows **100,000 writes/day** and **5 GB storage**.
Parkio's write rate depends on the live cache TTL
(`CACHE_TTL.live = 300s` — 5 minutes) and the number of distinct parks
that get hit:

```
  6 parks × 288 cache misses/day × ~30 attractions per park
  ≈ 52,000 row inserts/day
```

That's roughly **half** the free-tier write budget, leaving headroom
for traffic spikes, multi-region cache warmup, and growth. The 5-min
TTL was chosen specifically to fit inside this budget — see
`lib/cache.ts` for the rationale.

If write volume eventually outgrows the free tier (more parks, more
backend triggers, etc.), three escape hatches in order of impact:

1. **Raise the cache TTL further** — moving from 5 → 10 min halves
   writes again. User-visible staleness still acceptable for waits
   that genuinely shift on a 5–15 min cadence.
2. **Debounce identical samples** — skip the write if the previous
   snapshot for the same `(park_slug, attraction_slug)` had identical
   `wait_minutes` and `status` AND is less than N minutes old. Most
   rides don't change every cycle. Typically halves volume again.
3. **Upgrade to D1 paid** — $0.001 per 1k writes after the 100k/day
   free quota. Even at 200k writes/day that's ~$3/month.

We deliberately have NOT added debouncing yet — simpler is better
while the system is shaking out, and the 5-min TTL alone keeps us
well under the cap.

### Storage growth

At ~52K rows/day × ~80 bytes per row = **~4 MB/day → ~1.5 GB/year**.
That fits comfortably inside D1's 5 GB free-tier storage cap with
~3 years of headroom even with no cleanup. Mitigation when the day
comes:

- Add a TTL job (cron Worker or n8n) that deletes snapshots older
  than 90/180/365 days.
- Roll up older snapshots to hourly aggregates and keep only those.
- Move to a cheaper time-series store (BigQuery, ClickHouse Cloud)
  once you actually start using the data.

### Hot path safety

The writer uses `ctx.waitUntil` which only delays the **isolate's
shutdown**, not the user's response. Even if D1 is offline or slow,
the user-facing latency is unchanged. The route handler also wraps
the snapshot scheduling in try/catch so failures in the binding
lookup itself can't bubble up.

If `@cloudflare/next-on-pages` ever breaks the `getRequestContext`
shape, the writer fails closed (no throw, no write). The dynamic
import + try/catch ensures local `next dev` runs without ever
attempting a snapshot.

### Privacy / public exposure

This collection is **internal only**. We do not expose any read
endpoints in v1. When we do (charts, trends, smarter Picks):

- Aggregate to hourly or 15-min buckets before serving.
- Never expose individual snapshot rows publicly.
- Confirm with themeparks.wiki TOS before redistributing raw waits.

## What this DOESN'T do (yet)

This v1 is intentionally narrow:

- **No reads.** Nothing in Parkio queries `wait_snapshots`.
- **No charts.** No new pages, no new API routes.
- **No Picks integration.** Parkio Picks still uses live-only data.
- **No backfill.** History starts the moment the binding goes live.

Any of those is a follow-up task once we've watched real volume for a
few days.

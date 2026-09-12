# Production deployment plan — OpenNext Workers cutover

**Status: FOR REVIEW. Not authorised. Nothing in this document has been executed.**

Production is Cloudflare Pages, serving `parkio.info`. The Preview Worker
`parkio-preview` is deployed and validated (Gate 8B.8). This plan covers what
must be proven before `parkio.info` moves, and how to undo it.

Rollback commit: **`ce1ed15`** (last Pages-deployed Production commit).
Implementation: branch `priority-9-gate-8b8-opennext-preview` at **`51ee64e`**.

---

## Configuration: a separate file, not an environment block

Production gets its own **`wrangler.production.jsonc`**, deployed only with an
explicit `--config` flag:

```bash
npx wrangler deploy --config wrangler.production.jsonc
```

The reason is blunt: `wrangler.jsonc` in the repo root is the **Preview** config.
Keeping Production in a separate file means a bare, habitual `wrangler deploy`
can only ever touch Preview. An `env.production` block in one file would make a
forgotten flag deploy Production by accident.

Proposed contents — every difference from Preview is deliberate:

```jsonc
{
  "name": "parkio",                        // NOT parkio-preview
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-09-11",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": { "directory": ".open-next/assets", "binding": "ASSETS" },

  "workers_dev": false,                    // no *.workers.dev route to Production
  "preview_urls": false,                   // no versioned preview URLs
  "observability": { "enabled": true },

  "routes": [
    { "pattern": "parkio.info", "custom_domain": true }
  ],

  "d1_databases": [
    { "binding": "DB",
      "database_name": "parkio-history",
      "database_id": "82b972d1-be63-4c0d-bbbb-8437860ebcd0" }
  ],

  "vars": { "PARKIO_COMMUNITY_WRITE_ENV": "production" },

  "ratelimits": [
    { "name": "IDENTITY_MINT_LIMITER", "namespace_id": "1001",
      "simple": { "limit": 5,  "period": 60 } },
    { "name": "RATING_WRITE_LIMITER",  "namespace_id": "1002",
      "simple": { "limit": 10, "period": 60 } }
  ]
}
```

`RATINGS_IDENTITY_SECRET` is **not** in this file. It is installed once, by
hand, with the **Production** value:

```bash
npx wrangler secret put RATINGS_IDENTITY_SECRET --config wrangler.production.jsonc
```

Using the existing Production value is what keeps already-issued iOS Keychain
credentials valid: the signature is `HMAC(secret, "parkio-native-v1:" + raterId)`
and nothing about hosting enters it.

---

## Requirement 1 — limiter bindings are attached to Production

**Proof before cutover**, from wrangler itself rather than from the config file:

```bash
npx wrangler deploy --dry-run --config wrangler.production.jsonc
```

Must print exactly:

```
env.DB (parkio-history)                        D1 Database
env.IDENTITY_MINT_LIMITER (5 requests/60s)     Rate Limit
env.RATING_WRITE_LIMITER (10 requests/60s)     Rate Limit
env.ASSETS                                     Assets
env.PARKIO_COMMUNITY_WRITE_ENV ("production")  Environment Variable
```

**Proof after cutover**, on the live Worker — a back-to-back burst, because
approximate semantics only bite on bursts (see the runbook):

```bash
U=""; for i in $(seq 1 8); do U="$U https://parkio.info/api/identity/anonymous/"; done
curl -s -D - -o /dev/null -X POST $U | grep -E '^HTTP/2|^cache-control'
```

Accept: a run of 201s then 429s, each 429 carrying `cache-control: no-store` and
the specified JSON. **Do not** accept "no 429 seen" as proof of anything — it is
the ambiguous case, and means retry as a tighter burst.

Rating writes cannot be burst-tested in Production without writing real ratings.
Verify that binding by dry-run and by `wrangler tail` showing 429s in real
traffic, **not** by manufacturing Production ratings.

---

## Requirement 2 — writes cannot bypass enforcement via pages.dev

This is the weakest link and must not be overstated. Three distinct hostname
classes, with genuinely different answers:

### 2a. `parkio.pages.dev` (the apex) — CLOSED

The apex always serves the Pages project's **latest** deployment. That is
`ce1ed15`, which already contains the hostname guard from `2c32a22`. Under
`PARKIO_COMMUNITY_WRITE_ENV` absent-or-production, a `parkio.pages.dev` host is
refused.

Verify (non-mutating, no Origin so nothing can be written):

```bash
curl -s -X POST https://parkio.pages.dev/api/dining/ep-le-cellier/ratings/ \
  -H 'content-type: application/json' -d '{"overall":5}'
# expect: {"error":"forbidden_host",...}
```

**Condition: stop deploying to Pages after cutover.** If a Pages build ever runs
again from a branch lacking the guard, this reopens.

### 2b. Historical `<hash>.parkio.pages.dev` — NOT closed by code

Deployments published before `2c32a22` contain no hostname guard, carry a baked
Production D1 binding, and **will not have the limiter either**. New application
code cannot reach them. This is the same exposure Gate 8B.3 examined.

Mitigation, in order of strength:

1. **Cloudflare Access on `*.parkio.pages.dev`.** Measured on 2026-09-11:
   `9ca196f7.parkio.pages.dev` returned **302 → cloudflareaccess.com** with
   `www-authenticate: Cloudflare-Access` on 9 of 9 consecutive probes, and
   arbitrary non-existent hashes were intercepted too — so it matches on
   hostname pattern, not a deployment registry. **Re-verify immediately before
   cutover**, because an earlier probe that same day returned `forbidden_origin`
   and that discrepancy was never explained.
2. **Delete the Pages project** after soak. This is the only complete closure:
   it removes the apex and every historical alias at once, permanently.

**State plainly in any status report: until the Pages project is deleted,
historical deployment aliases remain a potential unenforced write path.** Do not
claim Requirement 2 is fully satisfied before that step.

### 2c. `*.workers.dev` — CLOSED by construction

`workers_dev: false` and `preview_urls: false` mean Production has no workers.dev
route at all. Independently, the host policy refuses a workers.dev host whenever
the environment is `production` — asserted by test, not assumed.

---

## Requirement 3 — Production host and Origin policies stay restricted

Both files already encode this; the cutover must not relax either.

| Layer | Production allows | Refuses |
|---|---|---|
| `lib/ratingsWriteHost.ts` | `parkio.info`, `www.parkio.info` (exact) | pages.dev, workers.dev, localhost, lookalikes |
| `lib/ratingsOrigin.ts` | `https://parkio.info`, `https://www.parkio.info` | everything else cross-site |

The Gate 8B.8 fix widened only the **non-production** sets. Tests assert a
workers.dev host is refused under `production`, `development` and `unknown`, and
that `parkio.info.attacker.example` and `attacker-parkio.info` fail — exact
comparison, never substring or suffix.

Pre-cutover check: `PARKIO_COMMUNITY_WRITE_ENV` must be `production` in
`wrangler.production.jsonc`. Absent would also resolve to production (the
deliberate fail-closed default), but be explicit.

Post-cutover, non-mutating:

```bash
# no Origin -> application-layer refusal, not an Access challenge
curl -s -X POST https://parkio.info/api/dining/ep-le-cellier/ratings/ \
  -H 'content-type: application/json' -d '{"overall":5}'
# expect: {"error":"forbidden_origin",...}

# foreign Origin
curl -s -X POST https://parkio.info/api/dining/ep-le-cellier/ratings/ \
  -H 'content-type: application/json' -H 'origin: https://attacker.example' -d '{"overall":5}'
# expect: {"error":"forbidden_origin",...}

# invalid bearer -> 401, never a fallback to the cookie path
curl -s -X POST https://parkio.info/api/dining/ep-le-cellier/ratings/ \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer v1.deadbeefdeadbeefdeadbeefdeadbeef.bogus' -d '{"overall":5}'
# expect: {"error":"invalid_credential",...}
```

---

## Requirement 4 — nothing from Preview reaches Production

Because Production uses a separate config file, leakage would have to be typed
in by hand. Verify each explicitly:

| Preview value | Must NOT appear in Production |
|---|---|
| Secret | the Preview `RATINGS_IDENTITY_SECRET` (generated 2026-09-12, `openssl rand -base64 48`) |
| D1 | `parkio-history-preview` / `3c3c7bf8-9ad9-44b6-94e8-9b5d663d4cf8` |
| Var | `PARKIO_COMMUNITY_WRITE_ENV=preview` |
| Namespaces | `2001` / `2002` |
| Hostname allowance | `parkio-preview.*.workers.dev` (inert at runtime, since it is preview-only) |
| Worker name | `parkio-preview` |

Mechanical pre-flight — must print nothing:

```bash
grep -nE '3c3c7bf8|parkio-history-preview|"preview"|200[12]|parkio-preview' wrangler.production.jsonc
```

And the secret must be installed to the `parkio` Worker only. Confirm by name,
never by value:

```bash
npx wrangler secret list --config wrangler.production.jsonc   # expect RATINGS_IDENTITY_SECRET
npx wrangler secret list                                       # Preview, separate secret
```

The two Workers share no secret store, so the Preview value cannot be read by
Production even by mistake.

---

## Requirement 5 — rollback restores Pages without touching Production D1

Rollback is a hostname move, not a data operation. **Both platforms bind the
same `parkio-history` database by id**, so no rating, no wait snapshot and no
schema is involved in rolling back. Nothing to restore, nothing to migrate.

Preconditions, all of which must hold before cutover is allowed:

1. The Pages project **still exists** with its Production deployment intact.
2. No Pages deployment has been deleted.
3. Production `RATINGS_IDENTITY_SECRET` is unchanged, so credentials keep
   validating on either platform.
4. `@cloudflare/next-on-pages` and the `build:cloudflare` script are still in
   the repo (they are, deliberately).

Procedure — minutes, not hours:

```bash
# 1. detach the custom domain from the Worker
npx wrangler domains remove parkio.info --config wrangler.production.jsonc   # confirm exact syntax at the time

# 2. re-attach parkio.info to the Pages project (dashboard: Pages > parkio > Custom domains)

# 3. verify
curl -s -o /dev/null -w '%{http_code}\n' https://parkio.info/                      # 200
curl -s https://parkio.info/api/dining/ratings/?venueKeys=ep-le-cellier            # 200
curl -s -X POST https://parkio.info/api/dining/ep-le-cellier/ratings/ \
  -H 'content-type: application/json' -d '{"overall":5}'                           # forbidden_origin
```

Then confirm Production D1 is untouched:

```sql
SELECT COUNT(*) FROM dining_ratings;    -- expect the same value as before rollback
SELECT COUNT(*) FROM wait_snapshots;    -- expect monotonic growth only
```

**Rollback trigger:** any failure in the post-cutover checks above, D1 write
errors, elevated Worker errors, or a static-content regression (a content page
returning something other than 200 with `x-nextjs-cache: HIT`).

**Cost of rollback:** losing the limiter until the next attempt. That is
acceptable — it is where Production sits today.

---

## Ordered cutover sequence

| # | Step | Reversible? |
|---|---|---|
| 1 | Re-verify Cloudflare Access on `*.parkio.pages.dev` | read-only |
| 2 | Create `wrangler.production.jsonc`; run `--dry-run`; check Requirement 1 and the Requirement 4 grep | yes |
| 3 | Deploy the `parkio` Worker **with no route** — `workers_dev: false`, no `routes` | yes |
| 4 | `wrangler secret put RATINGS_IDENTITY_SECRET` (Production value) | yes |
| 5 | Validate the Worker on a temporary route, non-mutating only | yes |
| 6 | Add `parkio.info` as a Worker Custom Domain; remove it from Pages | **yes, this is the cutover** |
| 7 | Run all post-cutover checks; watch `wrangler tail` | yes |
| 8 | Soak **≥ 7 days**. Keep Pages. Stop deploying to Pages | yes |
| 9 | Delete the Pages project — closes Requirement 2b | **NO — destructive, last** |

Step 9 is the only irreversible step and needs its own authorisation.

---

## What this plan does not claim

- Deterministic rate limiting. See the runbook: approximate burst protection.
- That historical pages.dev aliases are closed before step 9.
- That the limiter stops a distributed attacker. It is per-Cloudflare-location.
- That Preview validation predicts Production load. Preview saw single-client
  traffic; Workers Free allows 10 ms CPU per invocation and full SSR is only
  reached on cache misses, so CPU should be watched during soak.

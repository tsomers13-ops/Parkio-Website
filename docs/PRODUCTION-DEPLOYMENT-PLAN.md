# Production deployment plan — OpenNext Workers cutover

**Status: FOR REVIEW. Not authorised. Nothing in this document has been executed.**

Production is Cloudflare Pages, serving `parkio.info`. The Preview Worker
`parkio-preview` is deployed and validated (Gate 8B.8). This plan covers what
must be proven before `parkio.info` moves, and how to undo it.

- Rollback commit (last Pages-deployed Production commit): **`ce1ed15`**
- Implementation branch: `priority-9-gate-8b8-opennext-preview`
- The branch ships as **one unit** — OpenNext + Next 15 + React 19 + rate
  limiting were validated together in Preview and are not split for rollout.

Revision note: this supersedes the first draft, which contained a contradictory
staging sequence, an invalid rollback command, and a stale characterisation of
Cloudflare Access. Those are corrected below.

---

## 1. Configuration: one Production file, deployed only with `--config`

Production gets its own **`wrangler.production.jsonc`**, never the repo-root
`wrangler.jsonc` (which is Preview). Every Production command carries the flag:

```bash
npx wrangler deploy --config wrangler.production.jsonc
```

The reason is blunt: a bare, habitual `wrangler deploy` must be incapable of
touching Production. An `env.production` block inside the shared file would make
a forgotten flag deploy Production by accident.

### 1a. Staging form — canary hostname only

This is the file as it exists for Steps 3–6. **`parkio.info` appears nowhere in
it.** That absence is the mechanism that makes an accidental attachment
impossible: there is no command in the staging steps that names the live
hostname, so none can attach it.

```jsonc
{
  "name": "parkio",
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-09-11",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": { "directory": ".open-next/assets", "binding": "ASSETS" },

  "workers_dev": false,
  "preview_urls": false,
  "observability": { "enabled": true },

  // STAGING: canary hostname ONLY. Swapped in one reviewed change at Step 7.
  "routes": [
    { "pattern": "parkio-worker-canary.parkio.info", "custom_domain": true }
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

`PARKIO_COMMUNITY_WRITE_ENV` is **`production` from the very first canary
deploy** and never anything else. This is deliberate and is what makes the
canary meaningful: the Production host policy allows only `parkio.info` and
`www.parkio.info`, so **every sensitive write through the canary must fail
`forbidden_host`**. The canary exercises the real artifact under the real
policy, and proves the policy by being refused.

`RATINGS_IDENTITY_SECRET` is **not** in this file. It is installed once, by
hand, with the **Production** value:

```bash
npx wrangler secret put RATINGS_IDENTITY_SECRET --config wrangler.production.jsonc
```

Using the existing Production value is what keeps already-issued iOS Keychain
credentials valid: the signature is `HMAC(secret, "parkio-native-v1:" + raterId)`
and nothing about hosting enters it.

### 1b. Cutover form — the single reviewed change

At Step 7, exactly one hunk changes:

```diff
   "routes": [
-    { "pattern": "parkio-worker-canary.parkio.info", "custom_domain": true }
+    { "pattern": "parkio.info", "custom_domain": true }
   ],
```

Nothing else in the file may change in that commit. The diff is reviewed before
the deploy, not after.

### 1c. DNS side effects, stated honestly

A Workers Custom Domain on a zone Cloudflare already manages creates a proxied
DNS record for that hostname. So Step 3 **does add** a `parkio-worker-canary`
record to the `parkio.info` zone. That is an additive, reversible change to a
new subdomain; it does not alter the apex record, which continues to point at
Pages until Step 7. Removing the canary at Step 9 removes that record.

---

## 2. Requirement 1 — limiter bindings are attached to Production

**Before any deploy**, from wrangler itself rather than from reading the file:

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

**On the canary** (Step 5), the mint limiter can be exercised safely because
minting writes no D1 row — but note the host guard refuses minting on the canary
too, so the observable there is `forbidden_host`, not a 429. Binding *presence*
on the canary is therefore proved by the dry-run and by `wrangler tail`, not by
a canary 429.

**After cutover** (Step 8), on the live hostname, a back-to-back burst — because
approximate semantics only bite on bursts (see the rate-limit runbook):

```bash
U=""; for i in $(seq 1 8); do U="$U https://parkio.info/api/identity/anonymous/"; done
curl -s -D - -o /dev/null -X POST $U | grep -E '^HTTP/2|^cache-control'
```

Accept: a run of 201s then 429s, each 429 carrying `cache-control: no-store` and
the specified JSON.

> **"No 429 observed" is inconclusive.** It is not proof that rate limiting is
> broken, and it is not proof that it works. Retry as a tighter burst on one
> connection. Only a 429 with the correct contract is evidence.

Rating writes are **not** burst-tested in Production: that would manufacture real
ratings. Verify that binding by dry-run plus `wrangler tail` showing 429s in
organic traffic.

---

## 3. Requirement 2 — writes cannot bypass enforcement via pages.dev

Three hostname classes with genuinely different answers. Evidence below was
re-verified read-only on **2026-09-12** with non-mutating POSTs (no Origin, so
nothing is writable even if a request landed).

### 3a. `parkio.pages.dev` (the apex) — CLOSED by the application

The apex serves the Pages project's **latest** deployment, which is `ce1ed15`
and already contains the hostname guard from `2c32a22`.

Measured: `POST https://parkio.pages.dev/api/dining/ep-le-cellier/ratings/` →
**`403 {"error":"forbidden_host",...}`**, with **no Access headers**. The Access
wildcard `*.parkio.pages.dev` does **not** cover the apex; the application guard
is what protects it, and it does.

**Condition:** stop deploying to Pages after cutover. A future Pages build from a
branch lacking the guard would reopen this.

### 3b. Historical `<hash>.parkio.pages.dev` — currently blocked by Access

**Corrected from the previous draft.** The earlier text implied these aliases are
presently open to unauthenticated attackers. **That is not accurate.**

Current Access configuration (read-only audit):

- **One** active Access application: **`parkio - Cloudflare Pages`**
- Destination: **`*.parkio.pages.dev`**
- **One** `allow` policy, restricted to **`tsomers13@gmail.com`**

Measured 2026-09-12, anonymous and non-mutating:

| Hostname | Result |
|---|---|
| `9ca196f7.parkio.pages.dev` | **302 → cloudflareaccess.com**, `www-authenticate: Cloudflare-Access` |
| `c9597fdf.parkio.pages.dev` | **302 → cloudflareaccess.com** |
| `00000000.parkio.pages.dev` (nonexistent) | **302 → cloudflareaccess.com** |
| `parkio.pages.dev` (apex) | 403 `forbidden_host` — application guard, no Access |

The nonexistent-hostname result is the important one: Access matches on the
**hostname pattern**, not a registry of deployments, so aliases that do not yet
exist are covered too.

**Accurate statement:** Access currently blocks unauthenticated public access to
historical aliases. The residual exposure is a **dependency on configuration**,
not an open door — if that Access application were disabled, deleted, or its
policy widened, deployments predating `2c32a22` would again be reachable with a
baked Production D1 binding and no hostname guard and no limiter.

Deleting the Pages project removes those routes entirely and ends the dependency
on Access. That is Step 10 and is separately authorised.

**Re-verification is required immediately before cutover and at least weekly
throughout the soak**, using exactly the probes above. An earlier probe on
2026-09-11 returned `forbidden_origin` instead of an Access challenge and that
discrepancy was never explained — treat Access as something to re-check, not
something to assume.

### 3c. `*.workers.dev` — CLOSED by construction

`workers_dev: false` and `preview_urls: false` mean Production has no workers.dev
route at all. Independently, the host policy refuses a workers.dev host whenever
the environment is `production` — asserted by test, not assumed.

---

## 4. Requirement 3 — Production host and Origin policies stay restricted

| Layer | Environment-gated? | Production allows | Refuses |
|---|---|---|---|
| `lib/ratingsWriteHost.ts` | **Yes** | `parkio.info`, `www.parkio.info` (exact) | pages.dev, workers.dev, canary, localhost, lookalikes |
| `lib/ratingsOrigin.ts` | **No — see below** | production origins **plus** `*.parkio.pages.dev`, `parkio-preview.*.workers.dev`, localhost | other cross-site origins |

> **Correction (Gate 8B.9).** An earlier version of this table claimed the Origin
> guard allows only the two production origins in Production. **That is wrong.**
> `isAllowedWriteOrigin(origin)` takes no environment argument, so its
> preview branches are live in Production too — verified by direct probe:
> `isAllowedWriteOrigin("https://abc.parkio.pages.dev")` returns `true`
> regardless of `PARKIO_COMMUNITY_WRITE_ENV`.
>
> The Gate 8B.8 commit message said the fix "widened only the non-production
> sets". That is true of the **host** guard and **not** of the Origin guard,
> which has no per-environment set to widen.
>
> **Assessed impact: IMPORTANT, not a blocker.** The host guard runs first and
> still requires the request to arrive at `parkio.info`. `Origin` is a header,
> trivially set by any non-browser client, so it was never a boundary against a
> scripted attacker; its real job is browser CSRF, and the rater cookie is
> `SameSite=Lax`, which already blocks cross-site cookie attachment. The native
> bearer path skips the Origin check by design in any case. So this is a
> defence-in-depth inconsistency and a documentation error, not an exploitable
> hole — but it should be gated for consistency before or shortly after cutover,
> and the claim must not be repeated as written.

The Gate 8B.8 fix widened only the **non-production** sets. Tests assert a
workers.dev host is refused under `production`, `development` and `unknown`, and
that `parkio.info.attacker.example` and `attacker-parkio.info` fail — exact
comparison, never substring or suffix.

Note the canary hostname `parkio-worker-canary.parkio.info` is **not** in the
production allow-list and must never be added. Its refusal is the point.

**`www.parkio.info` needs no handling.** Checked 2026-09-12: it has **no DNS
record** and does not resolve, while the apex resolves and serves. It is present
in both allow-lists but is inert, and the Production config attaches only the
apex as a Custom Domain. If `www` is ever introduced it needs its own Custom
Domain entry; until then, do not add one.

Post-cutover, non-mutating:

```bash
curl -s -X POST https://parkio.info/api/dining/ep-le-cellier/ratings/ \
  -H 'content-type: application/json' -d '{"overall":5}'
# expect: {"error":"forbidden_origin",...}

curl -s -X POST https://parkio.info/api/dining/ep-le-cellier/ratings/ \
  -H 'content-type: application/json' -H 'origin: https://attacker.example' -d '{"overall":5}'
# expect: {"error":"forbidden_origin",...}

curl -s -X POST https://parkio.info/api/dining/ep-le-cellier/ratings/ \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer v1.deadbeefdeadbeefdeadbeefdeadbeef.bogus' -d '{"overall":5}'
# expect: {"error":"invalid_credential",...}
```

---

## 5. Requirement 4 — nothing from Preview reaches Production

| Preview value | Must NOT appear in Production |
|---|---|
| Secret | the Preview `RATINGS_IDENTITY_SECRET` (generated 2026-09-12) |
| D1 | `parkio-history-preview` / `3c3c7bf8-9ad9-44b6-94e8-9b5d663d4cf8` |
| Var | `PARKIO_COMMUNITY_WRITE_ENV=preview` |
| Namespaces | `2001` / `2002` |
| Hostname allowance | `parkio-preview.*.workers.dev` |
| Worker name | `parkio-preview` |

Mechanical pre-flight — **must print nothing**:

```bash
grep -nE '3c3c7bf8|parkio-history-preview|"preview"|200[12]|parkio-preview' \
  wrangler.production.jsonc
```

Secret installed to the `parkio` Worker only; confirm by name, never by value:

```bash
npx wrangler secret list --config wrangler.production.jsonc   # expect RATINGS_IDENTITY_SECRET
npx wrangler secret list                                       # Preview, separate store
```

The two Workers have separate secret stores, so the Preview value cannot be read
by Production even by mistake.

---

## 6. Go / no-go gates

Each is a hard stop. None is advisory.

| # | Gate | Stop condition |
|---|---|---|
| G1 | Canary validation complete | Any canary check fails → **do not swap the route** |
| G2 | Sensitive writes on canary | **Any successful sensitive write on the canary is an immediate STOP.** It means the Production host policy is not what this plan assumes. Do not proceed, do not swap; investigate |
| G3 | Preview leakage | Any Preview identifier, D1 id, namespace, hostname allowance, Worker name or secret name in the Production configuration is an **immediate STOP** |
| G4 | Rate-limit evidence | **"No 429 observed" is inconclusive** — never record it as a pass. Only a 429 with the correct JSON and `cache-control: no-store` counts |
| G5 | Access re-verified | Historical aliases must return a Cloudflare Access 302 immediately before cutover |
| G6 | Config diff | The route swap commit must contain **only** the `routes` hunk |
| G7 | Pages deletion | Separately authorised, destructive, after the soak, and after Gate G8 |
| G8 | Worker rollback tested | Worker-version rollback must have been **exercised at least once**, and build/config artifacts proven recoverable, **before** Pages deletion may be authorised |

---

## 7. Ordered cutover sequence

| # | Step | Reversible? |
|---|---|---|
| 1 | Re-verify Access on `*.parkio.pages.dev` (G5) | read-only |
| 2 | Create `wrangler.production.jsonc` in **staging form** (canary route only). Run `--dry-run` (Req 1) and the leakage grep (G3) | yes |
| 3 | Deploy the `parkio` Worker on the **canary hostname only**. Adds a `parkio-worker-canary` DNS record; apex untouched | yes |
| 4 | `wrangler secret put RATINGS_IDENTITY_SECRET` (Production value) | yes |
| 5 | **Canary validation** — full checklist in §8. Non-mutating only | read-only |
| 6 | Gates G1–G5. Any failure stops here | — |
| 7 | **Route swap** — see §7a. Pages must release `parkio.info` **first**; the two cannot hold it simultaneously. Brief outage window | **yes — this is the cutover** |
| 8 | Post-cutover checks (Req 1 burst, Req 3 guards, static parity). Watch `wrangler tail` | yes |
| 9 | Remove the canary custom domain and its DNS record. Soak **≥ 7 days**, Pages retained and no longer deployed to. Re-verify Access weekly. Exercise Worker-version rollback once (G8) | yes |
| 10 | **Delete the Pages project** — closes §3b permanently | **NO — destructive, separately authorised** |

Steps 1–9 are reversible. Step 10 is not, and **no authorisation for it is
requested here.**

### 7a. Step 7 in detail — ordering is forced by Cloudflare, and there is an outage window

**Correction (Gate 8B.9).** The earlier wording — "add `parkio.info` as a Worker
Custom Domain; remove it from Pages" — is the wrong order and is not possible.
Cloudflare documents that you **cannot create a Custom Domain on a hostname with
an existing DNS record**, and the Pages custom domain owns exactly such a record.
The attach is rejected, not queued, and not silently overwritten.

So the real order is forced, and it has a gap in it:

1. Pages → `parkio` → Custom domains → **remove `parkio.info`**.
2. Deploy the Worker with the cutover-form config (`routes: parkio.info`), or add
   the Custom Domain in the dashboard.
3. Wait for the certificate to issue and the record to become active.

**Between 1 and 3, `parkio.info` does not serve.** That window is short — DNS is
Cloudflare-managed and the certificate is usually already provisioned for the
zone — but it is real and must not be described as zero-downtime. Schedule it at
low traffic, and have step 1 of §9 ready to reverse it.

Mitigation that shortens the window: the canary (Steps 3–6) has already proven
the exact artifact, so step 2 is a configuration change on a Worker known to be
healthy, not a first deploy.

---

## 8. Canary validation checklist (Step 5)

Against `https://parkio-worker-canary.parkio.info`. This validates the **exact
Production Worker artifact** — same bundle, same bindings, same Production D1,
same Production secret — on a hostname that carries no write authority.

**No check writes a rating.** `dining_ratings` is read-only for the entire step.
One exception is called out below and is not a rating: `/api/parks/{slug}/live/`
appends wait snapshots on a cache miss, exactly as live Pages traffic already
does. Record counts before and after so the growth is attributable.

### Static assets and SSR

| Check | Expect |
|---|---|
| `/` | 200, `x-nextjs-cache: HIT` |
| one guide page | 200, HIT |
| one park landing page | 200, HIT |
| one attraction detail page | 200, HIT |
| `/parks/epcot/dining/` | 200, HIT |
| `/parks/epcot/dining/ep-le-cellier/` | 200, HIT, correct `<title>` |
| `/feed.xml` | 200, valid RSS |
| `/icon/`, `/opengraph-image/` | 200 `image/png` |
| CSS/JS/font assets | 200 |
| `/definitely-not-a-page/` | 404 |

### Public GET APIs against Production D1

| Check | Expect |
|---|---|
| `GET /api/dining/ratings/?venueKeys=…` | 200; counts match Production D1 exactly |
| `GET /api/dining/{venueKey}/ratings/` | 200 |
| `GET /api/dining/{venueKey}/ratings/me/` | 200, `rating: null` without a cookie |
| `GET /api/parks/epcot/live/` | 200 |
| Cache headers on aggregates | `public, s-maxage=60, stale-while-revalidate=120` |

Cross-check the aggregate counts against a direct D1 read. Equality proves the
canary is bound to Production D1 and reading it correctly.

### Sensitive writes — must all be refused

| Check | Expect |
|---|---|
| `POST /api/identity/anonymous/` | **403 `forbidden_host`** |
| `POST …/ratings/` with canary Origin | **403 `forbidden_host`** |
| `POST …/ratings/` no Origin | **403 `forbidden_host`** |
| `POST …/ratings/` with a valid Production bearer | **403 `forbidden_host`** |

> **G2: any 2xx here is an immediate stop.** The host guard runs before Origin,
> bearer and validation, so a success means the Production policy is not what
> this plan assumes.

### Bindings, observability, data safety

| Check | Expect |
|---|---|
| `wrangler tail` during the above | requests visible; no secret and no raw IP in output |
| Production `dining_ratings` before/after Step 5 | **unchanged** |
| Production `wait_snapshots` before/after | unchanged except organic growth from live Pages traffic |
| Worker startup time / CPU in tail | within Free-plan 10 ms per invocation on cached paths |

The `/api/parks/{slug}/live/` exception, in full: on a cache miss it appends to
**Production** `wait_snapshots` — the same table live Pages traffic already
writes, via the same request-path writer. It is benign and indistinguishable
from organic ingestion. It is disclosed here rather than buried because "the
canary is read-only" would otherwise be untrue. If even that is unwanted, skip
the live-waits check; everything else in this checklist stays valid.

---

## 8a. Post-cutover validation matrix (Step 8)

**Added in the Gate 8B.9 second pass.** The plan previously reduced Step 8 to one
table cell — "Req 1 burst, Req 3 guards, static parity" — with the detail
scattered. That was not a runnable checklist. This is.

Run against `https://parkio.info` **immediately after the route swap**, in this
order. Every row is non-mutating for `dining_ratings`.

### Static and cache parity

| # | Path | Expect | Side effect | Rollback significance |
|---|---|---|---|---|
| S1 | `/` | 200, `x-nextjs-cache: HIT`, `s-maxage=31536000` | none | **Critical** — a MISS here means prerender output is not being served; roll back |
| S2 | one `/guide/<slug>/` | 200, HIT | none | Critical — SSG family broken |
| S3 | one `/parks/<park>/` | 200, HIT | none | Critical |
| S4 | one `/parks/<park>/attractions/<slug>/` | 200, HIT | none | Critical |
| S5 | `/parks/epcot/dining/` | 200, HIT | none | Critical |
| S6 | `/parks/epcot/dining/ep-le-cellier/` | 200, HIT, correct `<title>` | none | Critical |
| S7 | `/feed.xml` | 200, valid RSS | none | High — breaks the email pipeline |
| S8 | `/icon/`, `/opengraph-image/` | 200 `image/png` | none | Medium — metadata only |
| S9 | one CSS and one JS asset | 200 | none | Critical — a failure here breaks every page |

A single MISS on S1–S6 is enough to roll back: it means `populateCache` did not
run or did not upload, and every page is being server-rendered uncached.

### Public GET APIs

| # | Endpoint | Method | Expect | Side effect | Rollback significance |
|---|---|---|---|---|---|
| A1 | `/api/dining/ratings/?venueKeys=…` | GET | 200, `public, s-maxage=60, stale-while-revalidate=120` | none | **Critical** — Dining discovery depends on it |
| A2 | `/api/dining/{venueKey}/ratings/` | GET | 200, counts equal a direct D1 read | none | Critical — proves the Production D1 binding |
| A3 | `/api/dining/{venueKey}/ratings/me/` | GET, no cookie | 200, `rating: null` | none, no `Set-Cookie` | High — a `Set-Cookie` here is a defect |
| A4 | `/api/parks/{slug}/live/` | GET | 200 | **appends `wait_snapshots` on a cache miss** — see §8b | Medium |
| A5 | `/definitely-not-a-page/` | GET | 404 | none | Low |

A2 is the load-bearing one: equality with a direct D1 read is what proves the
Worker is bound to Production D1 and not to something else.

### Safe-negative POSTs — all must be refused before D1

| # | Endpoint | Request | Expect | Side effect | Rollback significance |
|---|---|---|---|---|---|
| N1 | `…/ratings/` | POST, no Origin | 403 `forbidden_origin` | none | **Critical** — a 2xx means CSRF protection is gone |
| N2 | `…/ratings/` | POST, `Origin: https://attacker.example` | 403 `forbidden_origin` | none | Critical |
| N3 | `…/ratings/` | POST, `Authorization: Bearer v1.dead…beef.bogus` | 401 `invalid_credential` | none | Critical — a 2xx means signature verification is broken |
| N4 | `…/ratings/` | POST via `parkio.pages.dev` | 403 `forbidden_host` | none | Critical — the pages.dev bypass is open |
| N5 | `/api/identity/anonymous/` | POST ×8 back-to-back | run of 201s then 429 with `cache-control: no-store` | mints credentials, **no D1 row** | High — see G4, "no 429" is inconclusive |

**No successful rating POST is performed at any point.** N1–N4 are guaranteed
pre-mutation failures. N5 is the only Production write-path call, it is stateless,
and it is kept to a single burst.

### Immediately after the matrix

```sql
SELECT COUNT(*) FROM dining_ratings;   -- MUST still be 0
```

Non-zero means something wrote a rating. Stop and investigate before proceeding
to soak.

---

## 8b. Wait-snapshot accounting across cutover

**Added in the Gate 8B.9 second pass.** `wait_snapshots` is the one table that
legitimately grows during validation, so validation-induced rows must be
distinguishable from organic traffic rather than merely tolerated.

`/api/parks/{slug}/live/` appends a row per attraction on a cache miss (5-minute
in-memory TTL per isolate). Organic traffic already does this continuously —
5125 rows as of 2026-09-11, newest `2026-09-11T09:58:29Z`.

Record at three points:

```sql
SELECT COUNT(*) AS n, MAX(taken_at) AS newest FROM wait_snapshots;
```

| When | Purpose |
|---|---|
| Before canary Step 5 | baseline |
| After canary Step 5 | canary-attributable growth (canary hits Production D1) |
| Before and after Step 8 (A4) | cutover-attributable growth |

Expected growth per live call is **one row per attraction in that park** (11 for
EPCOT, 19 for Magic Kingdom, as measured). Anything materially larger means the
cache is not working and the route is writing on every request — worth
investigating, though not itself a rollback trigger.

`dining_ratings`, by contrast, must be **exactly 0** at every checkpoint. Those
two tables are held to different standards deliberately, and the difference
should not be blurred.

---

## 9. Rollback — Phase 1: during the soak, before Pages deletion

**Available only while the Pages project still exists (Steps 7–9).**

### Prerequisites

1. The Pages project exists with its Production deployment intact.
2. No Pages deployment has been deleted.
3. Production `RATINGS_IDENTITY_SECRET` unchanged, so credentials validate on
   either platform.
4. **The published Pages deployment still exists.** Tag
   `pages-production-pre-workers` (`6fb57fa`) is a *source-code* recovery point,
   **not** this prerequisite — see §13. Note this is *not* a
   "can we rebuild Pages" prerequisite: `build:cloudflare` is retained but does
   **not** work on this branch (next-on-pages fails ERESOLVE against React 19 —
   Gate 8B.5). Phase 1 rollback depends on the already-published deployment
   remaining published. Deleting Pages deployments therefore removes rollback.

### Procedure

There is **no `wrangler domains` command** — the previous draft was wrong about
this. Workers Custom Domains are declared in `routes` and managed in the
dashboard. Do both, in this order:

1. **Dashboard** — Workers & Pages → `parkio` → Settings → Domains & Routes →
   remove the `parkio.info` custom domain. This is the authoritative action.
2. **Dashboard** — Pages → `parkio` → Custom domains → re-add `parkio.info`.
3. **Repo** — revert the Step 7 route hunk so a later deploy cannot re-attach it.

### Verification

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://parkio.info/                    # 200
curl -s https://parkio.info/api/dining/ratings/?venueKeys=ep-le-cellier          # 200
curl -s -X POST https://parkio.info/api/dining/ep-le-cellier/ratings/ \
  -H 'content-type: application/json' -d '{"overall":5}'                          # forbidden_origin
```

```sql
SELECT COUNT(*) FROM dining_ratings;    -- unchanged from before rollback
SELECT COUNT(*) FROM wait_snapshots;    -- monotonic growth only
```

### Limitations

- **No data operation is involved.** Both platforms bind the same
  `parkio-history` database by id, so there is nothing to migrate or restore.
- DNS/edge propagation means a brief window where either platform may answer.
- Cost of rollback: losing the limiter until the next attempt — which is where
  Production sits today, so acceptable.

---

## 10. Rollback — Phase 2: after Pages deletion

**Once Step 10 is executed, Phase 1 no longer exists.** There is no Pages project
to move the hostname back to. Do not plan around it, and do not describe Pages
rollback as available after Step 10.

The only immediate rollback is to a **known-good previous Worker version**.

### Prerequisites — all required *before* Pages deletion is authorised (G8)

1. **Worker-version rollback exercised at least once** during the soak, on the
   live Worker, and verified. Not read about — performed.
2. The known-good version id recorded, from:
   ```bash
   npx wrangler versions list --config wrangler.production.jsonc
   ```
3. **Build artifacts recoverable**: the exact commit rebuilds reproducibly —
   `npm ci` from the committed lockfile, `npm run build`,
   `opennextjs-cloudflare build`, `populateCache`.
4. **Configuration recoverable**: `wrangler.production.jsonc` is committed.
5. **Secret recoverable**: the Production `RATINGS_IDENTITY_SECRET` value is held
   somewhere outside Cloudflare. Wrangler cannot read a secret back — if the only
   copy is in the Worker, a rebuild-from-scratch cannot restore it and every
   existing iOS credential breaks. Confirm this before Step 10.

### Procedure

```bash
npx wrangler versions list --config wrangler.production.jsonc
npx wrangler rollback <version-id> --config wrangler.production.jsonc
```

Or a full redeploy from the known-good commit if the version is unavailable:

```bash
git checkout <known-good-commit>
npm ci && npm run cf:types && npm run build
npx opennextjs-cloudflare build && npx opennextjs-cloudflare populateCache remote
npx wrangler deploy --config wrangler.production.jsonc
```

### Verification

Same checks as Phase 1, plus confirm the served version:

```bash
npx wrangler deployments list --config wrangler.production.jsonc
```

### Limitations — state these plainly

- **Rolls back code only.** The custom domain, DNS and D1 are unchanged.
- **Cannot recover from a D1 data problem.** Worker rollback does not restore
  data; D1 point-in-time recovery is a separate mechanism and is not covered by
  this plan.
- **Cannot undo Pages deletion.** Recreating the project would mean a new
  project, new deployments, and a fresh custom-domain attach — hours, not
  minutes, and the historical aliases would not come back (which is the point).
- Rollback to a version predating a binding change may fail if the binding no
  longer exists. Keep binding changes and code changes in separate deploys.

---

## 11. Soak plan and monitoring

**Added in the Gate 8B.9 second pass.** Soak previously existed only as words in
one table cell. What to watch was never written down, which makes "soak passed"
unfalsifiable.

**Duration: ≥ 7 days**, covering a full weekly traffic cycle and at least seven
`parkio-daily` runs — the daily job is the thing most likely to break silently
after cutover, so it must be observed succeeding end-to-end more than once.

Pages stays intact and is no longer deployed to. **Do not delete Pages during
soak.**

### What to monitor, and what should trigger action

| Signal | Source | Healthy | Investigate | Roll back |
|---|---|---|---|---|
| HTTP 5xx | Worker observability | ~0 | any sustained | >1% of requests |
| API error rate | `wrangler tail`, 5xx on `/api/*` | ~0 | isolated | sustained on any endpoint |
| **429s** | tail, filtered on `rate_limited` | rare, bursty | steady low rate | broad 429s on normal traffic |
| Worker CPU | observability | well under 10 ms on cached paths | approaching 10 ms | sustained limit errors |
| Worker requests | observability | tracks prior Pages traffic | large drop = routing problem | — |
| Static cache | spot-check `x-nextjs-cache` | HIT | intermittent MISS | broad MISS |
| D1 errors | tail | none | any | sustained |
| Rating writes | `SELECT COUNT(*) FROM dining_ratings` | grows only from real guests | unexplained jumps | — |
| Identity mint failures | tail on `identity_unavailable` | none | any (suggests secret problem) | sustained |
| Live wait route | §8b counts | steady organic growth | flat (ingestion stopped) | — |
| **Daily content** | site shows today's guide | present each morning | **missing once** | — |
| User-visible regressions | manual spot-check | none | any | material |

### 429 alerting

Worth adding for Production specifically, because the limiter is approximate and
a misconfiguration is otherwise silent in both directions:

- **Zero 429s across the whole soak** is suspicious, not reassuring — it may mean
  the binding is absent and the code is failing open (both fail-open cases are
  documented and deliberate). Confirm with a deliberate burst rather than
  assuming.
- **429s on ordinary traffic** means the threshold is biting real guests.
  Investigate before considering a threshold change; thresholds are fixed by the
  accepted Gate 8B criteria and must not be lowered casually.

### Exit criteria

Soak passes only when all of the following hold:

1. No rollback triggered.
2. `parkio-daily` has run green **and** its content is visible on the live site,
   at least 7 times.
3. Worker-version rollback exercised once and verified (G8).
4. Production secret confirmed recoverable from outside Cloudflare (§10 Phase 2).
5. Access on `*.parkio.pages.dev` re-verified weekly.

Only then may Pages deletion be **proposed** — it remains separately authorised.

---

## 12. Production deployment pipeline — IMPLEMENTED (Gate 8B.9A)

Previously a blocker: nothing would have deployed the Worker after cutover, so
the daily job would have kept committing and kept reporting success over a
progressively staler site. Now built.

### The mechanism that made this necessary

GitHub does not run workflows for pushes made with the default `GITHUB_TOKEN` —
*"events triggered by the `GITHUB_TOKEN` will not create a new workflow run"*.
`parkio-daily.yml` pushes with exactly that token. So a plain `on: push` deploy
workflow would **never fire for daily content**. This was verified against the
GitHub documentation rather than assumed, because the failure it produces is
silent.

### Canonical path: `.github/workflows/workers-production.yml`

**One** workflow deploys Production. Both normal application changes and daily
content go through it — there is deliberately no second way.

| Entry point | Fires for | Why it cannot double-fire |
|---|---|---|
| `on: push: branches: [main]` | human merges and direct pushes | GITHUB_TOKEN pushes do not raise `push` |
| `on: workflow_call` | invoked by `parkio-daily.yml` | only the daily job calls it |
| `on: workflow_dispatch` | manual re-run | operator-initiated |

`paths-ignore` skips `docs/**` and `**/*.md`, so documentation commits do not
deploy.

Build chain, in order: Node **22** → `npm ci` → `npm run cf:types` → `npm test`
→ `npx tsc --noEmit` → `npm run build` → `opennextjs-cloudflare build` →
**`populateCache remote`** → config verification → `wrangler deploy --config
wrangler.production.jsonc`.

Two guards that are not decoration:

- **Ancestry check.** The run fails unless `HEAD` is an ancestor of
  `origin/main`, so `workflow_dispatch` from a feature branch cannot deploy
  Production.
- **Config verification.** Comments are stripped, then the file is searched for
  Preview identifiers (`3c3c7bf8`, `parkio-history-preview`, `"preview"`,
  `2001/2002`, `parkio-preview`) and required to contain the Production D1 id.
  Any hit fails the run before `wrangler deploy`. Stripping comments first
  matters: the config's own commentary mentions Preview, and matching raw text
  false-positives — which it did on the first attempt.

### Exact SHA, never a moving ref

`actions/checkout` uses `inputs.sha || github.sha`. For the daily path the
caller passes the SHA it just pushed, so what deploys is exactly what was
committed — not whatever `main` happens to be by the time the runner starts.

### Daily integration: `.github/workflows/parkio-daily.yml`

The `build` job now exposes `pushed` and `sha` outputs. A second job:

```yaml
deploy:
  needs: build
  if: needs.build.outputs.pushed == 'true'
  uses: ./.github/workflows/workers-production.yml
  with:  { sha: ${{ needs.build.outputs.sha }} }
  secrets: { CLOUDFLARE_API_TOKEN: ..., CLOUDFLARE_ACCOUNT_ID: ... }
```

A no-change day sets `pushed=false` and deploys nothing.

### Failure behaviour

The deploy is a job **inside the daily run**, not a detached trigger. If the
deploy fails the daily run goes **red**. The previous shape — content committed,
publication silently absent, workflow green — is no longer reachable.

A failed deploy leaves the previously deployed Worker version serving.

### Concurrency

`group: workers-production`, `cancel-in-progress: true`. A newer main commit
supersedes an older in-flight deploy, so the newest valid commit wins rather
than an older build landing last. Cancelling mid-run is safe: `wrangler deploy`
only becomes live once the upload completes, so a partial upload never takes
traffic.

### Required GitHub configuration — NOT yet in place

These are dashboard actions and are **not** complete:

| Item | Detail |
|---|---|
| Secret `CLOUDFLARE_API_TOKEN` | Minimum scopes: **Workers Scripts: Edit** (deploy), **Workers R2/D1 as used → D1: Edit** (populateCache/bindings), **Account Settings: Read** (account resolution). Not the Wrangler OAuth token — mint a scoped API token |
| Secret `CLOUDFLARE_ACCOUNT_ID` | `5b406b870dcc68d52096953409183716` (not a secret in the strict sense; kept as one for symmetry) |
| Environment `production` | Referenced by the deploy job. Create it, attach both secrets, and add required reviewers so a Production deploy needs human approval |

Until the environment and secrets exist the workflow will fail at the deploy
step — visibly, which is the correct failure mode.

## 13. Rollback baseline and branch strategy — TAG CREATED (Gate 8B.9A)

### The baseline was not where the plan said it was

Earlier documents named **`ce1ed15`** as the Pages rollback baseline. By the
time of tagging that was **a day stale**, and tagging it blindly would have
created a recovery point that did not match what was live.

Verified against the running site rather than against a previous prompt:

| Evidence | Result |
|---|---|
| `origin/main` | **`6fb57fa`** "Parkio Daily — 2026-09-12" |
| Live `parkio.info/guide/` | lists **`parkio-daily-2026-09-12`** |
| `/guide/parkio-daily-2026-09-12/` | **200** |
| That content file in `ce1ed15` | **absent** |
| That content file in `6fb57fa` | present |

So the published Pages deployment is built from `6fb57fa`.

### The tag

```
pages-production-pre-workers  ->  6fb57fa
```

Annotated, not lightweight. Created with no force, into a repository that
previously had **zero tags**. **Pushed to origin** and confirmed present there,
so it survives loss of this machine. The branch itself remains unpushed.

The annotation records what the tag is and — more usefully — what it is not.

### The baseline moves daily

`parkio-daily.yml` advances `main` every morning, so the "current Pages
baseline" is a moving target until cutover. **Immediately before cutover, cut a
fresh tag at whatever `main` is then.** Add a new tag; never force-move this
one. This tag captures the Pages-era dependency state, which is what matters for
a disaster rebuild, and that does not change daily.

### Merge sequence

| # | Action | Why |
|---|---|---|
| 1 | ✅ Tag the verified baseline | **Done** |
| 2 | ✅ Add the Production deploy workflow | **Done** — must exist before main can deploy the Worker |
| 3 | Create the `production` environment and secrets | Dashboard; workflow fails visibly without them |
| 4 | Validate the Production Worker **from the branch** via the canary | Proves the artifact before `main` changes |
| 5 | Merge to `main` after canary validation, before the route swap | So the cutover serves a Worker built from `main`, and later daily commits deploy the same lineage |
| 6 | Route swap (§7a) | Cutover |
| 7 | Keep the Pages project and its published deployment untouched through soak | The only Phase 1 rollback |

**`main` stops being the Pages baseline at step 5.** From then the Pages project
is a frozen artifact: after the merge its builds will **fail**, because
next-on-pages cannot resolve against React 19. That is expected and harmless —
the previously published deployment stays live and remains the rollback target.

## 14. GO / NO-GO checklist

Every line must be GO. Any NO-GO stops the cutover.

| # | Item | Evidence required |
|---|---|---|
| 1 | Production Worker config correct | `--dry-run` prints all five bindings; leakage grep silent |
| 2 | Production D1 bound | `env.DB (parkio-history)`; canary aggregate counts equal a direct D1 read |
| 3 | Production secret continuity | Production value installed on the `parkio` Worker; **not** the Preview value; a copy exists outside Cloudflare |
| 4 | Hostname policy | Production allows only `parkio.info` / `www.parkio.info`; canary write refused `forbidden_host` |
| 5 | Origin policy | Understood and documented — **not** environment-gated (§4). Accepted or fixed, but not misstated |
| 6 | Static cache | All nine route families 200 with `x-nextjs-cache: HIT` |
| 7 | API health | Validation matrix green, no successful Production rating write |
| 8 | iOS compatibility | No iOS change required; hostname, paths and secret unchanged |
| 9 | Limiter bindings | Both present at 5/60 and 10/60, namespaces 1001/1002 |
| 10 | **Daily deploy workflow** | Workflow **exists** (§12). Still required: `production` environment + both secrets created, and **one green end-to-end run** proving a main commit reaches the Worker |
| 11 | Pages rollback | Project and published deployment intact; baseline tagged — `pages-production-pre-workers` → `6fb57fa`, pushed. **Re-tag at whatever `main` is immediately before cutover** |
| 12 | Monitoring | 5xx, 429, CPU, D1 error alerting in place for soak |
| 13 | Access protection | Historical aliases return a Cloudflare Access 302 |
| 14 | Zero synthetic Production ratings | `dining_ratings` = 0 immediately before and after cutover |

---

## 15. Remaining irreversible actions

Exactly one: **Step 10, deleting the Pages project.**

It is gated behind G7 and G8, occurs after the soak, and **is not authorised by
this document.** No authorisation for it is being requested here.

Everything else — canary deploy, secret install, route swap, canary removal — is
reversible by the procedures above.

---

## 16. What this plan does not claim

- Deterministic rate limiting. See the runbook: approximate burst protection,
  per-Cloudflare-location, permissive and eventually consistent.
- That historical pages.dev aliases are open today — **they are not**; Access
  currently challenges them. What remains is a dependency on that configuration.
- That the limiter stops a distributed attacker.
- That Preview validation predicts Production load. Preview saw single-client
  traffic; watch CPU during soak.
- That any of this has been executed. It has not.

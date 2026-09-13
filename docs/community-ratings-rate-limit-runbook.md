# Community Ratings — edge rate limiting runbook

**Status: NOT APPLIED.** This document describes rules to be configured in the
Cloudflare dashboard. Nothing here is active, and nothing in this repository
can activate it — Parkio has no `wrangler.toml`, no `_headers`, no
`_middleware`, and no application-level rate limiting.

**Measured 2026-09-10 (Gate 8B), against the Preview deployment:**

| Probe | Requests | Result |
|---|---|---|
| `POST /api/identity/anonymous/` | 12 back to back | **all 201** — no throttling |
| `POST /api/dining/ep-le-cellier/ratings/`, no Origin | 15 back to back | **all 403** — no throttling |
| `POST /api/dining/ep-le-cellier/ratings/`, junk bearer | 10 back to back | **all 401** — no throttling |

Not one `429`. The application guards (Origin, bearer signature) behave
correctly and consistently, but there is no request-rate control in front of
them. The probes were chosen so that every request was either rejected or
wrote nothing: identity minting creates no database row, and the rating POSTs
were all rejected before reaching D1. `dining_ratings` stayed at 0 throughout.

## Why this exists

The Gate 8 audit found that the rating write path has no throttling of any
kind:

- `POST /api/identity/anonymous/` is stateless, unauthenticated, writes no
  database row, requires no Origin, and is unlimited. Minting a valid
  anonymous credential costs one HTTP request.
- `POST /api/dining/[venueKey]/ratings/` accepts any valid credential and
  performs one D1 upsert. There is no per-identity or per-IP limit.

Bayesian shrinkage (`lib/ratingsRanking.ts`) makes fabricated ratings
*linearly* more expensive — roughly 8 to 10 fabricated five-star ratings to
outrank a well-supported venue. It does not make them hard. **Shrinkage is a
statistics control, not an abuse control.**

That gap does not matter while ratings are display-only, because there is
nothing to win. It matters the moment ranking is exposed, because a "Top
Rated" list is a prize. **These rules are therefore a precondition for Gate 8C,
not an optional hardening pass.**

## Rule 1 — rating writes

| | |
|---|---|
| Path family | `POST /api/dining/*/ratings/` |
| Starting recommendation | ~10 requests per minute per source IP |
| Action | rate-limit, challenge, or block — whichever the account's plan offers |

A genuine guest rates a handful of venues in a sitting. Ten per minute is
generous for a human and hostile to a script.

Do not throttle `GET` on this path family: the public aggregate is cached,
unauthenticated, and read by every discovery page load.

## Rule 2 — native identity minting

| | |
|---|---|
| Path | `POST /api/identity/anonymous/` |
| Starting recommendation | ~5 requests per minute per source IP |
| Action | as above |

A real installation mints once, ever, and keeps the credential in the
Keychain. Repeated minting from one address is only useful for accumulating
voting identities.

## What these rules are and are not

- They are **starting controls**, chosen from first principles rather than
  observed traffic. Revisit once there is real volume to measure.
- They are **not identity proof**. They raise the cost of bulk abuse; they do
  not establish that a rater is a distinct human.
- **A distributed attack across many IPs remains possible.** Anything stronger
  needs accounts, attestation or a challenge, all of which were deliberately
  deferred.
- **Parkio persists no raw IP address.** Enforcement happens at the Cloudflare
  edge against the connecting address; the `dining_ratings` table has no IP
  column and must not gain one.
- Rate limiting is orthogonal to the trust model. Keep both.

## Ready-to-apply configuration

Expressions are written in Cloudflare's Rules language. **Confirm the account's
rate-limiting product and action set before relying on them** — plan tiers
differ in what exists and how it is expressed.

### Rule 1 — rating writes

```
(http.request.method eq "POST"
 and starts_with(http.request.uri.path, "/api/dining/")
 and ends_with(http.request.uri.path, "/ratings/")
 and http.request.uri.path ne "/api/dining/ratings/")
```

| Setting | Value |
|---|---|
| Counting characteristic | IP address |
| Period | 60 seconds |
| Requests | 10 |
| Action | Block (`429`) if available, otherwise Managed Challenge |

The final clause excludes `/api/dining/ratings/`, the bulk read endpoint,
which also starts with `/api/dining/` and ends with `/ratings/`. It is GET-only
so a POST there is already a 405, but excluding it keeps the rule honest about
what it targets.

`POST .../ratings/me/` is deliberately **not** matched — `/me` is read-only.

### Rule 2 — native identity minting

```
(http.request.method eq "POST"
 and http.request.uri.path eq "/api/identity/anonymous/")
```

| Setting | Value |
|---|---|
| Counting characteristic | IP address |
| Period | 60 seconds |
| Requests | 5 |
| Action | Block (`429`) if available, otherwise Managed Challenge |

Both rules are **method-scoped to POST**. No GET is matched, so the public
aggregate, the bulk discovery read and `/me` are untouched — that matters,
because every Dining discovery page load performs a bulk read.

## Scoping reality: the pages.dev bypass

Worth settling before applying anything, because it decides whether "Preview
first" is even possible.

- `parkio.info` is a customer zone, so zone-level rules can be applied to it.
  Release builds of the iOS app point at `https://parkio.info`, and the website
  is served from it, so this is where real traffic lives.
- **`*.pages.dev` is Cloudflare's own zone, not the customer's.** Preview
  deployments (`preview-*.parkio.pages.dev`) and the Pages production alias
  (`parkio.pages.dev`) live there. Zone rules on `parkio.info` therefore may
  not be applicable to them.

Two consequences, both real:

1. **Preview may not be protectable by the same mechanism**, so validating on
   Preview before Production may be impossible. Confirm in the dashboard.
2. **`parkio.pages.dev` may remain an unprotected route to the same
   Production database.** A rule on `parkio.info` alone would be bypassed by
   anyone posting to the Pages alias directly. Decide explicitly whether to
   block or challenge direct `pages.dev` access, or to accept it as a known
   bypass and record it.

Do not skip this. A rule that protects only the custom domain, while the
Pages alias answers the same writes, is a rule that mostly protects nothing.

## Retesting safely

Reuse the Gate 8B probes — they prove enforcement without writing any data:

- **Identity:** repeat `POST /api/identity/anonymous/` past the threshold.
  Minting writes no database row, so this is safe to run against either
  environment.
- **Rating writes:** repeat `POST /api/dining/<venueKey>/ratings/` with **no
  Origin header and no credential**. Every request is rejected with 403 before
  reaching D1, but an edge rate limit counts requests rather than successes,
  so a `429` will still appear once the threshold is crossed.

Afterwards confirm `ratingCount` is unchanged on the venue used.

Never test enforcement by submitting real ratings.

## Rollback

Disable, don't delete — a disabled rule keeps its expression for diagnosis.

| Symptom | Action |
|---|---|
| Legitimate iOS guests receive 429 while rating normally | Disable Rule 1, raise the threshold, re-enable |
| Browser submissions fail under ordinary use | As above |
| GET traffic is being matched (discovery pages slow or failing) | Disable immediately — the method condition is wrong |
| Preview deployment workflow breaks | Disable both rules; confirm scope did not capture CI |

Recovery check after disabling: run the two probes above and confirm the
statuses return to 201 / 403 with no 429, and that a legitimate rating
submission still succeeds end to end.

## Before activating

Verify against the actual Cloudflare account, because plan tiers differ in
which of these exist and how they are expressed:

1. Confirm which rate-limiting product the plan provides, and its real
   granularity (path matching, counting characteristic, action set).
2. Confirm the action available — some plans offer only "block", others allow
   "managed challenge".
3. Apply to Preview first and confirm normal rating submission still works
   end to end.
4. Only then apply to Production.
5. Record the values actually configured, since they may differ from the
   starting recommendations above.

Do not treat the numbers in this document as applied configuration.

---

## Correction (Gate 8B.1): the expressions above cannot be created on this plan

The zone is **parkio.info on the Free Website plan**. Free-plan rate limiting
rules are far more restricted than the expressions recorded earlier in this
runbook assume, and those expressions **cannot be entered as written**:

| Free plan allows | This runbook's earlier expressions needed |
| --- | --- |
| 1 rule total | 2 rules (mint + rating write) |
| Counting period: 10 s only | 60 s |
| Mitigation timeout: 10 s max | 60 s |
| Matchable fields: Path, Verified Bot | `http.request.method`, `starts_with`, `ends_with` |
| Counting characteristic: IP only | IP (this part was fine) |

The decisive one is the field list. Without `http.request.method` a rule cannot
be scoped to POST, so a path rule on `/api/dining/*/ratings/` would also
throttle the **public GET aggregate** that Dining discovery depends on. The
mint path is POST-only, so a path rule there would be harmless — but only one
rule exists to spend, and a 10 s window with a 10 s mitigation is not the
approved 5-per-60-s policy.

Separately, and unchanged from the earlier finding: zone rules on parkio.info
never reach `parkio.pages.dev` or `*.parkio.pages.dev`, because that zone
belongs to Cloudflare and not to this account.

**Do not paste the earlier expressions.** They are retained above only as the
record of what was proposed before the plan was known.

### What replaced them

Host authorization moved into the Worker instead — see `lib/ratingsWriteHost.ts`.
That closes the hostname bypass for every deployment carrying the code, and
needs no plan feature. It is not a rate limiter and does not pretend to be one.

Rate limiting remains **unimplemented**. The Workers Rate Limiting binding is
GA but is **not a supported Pages Functions binding** and `ratelimits` is not a
supported key in a Pages Wrangler configuration file, so the approved policy
cannot be built inside this Pages project at all. The open options are recorded
in PARKIO_ACTIVE_CONTEXT.md under Gate 8B.1; they require a product decision.

---

## Implemented (Gate 8B.8): Worker rate limiting, Preview

Rate limiting is no longer a proposal. It is implemented in application code
against Cloudflare's Workers Rate Limiting bindings, and validated locally
against the real binding.

This supersedes everything above about WAF Rules expressions. **No zone rule is
used, and none should be created** — the Free-plan limitations recorded earlier
are why.

### Thresholds

| Binding | Limit | Scope | Namespace (Preview) | Namespace (Production) |
|---|---|---|---|---|
| `IDENTITY_MINT_LIMITER` | 5 / 60 s | source IP | 2001 | 1001 |
| `RATING_WRITE_LIMITER` | 10 / 60 s | source IP | 2002 | 1002 |

Separate namespaces, so exhausting one cannot starve the other, and Preview
traffic can never consume Production allowance.

### Ordering

```
hostname guard → source-IP rate limiter → Origin/bearer → validation → D1
```

The limiter sits **before** authentication deliberately: an unauthenticated
script must not get unlimited free attempts merely because the Origin check
would reject it. Rejected traffic still consumes allowance.

The hostname guard runs **before** the limiter, so a request from a
non-authorised host is refused without spending anyone's allowance.

**GETs are never rate limited.** Neither aggregate endpoint calls the limiter —
the single-venue GET and `/api/dining/ratings/` (bulk) are untouched, verified
by test and by 15 consecutive live reads while the write limiter was exhausted.

### Source IP handling

The key is `CF-Connecting-IP`, used transiently as a limiter key and nowhere
else. It is **never** written to D1, never logged by Parkio, and never returned
in a response. There is no column that could hold one. No KV, no Durable
Object, no D1 counter table, no fingerprinting.

`X-Forwarded-For` and similar client-supplied headers are deliberately ignored —
a spoofable key is worse than no key, because it hands an attacker a fresh
allowance per request.

### Two documented fail-open cases

Both are deliberate availability choices about a control that is only friction:

- **No limiter binding** (local development, the Pages build, tests). Failing
  closed would break ratings everywhere the binding is absent, protecting
  nothing.
- **`CF-Connecting-IP` absent.** Cloudflare sets it on every request reaching a
  Worker, so absence means we are not behind Cloudflare. Failing closed would
  turn an edge-layer change into a total write outage.

A limiter *error* also fails open: an outage in the limiter must not take
ratings down.

Authorization is never skipped in either case — the hostname guard runs before,
and Origin/bearer/validation run after.

### Error contract

```
HTTP 429
Cache-Control: no-store
{"error":"rate_limited","message":"Too many requests. Please slow down.","status":429}
```

Same shape as every other API error, so clients need only recognise the status.

### What this does and does not buy

Cloudflare's limiter is **per-location** and self-described as "permissive,
eventually consistent, and intentionally designed to not be used as an accurate
accounting system". A distributed attacker gets one allowance per Cloudflare
location. What it does prevent is a single script minting identities or
rewriting ratings without limit. It remains friction, not an abuse control, and
Gate 8A's shrinkage remains a statistics control.

---

## Accepted semantics (Gate 8B.8, Option A) — READ THIS BEFORE JUDGING THE LIMITER

The approved policy is **approximate burst protection**, not deterministic
enforcement. This was decided after measuring the real limiter on a deployed
Worker, not from documentation.

### What the targets mean

| Binding | Target | Nature |
|---|---|---|
| `IDENTITY_MINT_LIMITER` | **~5 requests / 60 s / source key** | approximate |
| `RATING_WRITE_LIMITER` | **~10 requests / 60 s / source key** | approximate |

Thresholds stay as they are. Do not lower them.

### What is guaranteed

Rapid back-to-back abuse produces the specified response:

```
HTTP 429
Cache-Control: no-store
Content-Type: application/json
{"error":"rate_limited","message":"Too many requests. Please slow down.","status":429}
```

### What is explicitly NOT claimed

**Do not describe this as deterministic enforcement, and do not claim that
requests spaced across the window are blocked.** They frequently are not.

Measured on `parkio-preview` (2026-09-12), same source IP throughout:

| Traffic shape | Outcome |
|---|---|
| 8 mints back-to-back, one connection | **5 × 201 then 3 × 429** — matches the target |
| 14 writes back-to-back, one connection | **11 × 200 then 3 × 429** — one over nominal |
| 7 mints spaced ~1 s apart | **0 blocked** |
| 13 writes spaced ~1 s apart | **0 blocked** |
| 40 concurrent mints | only **2 blocked** |

Small overshoot is accepted. Cloudflare documents the binding as "permissive,
eventually consistent, and intentionally designed to not be used as an accurate
accounting system", and it is also **per-Cloudflare-location**, so a
distributed attacker receives one allowance per location.

The code was verified correct before accepting this: a temporary diagnostic
read through `wrangler tail` confirmed `binding=present`, all four bindings on
the Cloudflare context, and `CF-Connecting-IP` present. The imprecision is the
platform's, not the application's. **That diagnostic has been removed.**

### Therefore

This is **friction against casual and scripted abuse**, layered with:

- the hostname guard (`lib/ratingsWriteHost.ts`),
- browser Origin validation and native bearer verification,
- `UNIQUE (venue_key, rater_id)`, so repeat writes UPSERT rather than inflate,
- Gate 8A's Bayesian shrinkage, which is a **statistics** control.

None of these is an abuse control on its own, and the set does not stop a
determined distributed attacker. Say so plainly rather than implying otherwise.

### Invariants that must survive any future change

- Separate limiter namespaces (Preview 2001/2002, Production 1001/1002).
- **GETs are never rate limited** — verified 12/12 bulk and 8/8 single aggregate
  reads returned 200 while the write limiter was exhausted.
- Preview and Production D1 remain isolated.
- No D1, KV or Durable Object counter.
- No raw IP persisted, logged or returned.

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

# Community Ratings — edge rate limiting runbook

**Status: NOT APPLIED.** This document describes rules to be configured in the
Cloudflare dashboard during Gate 8B. Nothing here is active, and nothing in
this repository can activate it — Parkio has no `wrangler.toml`, no `_headers`,
no `_middleware`, and no application-level rate limiting.

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

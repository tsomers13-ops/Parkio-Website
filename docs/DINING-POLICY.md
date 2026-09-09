# Dining content policy

Decisions from Priority 8 Gate 3. The domain code in `lib/dining.ts`,
`lib/seasonalDining.ts` and `lib/diningTypes.ts` implements these; this file
records *why*.

## Two kinds of dining, never merged

```
DiningItem
├── PermanentDiningVenue   source of truth: iOS  -> lib/generated/dining.json
└── FestivalBooth          source of truth: Website -> content/dining/festivals/*.json
```

A discriminated union on `kind` makes it impossible to render a temporary
marketplace as a restaurant. Dining is not an attraction and shares no types
with one — only the park/slug routing shape.

## Content floor

A venue earns an **indexable** page when it carries at least
`DINING_CONTENT_FLOOR` (3) *evergreen* planning facts:

| Signal | Source |
| --- | --- |
| `hasVerdict` | editorial.shortVerdict |
| `hasSignatureItems` | editorial.signatureItems |
| `hasPriceTier` | editorial.priceTier |
| `hasAmenityFacts` | mobile order + indoor seating + kid friendly |
| `hasDietaryFlags` | editorial.dietaryFlags |
| `hasMappedLocation` | latitude + longitude |
| `hasOperationalSource` | externalId |

Name, park, land and type are **excluded**: all 62 venues have them, so they
cannot distinguish a useful page from a directory entry. Live operational
status is **excluded** too — it is not evergreen, so it cannot justify
indexing.

**Result: 13 pass, 49 fail** (EPCOT 7/35, Hollywood Studios 6/14). The score
distribution is bimodal — `{1:1, 2:48, 5:5, 7:8}` — so no venue scores 3 or 4
and the floor sits in an empty band with zero borderline cases. 48 venues carry
coordinate + externalId and nothing else; publishing those as 48 near-identical
indexable pages would be thin content competing with the park page.

The floor is mechanical, so richer data (menus, hours, accessibility) lifts
venues over it automatically without a policy change.

## Routable / indexable / discoverable

Three different questions, deliberately not collapsed:

| | Who | Count |
| --- | --- | --- |
| **Discoverable** | appears in the park's Dining list | 62 |
| **Routable** | has a detail URL | 62 |
| **Indexable** | search engines may index it | 13 |

All 62 get a URL: internal links need a destination, and 404ing a real venue is
worse than an honest thin page. Thin pages are `noindex`, not missing. Because
slugs are immutable, a venue crossing the floor later flips to indexable
without its URL ever moving.

## Festival detail pages: none

Festival booths get a **festival list, not individual pages**. They are
temporary by definition, churn annually, and would leave 45 URLs dead for most
of the year — SEO volatility and canonical/history problems for no gain. One
festival page carrying all 45 booths and 241 items answers "where should I eat
during Food & Wine" far better than 45 thin pages. Revisit only if a booth
develops durable cross-year identity.

## Ordering

Permanent: park → land → name. Festival: booth id (the authored file is
id-sorted; source order carries no meaning). **No popularity rank is invented** —
the dataset has no such signal.

## Nearby relationships

Permanent venues have 56/62 coordinates, so coordinate-based proximity is valid
later. Festival booths have **zero** coordinates; proximity must never be
inferred from `locationText`.

## Editorial is optional

49 of 62 venues have no editorial. `editorial === undefined` is a first-class
state. Never synthesize a score, verdict, recommended dish, value assessment or
description for a factual-only venue.

## Alcohol

`itemKind` is a factual classification taken from Disney's own section
headings. Alcoholic items are shown as menu facts, never hidden and never
ranked or recommended. Seven items sit under headings that state no category
and stay unclassified rather than being guessed.


---

# Community ratings foundation (Priority 9 Gate 1)

## Three identifiers, three jobs

| Identifier | Owner | Job | Stable? |
| --- | --- | --- | --- |
| `canonicalId` | iOS | current cross-source join (`Park\|Land\|Name`) | **no** — moves on rename or land change |
| `slug` | Website | public URL | immutable *by policy*, but a URL |
| `venueKey` | Website | **durable data identity** | **yes** — never changes |
| `externalId` | ThemeParks.wiki | live-data join | external |

A **rating is filed against `venueKey`**, never `canonicalId` (which would orphan
every rating the first time Disney renames a restaurant) and never `slug`
(a URL is not an identity).

`venueKey` lives in [`lib/diningVenueKeys.ts`](../lib/diningVenueKeys.ts), keyed
by `canonicalId`. If a venue's `canonicalId` ever changes, **that mapping is
re-pointed and the `venueKey` stays put** — which is exactly what keeps the
ratings attached.

A `venueKey` may share text with today's slug; both were minted from the same
convention. It is never **derived** from the slug at runtime, and
`lib/dining.ts` throws at module load if any venue lacks a minted key rather
than falling back to one.

## Whole stars, enforced twice

`migrations/0002_dining_ratings.sql` uses:

```sql
CHECK (typeof(overall) = 'integer' AND overall BETWEEN 1 AND 5)
```

The `typeof()` guard is load-bearing. SQLite INTEGER affinity does **not**
reject a REAL, so the obvious `INTEGER CHECK (overall BETWEEN 1 AND 5)`
silently **accepts `1.5`, `4.5` and `'4.5'`** and stores them as REAL — proven
against sqlite3 before the migration was written. The API layer validates
independently, so neither layer is trusted alone.

`hidden` rows stay in the table for audit and contribute to **no** aggregate.
UPSERT on `(venue_key, rater_id)` preserves `id` and `created_at` and advances
`updated_at`, so a guest revises rather than stacks.

## Environment isolation

| Environment | Database | Isolation |
| --- | --- | --- |
| Production | `parkio-history` | ratings migration **not applied** until Gate 2 |
| Preview | `parkio-history-preview` | separate database id — verified in the dashboard |

The two database ids differ, which is what makes it safe to test ratings on
Preview. Never run a ratings migration against Production during a foundation
gate, and never substitute Production when Preview access fails.

## Identity abstraction

Persistence stores only `raterId` and does not care where it came from. A
future Web signed anonymous cookie and a future iOS installation identity both
resolve to one, so iOS can reuse this backend unchanged.

## Failure policy

- **Read** fails soft: if D1 is unavailable the Dining page still renders and
  Guest Rating is simply unavailable.
- **Write** fails hard: a submission that cannot be persisted returns an
  explicit failure. **Never** report a fake success.

## Cache (recommended for Gate 2)

Public aggregate `GET`: short edge cache, ~60s — new ratings appear quickly
without hammering D1. Personal `/me` read and all writes: `no-store`.


---

# Community ratings API (Priority 9 Gate 2)

## Routes

| Route | Method | Cache | Identity |
| --- | --- | --- | --- |
| `/api/dining/[venueKey]/ratings` | GET | `s-maxage=60, swr=120` | never minted |
| `/api/dining/[venueKey]/ratings` | POST | `no-store` | minted if absent |
| `/api/dining/[venueKey]/ratings/me` | GET | `no-store` | never minted |

All three are `runtime = "edge"`. **The path identity is `venueKey` only** — a
`slug`, `canonicalId`, `externalId`, festival booth id or attraction id all
404 before the database is touched.

## Anonymous identity

Cookie **`parkio_rater`**, value `<raterId>.<HMAC-SHA256>`:

- `raterId` is 128 bits from `crypto.getRandomValues` — never `Math.random()`,
  and never derived from IP, user agent, timestamp or venue.
- Signed with `RATINGS_IDENTITY_SECRET` via Web Crypto, verified in constant
  time. An unsigned UUID would let anyone mint identities by hand.
- `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` (except plain-http localhost),
  `Max-Age` 400 days.
- Carries no personal data, no venue and no timestamp.

**Reads never mint an identity.** A visitor who browses dining and never rates
anything is never given a cookie; only POST mints one. Every cookie failure —
absent, malformed, wrong shape, bad signature — returns the same result, so a
prober learns nothing about which check failed.

## Secret

`RATINGS_IDENTITY_SECRET` must be configured **separately in Preview and
Production, with different values**. It is never logged, never returned, never
committed, and never sent to the browser. **If it is missing, writes fail** —
signing with a fallback would make every rating forgeable.

## Write protection

`SameSite=Lax` on the cookie, plus an explicit `Origin` allowlist
(`parkio.info`, `*.parkio.pages.dev`, localhost) — the Host header is never
trusted. POST additionally requires `Content-Type: application/json` (so a
cross-site form post cannot reach it) and caps the body at 1 KB. No wildcard
CORS on writes. That is the whole CSRF model; a library would add weight
without adding protection here.

The client cannot set `raterId`, `status`, `created_at` or `updated_at` — the
route rejects unknown properties outright, and timestamps are server-generated.
`venueKey` comes from the path, never the body.

## Failure semantics

**Zero ratings and unavailable ratings are different facts.** A read that
cannot reach D1 returns **503 `ratings_unavailable`**, never a fabricated
`ratingCount: 0`. Callers render the page without the ratings block — the page
still works. A write that fails returns **503** and never reports a success it
did not achieve. Database errors are swallowed rather than echoed, so no schema
detail reaches the internet.

## Rate limiting

Recommended as a Cloudflare dashboard rule rather than an IP table in our code:
limit `POST /api/dining/*/ratings` to roughly **10 requests per minute per IP**.
Cloudflare enforces it at the edge and we store no IP addresses. Turnstile stays
off; it is the next escalation if real scripted abuse appears.

## Deployment order

Preview first, Production last: code → local validation → Preview API → real
Preview D1 validation → security review → regression → **Production migration**
→ Production API deploy → canary → cleanup. Never deploy a write-capable
Production API before the Production schema exists.

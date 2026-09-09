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

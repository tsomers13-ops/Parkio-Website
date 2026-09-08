# Seasonal (festival) Dining — authored source

**Hand-authored, Website-owned, and not generated.** Unlike permanent Dining —
whose source of truth is the iOS repo — seasonal content changes weekly during a
festival, so it is authored here directly and consumed as-is.

There is deliberately **no generated seasonal artifact**: this file is already
validated and directly consumable, so a second generated copy would add drift
surface for no benefit.

## Files

One file per festival **edition**, named by its festival id: `ep-fw-2026.json`.
The edition year is part of every id inside it, so a new edition never
overwrites the previous year's data.

## Maintenance

| Question | Answer |
| --- | --- |
| Who updates it? | A Parkio maintainer, from Disney-owned sources only |
| When is a new file created? | Once per festival edition, never by editing last year's |
| How are menu changes applied? | Edit the file, bump `provenance.verifiedAt`, re-run validate |
| How is expiry handled? | Nothing is deleted. `dining:festival:status` reports `expired`; consumers exclude it from current Dining decisions |
| How do we avoid last year's menu showing? | Lifecycle dates alone decide visibility — there is no `isActive` flag |
| How do we know the source is stale? | `dining:festival:status` reports the age of `verifiedAt` and warns past 14 days while a festival is active |

```bash
npm run dining:festival:validate   # structure, ids, lifecycle, provenance (no clock)
npm run dining:festival:status     # upcoming / active / expired + staleness
```

Validation is **deterministic and clock-free** so a passing build stays passing
as time advances; anything time-dependent lives in `status`.

## Verification method

Disney's menu pages are client-rendered: the raw HTML contains **no menu text**,
and the marketplace index truncates under plain retrieval. Menus must therefore
be read from the **rendered DOM** (`.menu-group` → `.menu-item` → name /
description / price), never from an AI summary of the page — a summary
concatenates the description into the item name and silently truncates.

The authoritative inventory comes from the **rendered** marketplace index at
`/dining/epcot/food-wine-marketplaces/`, which links every participating
location. Endpoint-name probing may suggest candidates, but a candidate counts
only when a Disney-owned page confirms it.

Disney encodes lifecycle in the page **title**, e.g.
`Marketplace - India - Opening October 2`. Check titles when verifying dates.

`provenance.verificationMethod` records how the current data was captured.

## Sourcing rules

- Disney-owned sources only. The per-booth `…/marketplace-{booth}/menus/all-day/`
  page wins when official sources disagree (it is the most specific).
- `plantBased` only where Disney prints the label. `allergenSafeFor` only from
  Disney's allergy-friendly pages. **Never** infer vegetarian, vegan,
  gluten-free, dairy-free, nut-free, alcohol content or ingredients.
  Allergen safety and dietary preference are different concepts.
- `itemKind` comes from Disney's own section headings ("Food Offerings",
  "Beverage Offerings", "Alcoholic Beverage Offerings"). It is never inferred
  from an item name, and no recommendation logic is built around alcohol.
- Prices keep the exact printed `display` string; `amountUSD` is added only when
  the display is a single clean amount. Ranges such as `"$6.00 to $9.75"` keep
  `display` alone.
- **No guessed coordinates.** Disney publishes none for booths, so booths carry
  `locationText` only and are list-discoverable rather than mapped.
- A booth verified to exist but with no published menu keeps an empty `menu`
  and must carry a `sourceNote` explaining the gap. A missing menu never
  deletes an otherwise verified booth.

## Relationship to permanent Dining

A festival offering hosted at an existing permanent venue links to it via
`venueCanonicalId`, which must resolve against `lib/generated/dining.json`.
It is **never** duplicated as a permanent venue, and permanent Dining is never
modified by this content.

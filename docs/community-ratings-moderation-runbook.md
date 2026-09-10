# Community Ratings — moderation runbook

Parkio has **no moderation tooling and no admin portal**, deliberately. At the
current scale — 62 rateable venues, anonymous numeric ratings, no written
reviews — building one would cost more than the abuse it would catch. The
schema already carries everything moderation needs.

## The mechanism

`dining_ratings.status` is `'active' | 'hidden'`, defaulting to `'active'`.
Every aggregate filters `status = 'active'`, so a hidden row:

- is excluded from `ratingCount` and `overallAverage`
- therefore cannot reach `rankingScore` or `rankingEligible`
- **remains in the table**, so the action is auditable and reversible

Hiding is the only moderation action. There is no delete path, by design.

## Inspecting

Identify the row before changing it. Ratings carry no personal data, so the
only handles are the venue and the opaque rater id.

```sql
-- What does this venue currently hold?
SELECT rater_id, overall, taste, value, quality, status, created_at, updated_at
FROM dining_ratings
WHERE venue_key = ?
ORDER BY created_at;
```

```sql
-- Everything one identity has rated — the usual shape of a brigading check.
SELECT venue_key, overall, status, created_at
FROM dining_ratings
WHERE rater_id = ?
ORDER BY created_at;
```

A single identity rating many venues within seconds is the signal worth
looking for; the timestamps are the evidence.

## Hiding

```sql
UPDATE dining_ratings
SET status = 'hidden',
    updated_at = ?          -- ISO-8601 UTC, e.g. 2026-09-10T12:00:00Z
WHERE venue_key = ?
  AND rater_id  = ?;
```

Always scope to **both** `venue_key` and `rater_id`. A statement keyed on one
alone can silently take out far more than intended.

## Verifying

Confirm through the API rather than the table, because that is what guests
actually see:

```
GET /api/dining/<venueKey>/ratings/
```

`ratingCount` should have dropped by one, and `rankingEligible` may flip to
`false` if the venue fell below the five-rating threshold. That flip is
correct behaviour, not a bug.

## Reversing

```sql
UPDATE dining_ratings
SET status = 'active',
    updated_at = ?
WHERE venue_key = ?
  AND rater_id  = ?;
```

## Cautions

- **Preview and Production are separate databases.** Confirm which one is
  connected before running anything. Preview is `3c3c7bf8-…`; Production is
  `82b972d1-…`. Getting this wrong on an `UPDATE` is not recoverable from the
  dashboard.
- Never paste real Production rater ids into shared documents, tickets or
  commit messages. They are pseudonymous identifiers, not secrets, but they
  are also not ours to publish.
- Never add an IP address, device identifier or fingerprint column to support
  moderation. If moderation ever needs more than this, that is a product
  decision about accounts — not a schema patch.

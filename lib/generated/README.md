# Generated content — do not edit by hand

Files in this directory are **generated**. Editing one by hand will be
overwritten on the next generation and will fail `npm run dining:verify`.

## dining.json

Parkio's Dining content. The **source of truth is the iOS repository**
(`tsomers13-ops/parkio`), where the venue catalog lives in Swift. The Website
owns exactly one thing about Dining: the **public slug**, hand-authored in
[`lib/diningSlugs.ts`](../diningSlugs.ts).

| Concern | Owner |
| --- | --- |
| Venue facts (name, land, type, coordinates, external ID) | iOS |
| Parkio editorial (score, verdict, signature items, dietary) | iOS |
| Public URL slug | **Website** (`lib/diningSlugs.ts`) |
| Joined, committed dataset | generated — this file |

### Regenerate

Two steps, two repositories. The Website never compiles the iOS app.

```bash
# 1. iOS repo — export the authoritative content
swift run dining-export --output /tmp/parkio-dining-source.json

# 2. Website repo — join with the slug manifest
npm run dining:generate -- --input /tmp/parkio-dining-source.json
git diff -- lib/generated/dining.json
```

An empty diff means iOS content has not moved. A non-empty diff is a real
content change and should be reviewed like any other diff.

### Verify

```bash
npm run dining:verify                                          # internal consistency
npm run dining:verify -- --input /tmp/parkio-dining-source.json  # + drift vs iOS
```

Without `--input` this checks the dataset against the slug manifest, the 84
attraction slugs, the route table, coordinate and editorial shape, and byte-level
formatting. It cannot confirm that `sourceCommit` names the commit the data
actually came from — only the `--input` form proves that, because only the iOS
repository can produce the authoritative export.

There is no CI automation for this yet; both commands are run locally.

### Rules

- `canonicalId` is the iOS stableID. It is an **internal join key** and must
  never appear in a public URL.
- Slugs are **immutable once published**. Changing one breaks a live URL and is
  a deliberate migration, not an edit.
- A venue is published only if it has a manifest slug. Priority 8 ships the
  **EPCOT + Hollywood Studios pilot (62 venues)**; the other 24 venues in the
  86-record export are intentionally absent.
- A Dining venue in EPCOT or Hollywood Studios with no slug is a hard
  generation failure, so new iOS venues cannot ship without a URL decision.
- The dataset carries no wall-clock timestamp, so regeneration is deterministic.

### Not yet present: seasonal / festival dining

`dining.json` contains **permanent venues only**. EPCOT festival booths
(Food & Wine, Festival of the Arts, Flower & Garden) are deliberately absent:
as of iOS `116ae4a` Parkio has **no authoritative structured source** for them.
The iOS `AttractionType.festivalBooth` case exists but holds zero records, and
festivals appear on the Website only as free-text Daily Guide headlines. Mining
that prose into a dataset would be fabrication.

When a source exists, seasonal booths belong in a **separate collection**, not
mixed into `venues` — permanent venue URLs and IDs must never depend on
festival data. See `PARKIO_ACTIVE_CONTEXT.md` for the designed schema.

# Parkio Daily — accuracy and fact-check

Parkio Daily kept shipping wrong facts: the wrong weekday for a date,
details a source never stated, fan-blog reports written as Disney fact,
and a "Best rides right now" box with no live data behind it. Nothing
checked an issue before it was published and emailed.

This document covers the two changes that address that: a more careful
writer, and a fact-check step between writing and publishing.

## Writer (`scripts/parkio-daily/build.mjs`)

| Change | Why |
| --- | --- |
| Model `claude-sonnet-4-5` → `claude-sonnet-5-5`, effort `medium`, `max_tokens` 16000 | Newer model, cheaper per token ($2 / $10 per million). Sonnet 5.5 always thinks first, so the answer is read from the last text block, not `content[0]`. |
| Article text up to 2,500 characters (prefers `content:encoded`), was 300 | The writer saw only the first lines of each article and guessed the rest. |
| Sources labelled OFFICIAL (Disney Parks Blog) vs REPORTED (the five blogs) | A story only a fan blog carries is written as "WDWNT reports…". |
| 6–10 stories, fewer is fine (was "10–13, do not underfill") | The volume target pushed the writer to pad with thin stories. |
| A 45-day calendar in the prompt (`buildCalendar`) | Weekday/date pairs are looked up, not worked out. |
| No `rightNow` box | No live ride data reaches the writer, so the box could only be made up. The site and feed already treat it as optional. |
| Server-side fallback on refusal (`fallbacks: "default"`) | A rare safety refusal re-runs on a fallback model instead of producing the empty fallback issue. |

## Fact-check (`scripts/parkio-daily/verify.mjs`)

Runs in `.github/workflows/parkio-daily.yml` right after the briefing is
written and before the commit, so before publish and before Buttondown
emails it.

1. **Code check (free).** Every "Weekday, Month D" pair must match the
   calendar. This alone catches the Nov 25 "Friday, November 28" error.
2. **Model check (Claude Sonnet 5.5).** Only risky items are sent: the
   teaser, the lead story, and anything with a date, time, price, or an
   opening/closing/status word. The checker:
   - reads Disney's own pages first (`disneyparksblog.com`,
     `disney.go.com`), then the five source blogs — web fetch and search
     are limited to those domains;
   - uses **ThemeParks.wiki** (remote MCP server,
     `https://api.themeparks.wiki/mcp`, via the Messages API MCP
     connector) for park hours, schedules and ride status. If that server
     is down, the check retries without it;
   - returns one verdict per item: `confirmed`, `reported-only`, `wrong`
     or `unverifiable`, with the page it relied on.

Code, not the model, decides:

| Verdict | Action |
| --- | --- |
| `wrong` (or a weekday/date mismatch) | cut the item |
| `unverifiable`, not worded as a report | cut the item |
| `unverifiable` or `reported-only`, worded as a report | keep |
| `reported-only`, not worded as a report | keep, flagged for wording |

**Hold** (nothing commits, publishes or emails) when the teaser or the
lead story is cut, when 3 or more items are cut, or when the check
itself fails.

### Modes

Set by `PARKIO_FACTCHECK_MODE` on the workflow step.

- `shadow` (current) — writes the report to the Actions job summary only.
  The briefing is not changed and the step never blocks publishing.
- `enforce` — cuts are applied to the file before commit (recorded in
  `meta.factcheck`), and a hold fails the step so the commit and publish
  steps don't run.

Plan: one week in `shadow`, compare the reports with what shipped, then
switch to `enforce` in a reviewed PR.

### When a day is held (enforce mode)

The run fails at the fact-check step, so the briefing is never committed
(the runner's copy is discarded) and no email goes out. The job summary
says why. To publish that day anyway, re-run the workflow from the
Actions tab: the writer starts fresh and the new draft is checked again.
PR #52's held-run release path is a possible later addition if re-runs
turn out not to be enough.

`PARKIO_FACTCHECK_THEMEPARKS=off` turns the ThemeParks.wiki tools off
without a code change.

### ThemeParks.wiki credit

ThemeParks.wiki's terms ask that data shown to people credit "Powered by
ThemeParks.wiki" with a link. The checker only uses it to verify claims;
nothing from it is written into the issue, so no credit is needed today.
If a future change shows its hours or wait times in the newsletter, add
the credit at the same time.

## Cost

Measured from the Nov 25 issue's token counts and estimated for the new
setup, per day:

| Step | Estimate |
| --- | --- |
| Writer (≈40k in / ≈10k out) | ≈ $0.18 |
| Fact-check (≈60k in / ≈5k out, ≈6 searches) | ≈ $0.23 |
| **Total** | **≈ $0.40** |

The job summary prints the checker's real token and search counts each
day, so this can be checked against the first week of shadow runs.

# Parkio Daily fact-check

The build job in `.github/workflows/parkio-daily.yml` runs `scripts/parkio-daily/factcheck.mjs` after today's JSON exists and before social drafts and the commit. Closed-attraction findings and weekday mismatches block. The other date findings, debut and closing findings, and unverifiable findings are report-only. There is no warn mode for the whole gate and no skip switch.

A blocking finding exits the step. Commit does not run, so `pushed` stays unset and the publish job does not run. Nothing is written to `main`, `/guide/<slug>`, `/feed.xml`, or Buttondown. The held JSON, the feed evidence, the report, and a short release note are uploaded as the `parkio-daily-held` artifact (7 days). Report-only findings are labelled `report-only` in the job summary and in `parkio-daily-factcheck` (14 days). They do not hold the run, so that artifact is uploaded on a passing check too.

The check lives in the build job, which uses the workflow file on `main` at dispatch time. It is not in `parkio-daily-publish.yml`, because that job loads its tooling from the candidate commit.

GitHub's failed-run email and the existing 7:15 AM health check are the alerts. This does not add a Slack channel, a secret, or another email.

A later run the same day that generates a briefing the checks accept is allowed to commit and publish. That includes the late GitHub `0 11 * * *` cron. An earlier hold is not latched.

## What blocks

Tom's choice, November 25, 2026: block now on the closed-ride list and on weekday mismatch. Date checks stay report-only for about two weeks, then become blocking.

| Check | Disposition | What it looks at |
| --- | --- | --- |
| (a) | Report-only while `dateChecks` is `report` | A sentence that names a ledger subject and states it as current before `startDate`, or gives a calendar date outside the ledger window. A bare mention does not fire. A past `reviewBy` is a notice. |
| (b) | Blocking | On or after `effectiveDate`, operating language in a sentence that names the attraction. The match is case-insensitive. Language includes `final season`, `last ride`, `last chance`, `one last`, `still open`, `still operating`, `remains open`, `operational`, `running its`, `closing soon`, or a wait like `40 min` / `walk-on`. "Replacing DINOSAUR" and "DINOSAUR closed in February" pass. |
| (c) weekday | Blocking | A title or teaser that says a ride is down "this morning" / "today" while the body dates that event to another weekday. |
| (c) other dates | Report-only while `dateChecks` is `report` | A concrete same-day status claim: down, closed, failed to open, reopened, or opened, with "today" or "this morning". A tip that only says "today" does not fire. 11:30 PM ET the day before does not count. |
| (d) | Report-only while `dateChecks` is `report` | An undated "debuts" / "now open" / "now meeting" claim, or "new …" in the teaser or a right-now note, while that item's body is future tense. With feed evidence, source-date fires only for an opening or closing claim about a named attraction, venue, or show. |

The flip is one line in `data/parkio-daily/factcheck-config.json`. Planned date: **2026-12-09**. Change:

```json
"dateChecks": "report"
```

to:

```json
"dateChecks": "block"
```

That makes (a), the non-weekday part of (c), and all of (d) blocking. Closed-ride and weekday findings stay blocking either way. There is no whole-gate warn mode.

Feed evidence is `title`, `link`, `pubDate` (ISO), `source`, and a short excerpt, written under `$RUNNER_TEMP` by `build.mjs`. It is not committed. When today's file already exists, `build.mjs` does not fetch again. The checker then uses the JSON-only backstop unless a release restored the held evidence file.

If a cited URL is not in that feed file, the fact-check step fetches the page (10s timeout, 24 pages per run) and reads a published date from `article:published_time`, then JSON-LD `datePublished` (including `@graph`), then `<time datetime>` (preferring one marked published). The fetch lives in the checker because the cited URLs are not known until the briefing JSON exists. The step is still in the build job, before commit. Tests inject the fetcher and do not use the network.

A 403, other 4xx or 5xx, timeout, network error, a page with no parseable date, or a spotlight opening/debut/closing claim with no source URL and no matching feed title is an **unverifiable** finding. It is not a contradiction. If a source blocks reading, the finding is reported and the issue is not held. `unverifiable` in `data/parkio-daily/factcheck-config.json` is `report` (the default) or `hold`.

The build job's `actions` permission is `read`. `actions/upload-artifact` v4 uploads with `ACTIONS_RUNTIME_TOKEN`, and downloading a held artifact plus the runs lookup need `read`. `contents: write` stays for the bot commit. The first controlled run of this workflow must confirm the held-artifact upload still succeeds.

A `release_held_run_id` is accepted only when the run is `.github/workflows/parkio-daily.yml` in this repository, `head_branch` is `main`, and the API response includes both the workflow path and the repository. A missing path, a missing repository, or any other branch is rejected.

## Same-day release

Actions → Parkio Daily → Run workflow. The scheduler's normal dispatch leaves the inputs empty.

1. **Regenerate.** Leave the inputs blank. Fresh copy is checked again. If it passes, it commits and can publish.
2. **Release the held bytes.** `release_held_run_id` must be a run of this repo's `parkio-daily.yml`. Any other workflow or repository is rejected. `ack` is every finding id from the artifact's `report.json` or the step summary, comma-separated. A missing or unknown id fails. The run logs `github.actor` into the commit message.
3. **Publish a correction.** Put the corrected JSON on a branch named `daily-fix/parkio-daily-YYYY-MM-DD` for today in America/New_York. Dispatch with `fixed_ref` set to that branch. The job copies only that JSON file, checks the shape, and runs the fact-check again. Ack any ids that remain.

Do not set both release inputs. Ack without one of them fails the run.

Committing a fix straight to `main` as yourself does not publish. The publish job only accepts the `parkio-daily-bot` author. The bot commit created by path 3 is that author, and it only contains the daily JSON and the generated social draft.

## Seeded facts

`attraction-status.json` lists DINOSAUR and DinoLand U.S.A. only. Disney Parks Blog, March 6, 2025, says DinoLand U.S.A. permanently closes February 2, 2026, and the final day to experience DINOSAUR is February 1, 2026. The same post also names The Dino Institute Shop, Restaurantosaurus, Restaurantosaurus Lounge, and several venues it said were already closed. Those are not in this file.

The name match is case-insensitive, and "remains open" / "operational" count. `parkio-daily-2026-07-05` ("DinoLand U.S.A. remains open") and `parkio-daily-2026-09-12` ("DinoLand attractions remain operational") hold. Those sentences contradict the February 2, 2026 date in the March 6, 2025 Disney Parks Blog post. That post is a pre-announcement, not a later confirmation that the land was actually closed on those dates.

New facts are added by pull request with a linked source. Tom approves those merges. A fact sourced only from fan sites is tier `secondary` and worded "reported" or "expected".

`facts.json` has one entry, Twilight Tales, tier `secondary`, wording `reported`, `officialConfirmation: not-found`. It is reported by fan sites and expected from December 20, 2026 through January 3, 2027. WDWNT's More Details post, fetched 2026-11-25 (HTTP 200), says: "The experience will be available after the sun sets from December 20, 2026, through January 3, 2027." Those printed years are `startDate` and `endDate`. The Disney Food Blog RSS item (HTML 403) has two separate sentences, "from December 20th through January 3rd" and "only from December 20th through January 3rd," without years. Neither source is a Disney page.

## Replay

JSON-only replay of the issues in `content/guide/daily` records findings on 9 issues. With `dateChecks` set to `report`, the blocking ones are the two check (b) lines: 2026-07-05 and 2026-09-12. The check (d) lines and the 2026-11-25 Twilight Tales "debuts today" / "starts tonight" lines are report-only.

| Issue | Why it holds |
| --- | --- |
| 2026-05-15 | (d) Teaser "new Muppets snack stand" shares that name with an item whose body is future tense. |
| 2026-07-05 | (b) "DinoLand U.S.A. remains open" after the ledger's February 2, 2026 close. |
| 2026-07-23 | (d) Title "debuts at D23 Expo" while the body says the line "will debut" in August. |
| 2026-08-06 | (d) Teaser "new dining concept" shares Diamond Horseshoe with an item whose body says the change "will begin". |
| 2026-08-12 | (d) Teaser "new Cars Land details" shares Cars Land with an item whose body says the land is "coming" and the model "will debut". |
| 2026-08-15 | (d) Teaser "Indiana Jones temple facade debuts at D23" shares Indiana Jones with an item whose body says the models are for a land "coming" in 2027. |
| 2026-09-12 | (b) "DinoLand attractions remain operational" after the ledger's February 2, 2026 close. |
| 2026-11-12 | (d) Title "Now Meeting" and teaser "debut" while the body says "upcoming" about the film. The meet-and-greet itself may have been current. Report-only. |
| 2026-11-25 | (a) and (d) "Twilight Tales debuts today" and "starts tonight" while the ledger start is December 20, 2026. Report-only. The dates are the reported fan-site window, not an official confirmation. |

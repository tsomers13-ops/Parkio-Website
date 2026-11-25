# Parkio Daily fact-check

The build job in `.github/workflows/parkio-daily.yml` runs `scripts/parkio-daily/factcheck.mjs` after today's JSON exists and before social drafts and the commit. All checks block. There is no warn mode and no skip switch.

A failing check exits the step. Commit does not run, so `pushed` stays unset and the publish job does not run. Nothing is written to `main`, `/guide/<slug>`, `/feed.xml`, or Buttondown. The held JSON, the feed evidence, the report, and a short release note are uploaded as the `parkio-daily-held` artifact (7 days).

The check lives in the build job, which uses the workflow file on `main` at dispatch time. It is not in `parkio-daily-publish.yml`, because that job loads its tooling from the candidate commit.

GitHub's failed-run email and the existing 7:15 AM health check are the alerts. This does not add a Slack channel, a secret, or another email.

A later run the same day that generates a briefing the checks accept is allowed to commit and publish. That includes the late GitHub `0 11 * * *` cron. An earlier hold is not latched.

## What blocks

| Check | Data | What it blocks |
| --- | --- | --- |
| (a) | `data/parkio-daily/facts.json` | A sentence that names a ledger subject and states it as current before `startDate`, or gives a calendar date outside the ledger window. A bare mention does not block. A past `reviewBy` is a notice, not a hold. |
| (b) | `data/parkio-daily/attraction-status.json` | On or after `effectiveDate`, operating language in a sentence that names the attraction. The match is case-insensitive. Language includes `final season`, `last ride`, `last chance`, `one last`, `still open`, `still operating`, `remains open`, `operational`, `running its`, `closing soon`, or a wait like `40 min` / `walk-on`. "Replacing DINOSAUR" and "DINOSAUR closed in February" pass. |
| (c) | The issue text, plus feed evidence when this run fetched feeds | A title or teaser that says a ride is down "this morning" / "today" while the body dates that event to another weekday. With feed evidence, only a concrete same-day status claim counts: down, closed, failed to open, reopened, or opened, with "today" or "this morning", and a named place when the claim is in the teaser. A tip that only says "today" does not. 11:30 PM ET the day before does not count. |
| (d) | The issue text, the ledger, and feed evidence when present | An undated "debuts" / "now open" / "now meeting" claim, or "new …" in the teaser or a right-now note, while that item's body is future tense ("is coming", "will open"). An explicit later date ("debuts August 7") passes. With feed evidence, source-date fires only for an opening or closing claim about a named attraction, venue, or show. The adjective "new" by itself does not. |

Feed evidence is `title`, `link`, `pubDate` (ISO), `source`, and a short excerpt, written under `$RUNNER_TEMP` by `build.mjs`. It is not committed. When today's file already exists, `build.mjs` does not fetch again. The checker then uses the JSON-only backstop unless a release restored the held evidence file.

If a cited URL is not in that feed file, the fact-check step fetches the page (10s timeout, 24 pages per run) and reads a published date from `article:published_time`, then JSON-LD `datePublished` (including `@graph`), then `<time datetime>` (preferring one marked published). The fetch lives in the checker because the cited URLs are not known until the briefing JSON exists. The step is still in the build job, before commit. Tests inject the fetcher and do not use the network.

A 403, other 4xx or 5xx, timeout, network error, a page with no parseable date, or a spotlight opening/debut/closing claim with no source URL and no matching feed title is an **unverifiable** finding. It is not a contradiction. `data/parkio-daily/factcheck-config.json` sets `unverifiable` to `hold` (default; the finding blocks) or `pass` (listed in the report, does not block). That switch is only this class. There is no warn mode for the other checks.

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

`facts.json` has one entry, Twilight Tales, tier `secondary`, `officialConfirmation: not-found`. WDWNT's More Details post, fetched 2026-11-25 (HTTP 200), says: "The experience will be available after the sun sets from December 20, 2026, through January 3, 2027." Those printed years are `startDate` and `endDate`. The Disney Food Blog RSS item (HTML 403) has two separate sentences, "from December 20th through January 3rd" and "only from December 20th through January 3rd," without years. Neither source is a Disney page.

## Replay

JSON-only replay of the 198 issues in `content/guide/daily` holds 8. Six are check (d). Two are check (b): 2026-07-05 and 2026-09-12, above.

| Issue | Why it holds |
| --- | --- |
| 2026-05-15 | (d) Teaser "new Muppets snack stand" shares that name with an item whose body is future tense. |
| 2026-07-05 | (b) "DinoLand U.S.A. remains open" after the ledger's February 2, 2026 close. |
| 2026-07-23 | (d) Title "debuts at D23 Expo" while the body says the line "will debut" in August. |
| 2026-08-06 | (d) Teaser "new dining concept" shares Diamond Horseshoe with an item whose body says the change "will begin". |
| 2026-08-12 | (d) Teaser "new Cars Land details" shares Cars Land with an item whose body says the land is "coming" and the model "will debut". |
| 2026-08-15 | (d) Teaser "Indiana Jones temple facade debuts at D23" shares Indiana Jones with an item whose body says the models are for a land "coming" in 2027. |
| 2026-09-12 | (b) "DinoLand attractions remain operational" after the ledger's February 2, 2026 close. |
| 2026-11-12 | (d) Title "Now Meeting" and teaser "debut" while the body says "upcoming" about the film. The meet-and-greet itself may have been current; the rule still holds the issue. |

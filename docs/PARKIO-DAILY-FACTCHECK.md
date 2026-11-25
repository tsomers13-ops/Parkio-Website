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
| (b) | `data/parkio-daily/attraction-status.json` | On or after `effectiveDate`, operating language (`final season`, `last ride`, `last chance`, `one last`, `still open`, `running its`, `closing soon`, or a wait like `40 min` / `walk-on`) in a sentence that names the attraction. "Replacing DINOSAUR" and "DINOSAUR closed in February" pass. |
| (c) | The issue text, plus feed evidence when this run fetched feeds | A title or teaser that says a ride is down "this morning" / "today" while the body dates that event to another weekday. With feed evidence, same-day status wording also needs a cited item whose `pubDate` falls on the issue date in America/New_York. 11:30 PM ET the day before does not count. |
| (d) | The issue text, the ledger, and feed evidence when present | An undated "debuts" / "now open" / "now meeting" claim (or "new …" in the teaser or a right-now note) while that item's body is future tense ("is coming", "will open"). A claim that names a later date ("debuts August 7") passes. With feed evidence, a current-tense debut also needs an excerpt that is not future tense. |

Feed evidence is `title`, `link`, `pubDate` (ISO), `source`, and a short excerpt, written under `$RUNNER_TEMP` by `build.mjs`. It is not committed. When today's file already exists, `build.mjs` does not fetch again. The checker then uses the JSON-only backstop unless a release restored the held evidence file.

## Same-day release

Actions → Parkio Daily → Run workflow. The scheduler's normal dispatch leaves the inputs empty.

1. **Regenerate.** Leave the inputs blank. Fresh copy is checked again. If it passes, it commits and can publish.
2. **Release the held bytes.** `release_held_run_id` is the failed run's id. `ack` is every finding id from the artifact's `report.json` or the step summary, comma-separated. A missing or unknown id fails. The run logs `github.actor` into the commit message.
3. **Publish a correction.** Put the corrected JSON on a branch named `daily-fix/parkio-daily-YYYY-MM-DD` for today in America/New_York. Dispatch with `fixed_ref` set to that branch. The job copies only that JSON file, checks the shape, and runs the fact-check again. Ack any ids that remain.

Do not set both release inputs. Ack without one of them fails the run.

Committing a fix straight to `main` as yourself does not publish. The publish job only accepts the `parkio-daily-bot` author. The bot commit created by path 3 is that author, and it only contains the daily JSON and the generated social draft.

## Seeded facts

`attraction-status.json` lists DINOSAUR and DinoLand U.S.A. only. Disney Parks Blog, March 6, 2025, says DinoLand U.S.A. permanently closes February 2, 2026, and the final day to experience DINOSAUR is February 1, 2026. The same post also names The Dino Institute Shop, Restaurantosaurus, Restaurantosaurus Lounge, and several venues it said were already closed. Those are not in this file.

The operating-language list does not include "remains open" or "remain operational". Because of that, these already-published lines are not holds: `parkio-daily-2026-07-05` ("DinoLand U.S.A. remains open") and `parkio-daily-2026-09-12` ("DinoLand attractions remain operational"). Adding those phrases would be a separate change.

`facts.json` has one entry, Twilight Tales, tier `secondary`, `officialConfirmation: not-found`, window December 20, 2026 through January 3, 2027. That window is what PR #49 and the Nov 25, 2026 task report from fan sites. A fetch of the WDWNT URL while writing the file showed the headline "Coming to Disney's Animal Kingdom" and the byline November 24, 2026. The extracted page did not include December 20 or January 3. No BlogMickey URL is stored. Official Disney pages were not found confirming it (PR #49).

## Replay

JSON-only replay of the 198 issues in `content/guide/daily` holds 5, all on check (d). Checks (a), (b), and (c) hold none of them. Source-date rules need the run's feed evidence, which was not saved for those past issues, so this replay does not estimate how many of them (c) or evidence (d) would have held.

| Issue | Why (d) holds |
| --- | --- |
| 2026-07-23 | Title "debuts at D23 Expo" while the body says the line "will debut" in August. |
| 2026-08-06 | Teaser "new dining concept" shares Diamond Horseshoe with an item whose body says the change "will begin". |
| 2026-08-12 | Teaser "new Cars Land details" shares Cars Land with an item whose body says the land is "coming" and the model "will debut". |
| 2026-08-15 | Teaser "Indiana Jones temple facade debuts at D23" shares Indiana Jones with an item whose body says the models are for a land "coming" in 2027. |
| 2026-11-12 | Title "Now Meeting" and teaser "debut" while the body says "upcoming" about the film. The meet-and-greet itself may have been current; the rule still holds the issue. |

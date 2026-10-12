# parkio-daily-scheduler

A dedicated, minimal, cron-only Cloudflare Worker whose only job is to fire
`parkio-daily.yml`'s **existing** `workflow_dispatch:` trigger reliably at
6:45 AM America/New_York — replacing GitHub Actions' own `schedule:`
trigger, which has shown chronic 5–6+ hour delays (Oct 9: 6h21m, Oct 10:
5h07m, Oct 11: 5h34m, all against an 11:00 UTC target).

**This PR implements and tests the code only.** Nothing has been deployed,
no Cloudflare resources have been created, and no credentials have been
created or rotated. See the deployment checklist below for what has to
happen, in order, before this does anything in production.

## What this does NOT change

Everything downstream of the trigger is the existing, unmodified,
protected pipeline: `build.mjs`'s idempotency check, the `check` job's
already-published guard, tooling isolation, baseline resolution and
revalidation under lock, `productionDeployLock.mjs`'s acquire/deploy/
release, `validatePublishCandidate.mjs`'s allowlist/schema/author checks.
`parkio-daily.yml` already supports `workflow_dispatch:` today (it's how
every manual back-fill and every activation attempt this week was run) —
this Worker just calls that same, already-tested entry point on a
reliable clock instead of GitHub's own.

## Architecture

```
Cloudflare Cron Trigger (4 entries — see "Scheduling" below)
  -> parkio-daily-scheduler Worker, scheduled() handler only
       - 6:45 AM ET ticks -> DispatchGuard (Durable Object, "dispatch"
         purpose) -> GitHub workflow_dispatch REST API ->
         parkio-daily.yml (unchanged)
       - 7:15 AM ET ticks -> read https://parkio.info/feed.xml -> if
         today's article is missing -> DispatchGuard ("alert" purpose,
         independent of "dispatch") -> email alert
```

No `fetch()` handler is exported — only `scheduled()`. Cloudflare Workers
only route HTTP requests to a Worker that exports `fetch()`; without one,
there is no route, no public endpoint, and no code path by which a
browser or website visitor could ever reach this Worker or the GitHub
token it holds.

### Why a separate Worker, not a cron trigger on the existing `parkio` Worker

- **Blast radius.** The GitHub dispatch token has nothing to do with
  serving web traffic. Keeping it out of the much larger production
  Worker means a bug anywhere in that codebase can't expose it.
- **Review-gate mismatch.** The production Worker's config changes go
  through a heavy, human-reviewed gate (`production` GitHub environment,
  required reviewers — see `docs/PRODUCTION-DEPLOYMENT-PLAN.md`).
  Scheduling is an unrelated concern and shouldn't have to ride through
  that gate.
- **Auditability.** This Worker is small enough to read top to bottom in
  one sitting.

### What this Worker can and cannot touch

This Worker holds no Cloudflare credential of any kind and makes no
Cloudflare API call of any kind — grep `src/` for `CLOUDFLARE` or
`wrangler` and there is nothing. Its only three external calls, total,
are: the GitHub `workflow_dispatch` REST endpoint, a read-only `GET` of
`https://parkio.info/feed.xml`, and an outbound email send. It cannot
modify the production `parkio` Worker, its routes, its D1 database, or
anything else about it — directly or indirectly — because it has no
mechanism to do so. The only thing it can do is ask GitHub Actions to run
the exact same `parkio-daily.yml` pipeline a human already runs manually
today, which is itself the thing that holds `CLOUDFLARE_API_TOKEN` (in a
completely separate GitHub Environment, `daily-publish`) and performs the
actual production deploy, under its own unchanged lock/baseline/allowlist
safeguards.

## Security — credentials

- **Credential:** a GitHub **fine-grained personal access token**, scoped
  to **Parkio-Website only**, with exactly one permission: **Actions:
  Read and write**. No `contents`, no `secrets`, no `administration`.
- **Storage:** a Cloudflare Worker **secret** (`wrangler secret put`),
  never a plaintext `vars` entry, bound only to this Worker.
- **Never exposed to the website or browser:** there is no `fetch()`
  handler, so no HTTP request of any kind reaches this Worker's code —
  structurally, not just by convention.
- Never logged. `src/githubDispatch.ts` redacts the token from any error
  text as a defense-in-depth measure even though GitHub would never echo
  it back. See `test/credentialHandling.test.ts`, which asserts the token
  appears in exactly one place (the Authorization header of the one
  GitHub API call) across success, confirmed-failure, AND ambiguous
  (network-throw) outcomes.

## Scheduling — DST handled without manual seasonal edits

Cloudflare Cron Triggers are UTC-only; there's no IANA-timezone cron
option. Four cron entries are defined, in bracketed EDT/EST pairs:

| Cron (UTC) | Purpose | Matches when |
|---|---|---|
| `45 10 * * *` | dispatch candidate | 6:45 AM **EDT** |
| `45 11 * * *` | dispatch candidate | 6:45 AM **EST** |
| `15 11 * * *` | missed-publication check candidate | 7:15 AM **EDT** |
| `15 12 * * *` | missed-publication check candidate | 7:15 AM **EST** |

The fallback check runs 30 minutes after the dispatch — enough room for
the pipeline's own ~5-minute runtime, with margin, before concluding
anything is actually missing.

Every tick fires, but `src/easternTime.ts` computes the REAL
America/New_York wall-clock time for that instant (via
`Intl.DateTimeFormat` with real IANA tz data, not a hardcoded offset) and
the handler no-ops unless it's genuinely the target local minute right
now. Only one of each pair ever actually proceeds on a given day; this
self-adjusts across the spring-forward/fall-back transitions automatically
— verified directly in `test/easternTime.test.ts` against the real 2026
US DST dates (starts Sun Mar 8, ends Sun Nov 1).

## Duplicate-dispatch prevention and concurrent invocations

A `DispatchGuard` Durable Object, addressed by one fixed, well-known
instance id, holds the Eastern calendar date of the last successful claim
— separately for two independent purposes, `"dispatch"` and `"alert"`,
each with its own storage key, so claiming one never affects the other.
Two hazards motivate the Durable Object specifically:

1. Both bracket ticks firing close together (clock skew, a near-boundary
   redeploy).
2. Cloudflare Cron Triggers are documented as at-least-once, not
   exactly-once, delivery — a single logical tick can in rare cases
   invoke the Worker more than once.

Durable Objects process every request to one instance strictly one at a
time (never truly in parallel), so routing every claim attempt through a
single instance id gives real mutual exclusion with no database and no
lock protocol. `test/dispatchGuard.test.ts` models that exact platform
guarantee (not just calling the bare class concurrently, which would
*not* be safe on its own — the test proves that distinction explicitly)
and confirms exactly one winner across up to 20 simultaneous claim
attempts for the same date and purpose, with the two purposes never
contending with each other.

### What happens if GitHub accepts the dispatch but the response is lost

GitHub's `workflow_dispatch` endpoint is **not idempotent** — each
successful `POST` queues a new real run. An earlier version of this
Worker retried once on any failure, including a network-level exception.
**Found and fixed during final review, before any deploy:** if the first
`POST` actually reached GitHub and was processed, but the response never
came back (a timeout, a dropped connection), that retry would have fired
a second real dispatch on top of one that silently succeeded.

`dispatchWorkflow` now makes **exactly one HTTP attempt, never retries**,
and classifies the outcome:
- **Confirmed** (`ambiguous: false`) — GitHub's own HTTP response was
  received, success or failure. We know for certain whether a run was
  created. On a confirmed failure, the claim is released, since nothing
  happened.
- **Ambiguous** (`ambiguous: true`) — a network-level exception; no
  response was ever observed. We genuinely don't know what GitHub did.
  The claim is **left in place** rather than released, so nothing else in
  the system attempts a second real dispatch on top of one that might
  have already gone through — the same confirmed-vs-ambiguous philosophy
  `productionDeployLock.mjs` already uses for the same reason. A clear
  `console.error` is emitted either way; the 7:15 AM fallback check
  independently confirms whether today's article actually went out.

`test/duplicateDispatchPrevention.test.ts` drives `handleDispatchTick`
itself (not just the lower-level unit) across repeated invocations for
the same Eastern date and proves this exactly: an ambiguous outcome makes
one GitHub call and a second tick makes zero more; a confirmed failure
makes one call and a second tick DOES retry (correctly, since nothing was
created); a success makes one call and a second tick never calls GitHub
again; a genuinely new date always gets its own fresh attempt.

## Missed-publication monitoring

At the 7:15 AM ET fallback tick, the Worker does a read-only fetch of
`https://parkio.info/feed.xml` and checks whether today's expected slug
appears (using the same Eastern-calendar-date logic as the dispatch side
— `test/missedPublicationCheck.test.ts` confirms the slug it checks for
is genuinely Eastern-local, not UTC). If the article is missing, it sends
an email alert via `src/alerting.ts`'s `AlertSender` interface — but only
once per day: the same `DispatchGuard` DO, under the independent `"alert"`
purpose, dedupes the fallback check exactly the way the dispatch side
dedupes itself, so a Cloudflare at-least-once re-delivery of this tick
can't send a second email for the same missed day
(`test/alertDeduplication.test.ts`).

**Flagging honestly:** the concrete `AlertSender` implementation
(`CloudflareEmailAlertSender`, using Cloudflare's `send_email` Worker
binding) is unit-tested against the real `mimetext` library for message
construction, but the actual binding/account setup (a verified sending
address under Cloudflare Email Routing) can't be verified end-to-end
without a real deploy, which this PR doesn't do. If that path turns out
not to fit, `AlertSender` takes any other concrete sender without
touching the rest of the Worker.

## Parallel validation period

Per the approved plan, GitHub's native `schedule:` trigger on
`parkio-daily.yml` stays in place, unmodified, for **7 consecutive days**
after this is deployed. This PR does not touch `.github/workflows/`.
Removing the native schedule afterward is its own small, separate,
reviewed change — not part of this PR.

## Buttondown polling

Out of scope for this PR per your instruction (investigate separately, do
not modify Buttondown). Noting for the record: the one data point
available (Oct 11) showed ~41 minutes between the pipeline completing and
the email actually arriving — third-party RSS-polling latency this
architecture cannot control. Even perfect 6:45 AM triggering only
guarantees the article is live on the site/RSS by roughly 6:50–6:55 AM;
final email delivery depends on Buttondown's own poll cadence.

## Tests

61 tests, all passing (`npm test` from this directory):

| File | Covers |
|---|---|
| `test/easternTime.test.ts` | EDT, EST, both DST transition boundaries, the dual-cron-bracket matching logic |
| `test/dispatchGuard.test.ts` | Duplicate claims, release-on-confirmed-failure, concurrent invocations (via a harness that models the real DO serialization guarantee — and a companion test showing the *un*-serialized bare class is NOT safe, so the serialized test is proven to be doing real work), the `"dispatch"`/`"alert"` purposes being fully independent, and the HTTP entrypoint rejecting a missing/invalid purpose |
| `test/githubDispatch.test.ts` | Request shape, the no-retry design (exactly one HTTP attempt, always), confirmed-vs-ambiguous classification (4xx/5xx are confirmed; network throws are ambiguous), token redaction |
| `test/duplicateDispatchPrevention.test.ts` | End-to-end through `handleDispatchTick` across repeated invocations: an ambiguous outcome never retries, a confirmed failure does, success never double-dispatches, a new date always gets its own attempt |
| `test/missedPublicationCheck.test.ts` | Before/at/after the real 7:15 AM fallback time, present/missing article, correct Eastern (not UTC) calendar date |
| `test/alertDeduplication.test.ts` | End-to-end through `handleFallbackCheckTick`: exactly one email per missed day even across repeated ticks, no email when the article is live, a new day gets its own alert, and the alert/dispatch dedupes don't contend with each other |
| `test/alerting.test.ts` | Real `mimetext` MIME construction (caught a real subject-encoding detail — base64/RFC 2047 — that a mock would have hidden) |
| `test/credentialHandling.test.ts` | End-to-end: the token appears in exactly one header of one call, never logged, across success, confirmed-failure, AND ambiguous outcomes; a non-target tick never touches `fetch` at all |

Also: `npm run typecheck` is clean, and `workers/` was added to the root
repo's `tsconfig.json` `exclude` list — without that, the main app's own
`tsc --noEmit` gate (the same one `parkio-daily-publish.yml` runs) broke
on this Worker's Cloudflare-specific globals (`DurableObjectNamespace`,
`ScheduledEvent`, `ExecutionContext`), which aren't declared under the
main app's DOM-flavored `lib`. Confirmed broken before the fix, confirmed
clean after, and confirmed the main repo's full 980-test suite is
unaffected either way.

**Not yet tested:** a real deploy against Miniflare/`wrangler dev` or the
actual Cloudflare Durable Object runtime, and the real `send_email`
binding. Both require the deploy step this PR deliberately does not take.

## Deployment checklist (none of this has been done)

1. **Decide the alert path.** Confirm the `send_email` binding fits (needs
   a verified sending address under this account's Cloudflare Email
   Routing), or swap in a different `AlertSender` implementation.
2. **Create the GitHub fine-grained PAT:** repository-scoped to
   `Parkio-Website` only, permission `Actions: Read and write`, nothing
   else.
3. **Fill in** `ALERT_FROM_ADDRESS` / `ALERT_TO_ADDRESS` in
   `wrangler.jsonc`'s `vars` (currently placeholder values).
4. `cd workers/parkio-daily-scheduler && npx wrangler deploy --config wrangler.jsonc --dry-run`
   first, to validate config/build without publishing anything.
5. `npx wrangler secret put GITHUB_DISPATCH_TOKEN --config wrangler.jsonc`
   — paste the PAT from step 2. This is the only secret this Worker needs.
6. `npx wrangler deploy --config wrangler.jsonc` — the real deploy. Only
   at this point does the Durable Object namespace actually get
   provisioned and the cron triggers start firing.
7. Watch the next 6:45 AM ET tick (both sides of the trial): confirm via
   `wrangler tail` or the dashboard that exactly one dispatch call fires
   and `parkio-daily.yml` starts.
8. Begin the 7-day parallel validation period (GitHub's `schedule:` stays
   untouched throughout).
9. After 7 clean days, in a separate PR: remove the `schedule:` block from
   `parkio-daily.yml`.

## Rollback

- **During the trial (steps 1–8 above, GitHub's `schedule:` still
  active):** delete or pause the Cron Triggers (`wrangler delete` or
  remove `triggers.crons` and redeploy). GitHub's native schedule
  continues exactly as before — worst case is today's known (delayed but
  functional) status quo, zero new risk introduced.
- **After GitHub's `schedule:` has been removed:** revert that one-line
  removal in its own PR to restore the native cron immediately.
- **At any point:** revoke the fine-grained PAT from GitHub's side. It has
  no permission beyond `Actions: Read and write` on this one repo, so
  revoking it breaks nothing else, anywhere.
- No data migration, no D1/ratings/content involvement anywhere in this
  design — rollback risk is effectively zero at every stage.

## Costs

- **Cloudflare:** Cron Triggers are free; a handful of Worker invocations
  per day is negligible against even the Workers Free plan. ~$0/month
  incremental.
- **GitHub Actions:** the real `parkio-daily.yml` run cost is unchanged
  (~5 minutes/day, same as today) — only the trigger source changes.
  During the 7-day parallel period, an occasional redundant run (if both
  triggers fire) is a cheap, idempotent no-op per the duplicate-prevention
  design above.
- **Net:** effectively free, to build and to run.

# parkio-daily-scheduler

A dedicated, minimal, cron-only Cloudflare Worker whose only job is to fire
`parkio-daily.yml`'s **existing** `workflow_dispatch:` trigger reliably at
6:45 AM America/New_York — replacing GitHub Actions' own `schedule:`
trigger, which has shown chronic 5–6+ hour delays (Oct 9: 6h21m, Oct 10:
5h07m, Oct 11: 5h34m, all against an 11:00 UTC target). It also dispatches
a second, tiny GitHub Actions workflow at 7:15 AM to confirm the article
actually went out, using GitHub's own native failure-notification email
rather than sending email itself.

**This PR implements and tests the code only.** Nothing has been deployed,
no Cloudflare resources have been created, and no credentials have been
created or rotated. See the deployment checklist below for what has to
happen, in order, before this does anything in production.

## What this does NOT change

Everything downstream of the 6:45 AM trigger is the existing, unmodified,
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
       - 7:15 AM ET ticks -> DispatchGuard ("alert" purpose,
         independent of "dispatch") -> GitHub workflow_dispatch REST API
         -> parkio-daily-health-check.yml (new, tiny, read-only) -> fails
         if today's article isn't live -> GitHub's own native
         failure-notification email
```

Both schedules are now the *same* underlying action — "reliably dispatch
GitHub workflow X once per Eastern day, with duplicate prevention and no
auto-retry on an ambiguous outcome" — just pointed at two different
workflow files. `handleScheduledDispatch` in `src/index.ts` is that one
action; `handleDispatchTick` and `handleHealthCheckTick` are two thin,
parameterized callers.

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
`wrangler` and there is nothing. Its only external calls, ever, are to
GitHub's `workflow_dispatch` REST endpoint. It cannot modify the
production `parkio` Worker, its routes, its D1 database, or anything else
about it — directly or indirectly — because it has no mechanism to do so.
The only thing it can do is ask GitHub Actions to run a workflow that
already exists, exactly the way a human already does from the Actions
tab. Neither workflow it can dispatch holds this Worker's token, and
neither can deploy anything on its own: `parkio-daily.yml` still goes
through its own unchanged, separately-credentialed pipeline
(`CLOUDFLARE_API_TOKEN` lives only in GitHub's `daily-publish`
environment, never here), and `parkio-daily-health-check.yml` is
read-only end to end — see "Health check" below.

## Security — credentials

- **Credential:** a GitHub **fine-grained personal access token**, scoped
  to **Parkio-Website only**, with exactly one permission: **Actions:
  Read and write**. No `contents`, no `secrets`, no `administration`.
  Covers dispatching *both* workflow files — fine-grained PAT permissions
  are repo-scoped, not per-workflow — so no broader scope is needed for
  the health check than was already planned for the real dispatch. This
  is now the **only** credential this Worker needs, of any kind.
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

## Workers Free plan compatibility

This Worker uses exactly two Cloudflare capabilities: **Cron Triggers**
(free on every plan) and **one Durable Object** with the **SQLite**
storage backend. Durable Objects themselves are fully available on the
Workers Free plan — confirmed directly, not assumed — but only with the
SQLite backend; `wrangler.jsonc`'s migration uses `new_sqlite_classes`,
not the older `new_classes` (which, separately, Cloudflare no longer
accepts for *any* new Durable Object namespace regardless of plan — found
and fixed here before it could become a deploy-time surprise).
`DispatchGuard`'s own code needed no change for this: the SQLite backend
has full parity with the classic `storage.get/put/delete` API it already
uses (implemented internally via a hidden table — confirmed against
Cloudflare's own docs).

**No Cloudflare Email Sending, no `send_email` binding, no Workers Paid
dependency of any kind.** An earlier version of this Worker used
Cloudflare's `send_email` binding for the 7:15 AM alert; that capability
turned out to require the Workers Paid plan, which is the reason this
design changed to dispatch a second GitHub Actions workflow instead — see
"Health check" below. Confirmed via a `wrangler deploy --dry-run` that
the bundle no longer references any email binding at all.

## Scheduling — DST handled without manual seasonal edits

Cloudflare Cron Triggers are UTC-only; there's no IANA-timezone cron
option. Four cron entries are defined, in bracketed EDT/EST pairs:

| Cron (UTC) | Purpose | Matches when |
|---|---|---|
| `45 10 * * *` | Parkio Daily dispatch candidate | 6:45 AM **EDT** |
| `45 11 * * *` | Parkio Daily dispatch candidate | 6:45 AM **EST** |
| `15 11 * * *` | health-check dispatch candidate | 7:15 AM **EDT** |
| `15 12 * * *` | health-check dispatch candidate | 7:15 AM **EST** |

The health check runs 30 minutes after the dispatch — enough room for the
pipeline's own ~5-minute runtime, with margin, before concluding anything
is actually missing.

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
— separately for two independent purposes, `"dispatch"` (the real
pipeline) and `"alert"` (the health check), each with its own storage
key, so claiming one never affects the other. Two hazards motivate the
Durable Object specifically:

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

### What happens if GitHub accepts a dispatch but the response is lost

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
  `console.error` is emitted either way, naming which purpose it was.

`test/duplicateDispatchPrevention.test.ts` and `test/healthCheckDispatch.test.ts`
drive `handleDispatchTick`/`handleHealthCheckTick` themselves (not just
the lower-level unit) across repeated invocations for the same Eastern
date and prove this exactly, for both purposes: an ambiguous outcome
makes one GitHub call and a second tick makes zero more; a confirmed
failure makes one call and a second tick DOES retry (correctly, since
nothing was created); a success makes one call and a second tick never
calls GitHub again; a genuinely new date always gets its own fresh
attempt; and the two purposes dispatch independently without contending
for the same claim.

## Health check (replaces the earlier Cloudflare-email design)

At the 7:15 AM ET tick, the Worker dispatches a second, tiny, new GitHub
Actions workflow: `.github/workflows/parkio-daily-health-check.yml`.
That workflow reuses the existing, already-tested
`scripts/parkio-daily/checkAlreadyPublished.mjs` — no new application
logic — to check whether today's article is actually live, and **fails
the run** if it isn't (or if the check is inconclusive — fail-closed, the
same philosophy the rest of this pipeline already uses). GitHub's own
native "email me when a workflow I started fails" feature is what
delivers the alert — see "Enabling GitHub failure notifications" below.

This is deliberately `workflow_dispatch:`-only, with no `schedule:` of
its own — routing it through GitHub's native schedule would reintroduce
the exact multi-hour delay problem this whole project exists to solve,
for the one thing most worth catching reliably. It's also completely
isolated from the real pipeline: no interaction with
`productionDeployLock.mjs`, no content writes, no deploy. It cannot
interrupt or duplicate a real publish by construction — the worst it can
do is fail and notify (requirement: "duplicate health checks cannot cause
duplicate publication" — satisfied structurally, not by a runtime check,
since this workflow has no write path to anything at all).

### Why Cloudflare email was dropped

Cloudflare Email Sending (the `send_email` Worker binding) requires the
**Workers Paid** plan. Rather than work around that with a different paid
service, this design removes the need for Worker-sent email entirely —
`src/alerting.ts`, `test/alerting.test.ts`, the `send_email` binding, and
the `ALERT_FROM_ADDRESS`/`ALERT_TO_ADDRESS` vars are all gone. The Worker
no longer has any email-sending capability of any kind, which is also
what makes it fully compatible with the Workers Free plan (see above).

### Enabling GitHub failure notifications (you do this, not Claude)

1. github.com → your profile photo → **Settings** → **Notifications**.
2. Under the **Actions** section, choose **Email**, and check **"Only
   notify for failed workflows."**
3. Confirm the email address on your GitHub account (Settings → Emails)
   is `tsomers13@gmail.com`, or forwards there.

### Verified against GitHub's documented behavior (not assumed)

GitHub's own documented behavior is that workflow-failure notifications
go to **whoever started the run** (or whoever authored the workflow YAML,
as a fallback) — not to arbitrary watchers. Since this Worker dispatches
using your own fine-grained PAT, the dispatched run's actor is your own
GitHub account (`tsomers13-ops`), so the notification goes to that
account's configured email — the same account these PRs have been
authored under all along.

### Known limitation: a dispatch that never starts generates no notification

If the 7:15 AM dispatch itself hits an **ambiguous** outcome (ends up
believing it might have fired when it didn't, or GitHub never received
it) — no GitHub Actions run starts at all, so there is nothing for
GitHub's native notification to attach to. This is a real gap, not
papered over: it's the one scenario where this design's alerting could
itself go silent. It's also an inherently rare case (the same
confirmed/ambiguous split the real 6:45 AM dispatch already relies on,
observed zero times in this project's own real activation attempts so
far) and bounded in impact — the real 6:45 AM dispatch has the exact same
exposure, and nothing in this design makes the health check's own
dispatch less reliable than the pipeline's. If this ever matters enough
to close, the next step would be a second, independent layer (e.g., an
external uptime-style monitor hitting the live site directly) — not
something this PR implements.

### Controlled test plan, proving a failing health check really does notify

Once deployed (a separate, later, authorized step) and with GitHub
failure-email notifications enabled per above:

1. Confirm today's article is already live (expected most days).
2. Manually dispatch `parkio-daily-health-check.yml` once from the
   Actions tab (`gh workflow run parkio-daily-health-check.yml`) — this
   should **pass**, proving the happy path works against real,
   already-published content.
3. To deliberately prove the failure path end-to-end without waiting for
   an actual missed day: dispatch it with the repository temporarily
   checked out at a commit from *before* today's article was generated
   (`gh workflow run parkio-daily-health-check.yml --ref <old-sha>`) —
   the script will correctly see no `parkio-daily-<today>` entry in the
   live feed yet and fail, and that failure should produce exactly one
   email to `tsomers13@gmail.com` within a few minutes.
4. Confirm no production side effect of any kind occurred (this workflow
   has no write path, but worth confirming once): production Worker tag
   unchanged, deploy lock untouched, no content committed.

This test uses only the already-existing GitHub Actions run history and
your own notification settings — no new infrastructure, no new
credential, nothing deployed beyond the one workflow file.

## Parallel validation period

Per the approved plan, GitHub's native `schedule:` trigger on
`parkio-daily.yml` stays in place, unmodified, for **7 consecutive days**
after this is deployed. Removing the native schedule afterward is its own
small, separate, reviewed change — not part of this PR.

## Buttondown polling

Out of scope for this PR per earlier instruction (investigate separately,
do not modify Buttondown). Noting for the record: the one data point
available (Oct 11) showed ~41 minutes between the pipeline completing and
the email actually arriving — third-party RSS-polling latency this
architecture cannot control. Even perfect 6:45 AM triggering only
guarantees the article is live on the site/RSS by roughly 6:50–6:55 AM;
final newsletter delivery depends on Buttondown's own poll cadence,
separately from the health-check notification covered by this PR.

## Tests

52 tests, all passing (`npm test` from this directory):

| File | Covers |
|---|---|
| `test/easternTime.test.ts` | EDT, EST, both DST transition boundaries, the dual-cron-bracket matching logic |
| `test/dispatchGuard.test.ts` | Duplicate claims, release-on-confirmed-failure, concurrent invocations (via a harness that models the real DO serialization guarantee — and a companion test showing the *un*-serialized bare class is NOT safe, so the serialized test is proven to be doing real work), the `"dispatch"`/`"alert"` purposes being fully independent, and the HTTP entrypoint rejecting a missing/invalid purpose |
| `test/githubDispatch.test.ts` | Request shape, the no-retry design (exactly one HTTP attempt, always), confirmed-vs-ambiguous classification (4xx/5xx are confirmed; network throws are ambiguous), token redaction |
| `test/duplicateDispatchPrevention.test.ts` | End-to-end through `handleDispatchTick`: an ambiguous outcome never retries, a confirmed failure does, success never double-dispatches, a new date always gets its own attempt |
| `test/healthCheckDispatch.test.ts` | The same guarantees for `handleHealthCheckTick`: exactly one health-check dispatch per day even across repeated ticks, a new day gets its own dispatch, no auto-retry on an ambiguous outcome, and the alert/dispatch purposes don't contend with each other |
| `test/credentialHandling.test.ts` | End-to-end: the token appears in exactly one header of one call, never logged, across success, confirmed-failure, AND ambiguous outcomes; a non-target tick never touches `fetch` at all |

Also: `npm run typecheck` is clean, and `workers/` was added to the root
repo's `tsconfig.json` `exclude` list — without that, the main app's own
`tsc --noEmit` gate (the same one `parkio-daily-publish.yml` runs) broke
on this Worker's Cloudflare-specific globals (`DurableObjectNamespace`,
`ScheduledEvent`, `ExecutionContext`), which aren't declared under the
main app's DOM-flavored `lib`. Confirmed broken before the fix, confirmed
clean after, and confirmed the main repo's full 980-test suite is
unaffected either way.

The new `.github/workflows/parkio-daily-health-check.yml`'s own capture/
fail logic was tested directly against real `bash -e`, with stand-in
scripts reproducing all three real outcomes of
`checkAlreadyPublished.mjs` (`published` / `not-published` / `unknown`),
confirming each produces the correct exit code (0 / 1 / 1 respectively)
before relying on the real script.

**Not yet tested:** a real deploy against Miniflare/`wrangler dev` or the
actual Cloudflare Durable Object runtime. That requires the deploy step
this PR deliberately does not take.

## Deployment checklist

1. **Create the GitHub fine-grained PAT:** repository-scoped to
   `Parkio-Website` only, permission `Actions: Read and write`, nothing
   else. This is now the only credential needed anywhere in this design.
2. **Enable GitHub failure-email notifications** per the section above —
   needed for the health check to actually reach you; does not block
   deploying the Worker itself.
3. `cd workers/parkio-daily-scheduler && npx wrangler deploy --config wrangler.jsonc --dry-run`
   first, to validate config/build without publishing anything (already
   run once during this PR's preparation — succeeds cleanly).
4. `npx wrangler secret put GITHUB_DISPATCH_TOKEN --config wrangler.jsonc`
   — paste the PAT from step 1, run by you, not pasted into any tool
   output. This is the only secret this Worker needs.
5. `npx wrangler deploy --config wrangler.jsonc` — the real deploy. Only
   at this point does the Durable Object namespace actually get
   provisioned and the cron triggers start firing.
6. Watch the next 6:45 AM ET tick: confirm via `wrangler tail` or the
   dashboard that exactly one dispatch call fires and `parkio-daily.yml`
   starts. Then watch the 7:15 AM tick the same way for
   `parkio-daily-health-check.yml`.
7. Run the controlled notification test above at least once.
8. Begin the 7-day parallel validation period (GitHub's `schedule:` stays
   untouched throughout).
9. After 7 clean days, in a separate PR: remove the `schedule:` block from
   `parkio-daily.yml`.

## Rollback

- **During the trial (GitHub's `schedule:` still active):** delete or
  pause the Cron Triggers (via the dashboard, instantly, or
  `triggers.crons: []` + redeploy). GitHub's native schedule continues
  exactly as before — worst case is today's known (delayed but
  functional) status quo, zero new risk introduced.
- **After GitHub's `schedule:` has been removed:** revert that one-line
  removal in its own PR to restore the native cron immediately.
- **At any point:** revoke the fine-grained PAT from GitHub's side. It has
  no permission beyond `Actions: Read and write` on this one repo, so
  revoking it breaks nothing else, anywhere.
- No data migration, no D1/ratings/content involvement anywhere in this
  design — rollback risk is effectively zero at every stage.

## Costs

- **Cloudflare:** Cron Triggers are free; a SQLite-backed Durable Object
  is free on the Workers Free plan; a handful of Worker invocations per
  day is negligible. **No Workers Paid plan is required anywhere in this
  design.**
- **GitHub Actions:** the real `parkio-daily.yml` run cost is unchanged
  (~5 minutes/day) — only the trigger source changes. The new health
  check adds well under a minute of CI time once a day. During the 7-day
  parallel period, an occasional redundant run (if both triggers fire) is
  a cheap, idempotent no-op per the duplicate-prevention design above.
- **Net:** effectively free, to build and to run, on the Free plan
  permanently.

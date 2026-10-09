# Production deploy lock — recovery procedure

This covers the one state `scripts/deploy/productionDeployLock.mjs` never
clears automatically: **`recovery_required`**. It exists because a deploy
command can be interrupted — our own timeout, a cancelled GitHub Actions
run, or a hard-killed runner — in a way that leaves it genuinely unknown
whether Cloudflare finished processing that deploy. Automatically releasing
the lock in that situation would let a second deploy start while the first
might still be live. So instead, both automated workflows stop and wait for
a human.

## How to tell this has happened

- A `workers-production.yml` or `parkio-daily-publish.yml` run fails at the
  "Deploy Production Worker" step, with a log line starting
  `::error::Production deploy lock is now RECOVERY_REQUIRED`.
- Any subsequent run of either workflow will itself fail (after waiting up
  to its acquire timeout) with `lock is in recovery_required state`.
- `git fetch origin deploy-lock && git show origin/deploy-lock:lock.json`
  shows `"status": "recovery_required"`, with a `recovery` object giving
  the `reason` (`"timeout"`, `"cancelled"`, or
  `"expired_with_in_flight_deploy"` — the last meaning the holder never got
  a chance to report anything at all, e.g. it was hard-killed) and the
  `deployTag` of the deploy that was in flight.

## Step 1 — find out what actually happened (read-only, safe anytime)

```bash
node scripts/deploy/productionDeployLock.mjs check-tag wrangler.production.jsonc "sha:<the deployTag from lock.json>"
```

This reads the Worker's *actual current* deployment and version history
from Cloudflare (`wrangler deployments list` / `versions list`, both
read-only) and tells you whether that tag is the one currently serving
100% of production traffic:

- **`CONFIRMED: ... IS the currently active production deployment.`** — the
  ambiguous deploy did complete. The outcome was really "success".
- **`NOT ACTIVE: ... is NOT the currently active production deployment.`**
  — it never took effect; production is still on whatever was active
  before. The outcome was really "failure" (safe — nothing changed).

You can also just look directly: `npx wrangler deployments list --config
wrangler.production.jsonc` prints the current deployment in human-readable
form.

## Step 2 — clear the lock

```bash
node scripts/deploy/productionDeployLock.mjs recover "sha:<the same deployTag>" success   # or: failure
```

- The `deployTag` argument must match the one recorded in `lock.json`
  exactly — this is a sanity check against recovering the wrong incident.
- If `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` are set in your shell
  (same credentials CI uses), `recover` automatically repeats the Step 1
  check itself and **refuses** if it disagrees with what you typed, unless
  you also pass `--force`.
- If those credentials are not set, `recover` refuses to proceed blind
  unless you pass `--force` — i.e. verification is required by default,
  with an explicit, visible escape hatch, not a silent one.
- On success it pushes a fresh `"status": "unlocked"` state to the
  `deploy-lock` branch. Both workflows resume normal operation on their
  next run — no further action needed.

## If it keeps happening

A single `recovery_required` from an occasional network blip is expected
and fine to clear via the steps above. If it recurs often, that's a signal
the deploy timeout (`DEFAULT_DEPLOY_TIMEOUT_MS`, currently 120s) is too
tight for how long `wrangler deploy` actually takes, or that Cloudflare's
API is having a bad day — worth a closer look, not just repeated recovery.

## Emergency rollback — unaffected by any of this

The lock is purely a coordination mechanism *between the two automated
GitHub Actions workflows*. It has no power over, and is not consulted by,
a human running Cloudflare commands directly. If production needs to be
rolled back right now, do it directly — do not wait on this lock or this
procedure:

```bash
npx wrangler rollback --config wrangler.production.jsonc
# or: npx wrangler deploy --config wrangler.production.jsonc --tag "sha:<known-good-commit>"
```

This works regardless of the lock's current state, including while it
shows `recovery_required`. It does **not**, by itself, clear
`recovery_required` — that's a separate concern (it only means an *outcome*
is now settled on the Cloudflare side, not that the lock's bookkeeping has
caught up). After an emergency manual rollback, still run Step 1/Step 2
above so the automated workflows can resume.

## What this cannot do

If Cloudflare's own server-side processing of a deploy request is unusually
slow strictly *after* that request was already irrecoverably sent — before
any client would ever see a response — no amount of client-side timeout
handling can undo or observe that in real time. `check-tag`/`recover`
answer the question *after the fact*, once Cloudflare's own state has
settled, which is the best any client-side mechanism can do against a
third-party API with no native cancellation or idempotency token.

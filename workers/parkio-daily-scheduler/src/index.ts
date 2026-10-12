/**
 * parkio-daily-scheduler — a dedicated, minimal, cron-only Worker.
 *
 * Exports ONLY `scheduled()` — deliberately no `fetch()` handler, so there
 * is no HTTP route, no public endpoint, and no code path by which a
 * browser or website visitor could ever reach this Worker or the GitHub
 * token it holds. See src/githubDispatch.ts and src/dispatchGuard.ts for
 * the two pieces of real logic; this file only wires them together against
 * the real Cloudflare bindings.
 *
 * This Worker holds no Cloudflare credential of any kind and never calls
 * any Cloudflare API — its only external calls, ever, are to GitHub's
 * workflow_dispatch REST endpoint. It cannot reach, let alone modify, the
 * production `parkio` Worker directly; the only thing it can do is ask
 * GitHub Actions to run a workflow that already exists, the exact way a
 * human already does from the Actions tab.
 *
 * Both schedules — the real Parkio Daily dispatch and the health check —
 * are the SAME underlying action: "dispatch GitHub workflow X at time Y,
 * once per Eastern calendar day, with a durable claim and no auto-retry
 * on an ambiguous outcome." handleScheduledDispatch is that one action,
 * parameterized; this used to be email-sending logic for the health-check
 * side, until Cloudflare Email Sending turned out to require the Workers
 * Paid plan — replaced with dispatching a second, tiny GitHub Actions
 * workflow (parkio-daily-health-check.yml) that fails (and so triggers
 * GitHub's own native failure-notification email) if today's article
 * isn't actually live. No email-sending capability of any kind is used by
 * this Worker any more, which is also what makes it fully compatible with
 * the Workers Free plan.
 *
 * Four cron entries, two purposes, each bracketing both EDT and EST so the
 * schedule self-adjusts across DST with no manual seasonal edits:
 *   - "45 10 * * *" / "45 11 * * *": candidate ticks for the 6:45 AM
 *     Eastern Parkio Daily dispatch. Only the one matching the
 *     currently-active UTC offset will see isTargetEasternMinute(...)
 *     return true; the other no-ops.
 *   - "15 11 * * *" / "15 12 * * *": candidate ticks for the 7:15 AM
 *     Eastern health-check dispatch (30 minutes after the Daily dispatch,
 *     giving the ~5-minute pipeline room to finish first).
 */

import { isTargetEasternMinute, easternDateKey } from "./easternTime";
import { dispatchWorkflow, type DispatchConfig } from "./githubDispatch";
import { DispatchGuard, type GuardPurpose } from "./dispatchGuard";

export { DispatchGuard };

export interface Env {
  GITHUB_DISPATCH_TOKEN: string;
  DISPATCH_GUARD: DurableObjectNamespace;
  // Non-secret config, set via wrangler.jsonc `vars`.
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_REF: string;
  GITHUB_WORKFLOW_FILE: string;
  HEALTH_CHECK_WORKFLOW_FILE: string;
  TARGET_HOUR_ET: string;
  TARGET_MINUTE_ET: string;
  HEALTH_CHECK_HOUR_ET: string;
  HEALTH_CHECK_MINUTE_ET: string;
}

const DISPATCH_CRONS = new Set(["45 10 * * *", "45 11 * * *"]);
const HEALTH_CHECK_CRONS = new Set(["15 11 * * *", "15 12 * * *"]);

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (DISPATCH_CRONS.has(event.cron)) {
      ctx.waitUntil(handleDispatchTick(new Date(event.scheduledTime), env));
      return;
    }
    if (HEALTH_CHECK_CRONS.has(event.cron)) {
      ctx.waitUntil(handleHealthCheckTick(new Date(event.scheduledTime), env));
      return;
    }
  },
};

interface ScheduledDispatchOptions {
  targetHour: number;
  targetMinute: number;
  workflowFile: string;
  purpose: GuardPurpose;
  /** Only used in log lines, to tell the two purposes apart at a glance. */
  label: string;
}

async function handleScheduledDispatch(now: Date, env: Env, opts: ScheduledDispatchOptions): Promise<void> {
  if (!isTargetEasternMinute(now, opts.targetHour, opts.targetMinute)) {
    // The other DST-bracket tick for today; not the real local target time.
    return;
  }

  const todayKey = easternDateKey(now);
  const guardId = env.DISPATCH_GUARD.idFromName("parkio-daily-dispatch-guard");
  const guard = env.DISPATCH_GUARD.get(guardId);

  const claimRes = await guard.fetch(`https://dispatch-guard/claim?purpose=${opts.purpose}&dateKey=${todayKey}`);
  const claim = (await claimRes.json()) as { claimed: boolean; alreadyClaimedToday: boolean };
  if (!claim.claimed) {
    return; // Already dispatched today for this purpose — duplicate tick, safely ignored.
  }

  const config: DispatchConfig = {
    owner: env.GITHUB_OWNER,
    repo: env.GITHUB_REPO,
    workflowFile: opts.workflowFile,
    ref: env.GITHUB_REF,
    token: env.GITHUB_DISPATCH_TOKEN,
  };
  const outcome = await dispatchWorkflow(fetch, config);

  if (outcome.ok) {
    return;
  }

  if (outcome.ambiguous) {
    // We do not know whether GitHub actually created the run before we
    // lost the ability to observe the response. Do NOT release the claim
    // — doing so could let a later path fire a second real dispatch on
    // top of one that may have silently succeeded. Leave it claimed and
    // surface it loudly (mirroring productionDeployLock.mjs's
    // recovery_required philosophy: an unclear outcome is never resolved
    // by guessing). For the health-check purpose specifically, this also
    // means a health check that never even starts generates no failure
    // run and so no native GitHub notification — see README.md's
    // "Known limitation" section.
    console.error(
      `[parkio-daily-scheduler] AMBIGUOUS ${opts.label} dispatch outcome for ${todayKey} — status=${outcome.status}, error=${outcome.errorBody ?? "(none)"}. Claim left in place; verify manually before retrying.`
    );
    return;
  }

  // Confirmed failure: GitHub definitively did not create a run (bad
  // auth, not found, validation error, rate limit, or an edge rejection).
  // Safe to release — nothing happened, so the state should say so.
  console.error(
    `[parkio-daily-scheduler] CONFIRMED ${opts.label} dispatch failure for ${todayKey} — status=${outcome.status}, error=${outcome.errorBody ?? "(none)"}.`
  );
  await guard.fetch(`https://dispatch-guard/release?purpose=${opts.purpose}&dateKey=${todayKey}`);
}

export async function handleDispatchTick(now: Date, env: Env): Promise<void> {
  return handleScheduledDispatch(now, env, {
    targetHour: Number(env.TARGET_HOUR_ET),
    targetMinute: Number(env.TARGET_MINUTE_ET),
    workflowFile: env.GITHUB_WORKFLOW_FILE,
    purpose: "dispatch",
    label: "Parkio Daily",
  });
}

export async function handleHealthCheckTick(now: Date, env: Env): Promise<void> {
  return handleScheduledDispatch(now, env, {
    targetHour: Number(env.HEALTH_CHECK_HOUR_ET),
    targetMinute: Number(env.HEALTH_CHECK_MINUTE_ET),
    workflowFile: env.HEALTH_CHECK_WORKFLOW_FILE,
    purpose: "alert",
    label: "health-check",
  });
}

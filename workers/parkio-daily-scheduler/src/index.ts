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
 * any Cloudflare API — its only external calls are (1) GitHub's
 * workflow_dispatch REST endpoint, (2) a read-only GET of
 * https://parkio.info/feed.xml, and (3) an outbound email send. It cannot
 * reach, let alone modify, the production `parkio` Worker directly; the
 * only thing it can do is ask GitHub Actions to run the exact same
 * pipeline a human already runs from the Actions tab.
 *
 * Four cron entries, two purposes, each bracketing both EDT and EST so the
 * schedule self-adjusts across DST with no manual seasonal edits:
 *   - "45 10 * * *" / "45 11 * * *": candidate ticks for the 6:45 AM
 *     Eastern dispatch. Only the one matching the currently-active UTC
 *     offset will see isTargetEasternMinute(...) return true; the other
 *     no-ops.
 *   - "15 11 * * *" / "15 12 * * *": candidate ticks for the 7:15 AM
 *     Eastern missed-publication fallback check (30 minutes after the
 *     dispatch, giving the ~5-minute pipeline room to finish before
 *     concluding anything is actually missing).
 */

import { isTargetEasternMinute, easternDateKey } from "./easternTime";
import { dispatchWorkflow, type DispatchConfig } from "./githubDispatch";
import { DispatchGuard } from "./dispatchGuard";
import { checkMissedPublication, expectedSlugFor } from "./missedPublicationCheck";
import { CloudflareEmailAlertSender, type EmailMessageBuilderLike } from "./alerting";

export { DispatchGuard };

export interface Env {
  GITHUB_DISPATCH_TOKEN: string;
  DISPATCH_GUARD: DurableObjectNamespace;
  // Non-secret config, set via wrangler.jsonc `vars`.
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_WORKFLOW_FILE: string;
  GITHUB_REF: string;
  TARGET_HOUR_ET: string;
  TARGET_MINUTE_ET: string;
  FALLBACK_CHECK_HOUR_ET: string;
  FALLBACK_CHECK_MINUTE_ET: string;
  ALERT_FROM_ADDRESS: string;
  ALERT_TO_ADDRESS: string;
  // Optional — only bound once outbound email is actually configured at
  // deploy time (see src/alerting.ts).
  SEND_EMAIL?: { send(builder: EmailMessageBuilderLike): Promise<unknown> };
}

const DISPATCH_CRONS = new Set(["45 10 * * *", "45 11 * * *"]);
const FALLBACK_CHECK_CRONS = new Set(["15 11 * * *", "15 12 * * *"]);

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (DISPATCH_CRONS.has(event.cron)) {
      ctx.waitUntil(handleDispatchTick(new Date(event.scheduledTime), env));
      return;
    }
    if (FALLBACK_CHECK_CRONS.has(event.cron)) {
      ctx.waitUntil(handleFallbackCheckTick(new Date(event.scheduledTime), env));
      return;
    }
  },
};

export async function handleDispatchTick(now: Date, env: Env): Promise<void> {
  const targetHour = Number(env.TARGET_HOUR_ET);
  const targetMinute = Number(env.TARGET_MINUTE_ET);
  if (!isTargetEasternMinute(now, targetHour, targetMinute)) {
    // The other DST-bracket tick for today; not the real local target time.
    return;
  }

  const todayKey = easternDateKey(now);
  const guardId = env.DISPATCH_GUARD.idFromName("parkio-daily-dispatch-guard");
  const guard = env.DISPATCH_GUARD.get(guardId);

  const claimRes = await guard.fetch(`https://dispatch-guard/claim?purpose=dispatch&dateKey=${todayKey}`);
  const claim = (await claimRes.json()) as { claimed: boolean; alreadyClaimedToday: boolean };
  if (!claim.claimed) {
    return; // Already dispatched today — duplicate tick, safely ignored.
  }

  const config: DispatchConfig = {
    owner: env.GITHUB_OWNER,
    repo: env.GITHUB_REPO,
    workflowFile: env.GITHUB_WORKFLOW_FILE,
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
    // surface it loudly; the 7:15 AM fallback check will independently
    // confirm whether today's article actually went out, and a human can
    // decide from there (mirroring productionDeployLock.mjs's
    // recovery_required philosophy: an unclear outcome is never resolved
    // by guessing).
    console.error(
      `[parkio-daily-scheduler] AMBIGUOUS dispatch outcome for ${todayKey} — status=${outcome.status}, error=${outcome.errorBody ?? "(none)"}. Claim left in place; verify manually before retrying.`
    );
    return;
  }

  // Confirmed failure: GitHub definitively did not create a run (bad
  // auth, not found, validation error, rate limit, or an edge rejection).
  // Safe to release — nothing happened, so the state should say so.
  console.error(
    `[parkio-daily-scheduler] CONFIRMED dispatch failure for ${todayKey} — status=${outcome.status}, error=${outcome.errorBody ?? "(none)"}.`
  );
  await guard.fetch(`https://dispatch-guard/release?purpose=dispatch&dateKey=${todayKey}`);
}

export async function handleFallbackCheckTick(now: Date, env: Env): Promise<void> {
  const fallbackHour = Number(env.FALLBACK_CHECK_HOUR_ET);
  const fallbackMinute = Number(env.FALLBACK_CHECK_MINUTE_ET);
  if (!isTargetEasternMinute(now, fallbackHour, fallbackMinute)) {
    return;
  }

  const feedRes = await fetch("https://parkio.info/feed.xml");
  const feedXml = await feedRes.text();
  const expectedSlug = expectedSlugFor(now);
  const check = checkMissedPublication(now, feedXml, expectedSlug, fallbackHour, fallbackMinute);

  if (!check.shouldAlert) return;

  // Dedupe the alert itself, independent of the dispatch dedupe above: if
  // Cloudflare ever double-delivers this tick (same at-least-once
  // guarantee as the dispatch cron), this is what stops a second email
  // from going out for the same missed day.
  const todayKey = easternDateKey(now);
  const guardId = env.DISPATCH_GUARD.idFromName("parkio-daily-dispatch-guard");
  const guard = env.DISPATCH_GUARD.get(guardId);
  const claimRes = await guard.fetch(`https://dispatch-guard/claim?purpose=alert&dateKey=${todayKey}`);
  const claim = (await claimRes.json()) as { claimed: boolean; alreadyClaimedToday: boolean };
  if (!claim.claimed) {
    return; // Already alerted for today — duplicate tick, safely ignored.
  }

  if (!env.SEND_EMAIL) {
    // Alerting isn't wired up yet — surface it in Worker logs rather than
    // silently doing nothing, since this path means a day's publish may
    // genuinely be missing.
    console.error(`[parkio-daily-scheduler] MISSED PUBLICATION, no alert channel configured: ${check.reason}`);
    return;
  }

  const sender = new CloudflareEmailAlertSender(env.SEND_EMAIL, env.ALERT_FROM_ADDRESS, env.ALERT_TO_ADDRESS);
  await sender.send(
    `Parkio Daily may have missed today's publication (${expectedSlug})`,
    `${check.reason}\n\nChecked at ${now.toISOString()}.\nLive feed: https://parkio.info/feed.xml`
  );
}

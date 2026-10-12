/**
 * Calls GitHub's REST API to fire the EXISTING `workflow_dispatch:` trigger
 * on parkio-daily.yml. This is the only thing this Worker changes about
 * the pipeline: what causes the workflow to start. Everything after that
 * — content generation, the already-published check, baseline resolution
 * and revalidation under lock, productionDeployLock.mjs's acquire/deploy/
 * release, validatePublishCandidate.mjs's allowlist checks — is the
 * existing, unmodified pipeline, started exactly the way a human already
 * starts it from the Actions tab for a manual back-fill.
 *
 * Deliberately makes exactly ONE HTTP attempt, never retries. An earlier
 * version retried once on any failure, including a network-level
 * exception — but GitHub's workflow_dispatch endpoint is not idempotent:
 * each successful POST queues a new run. If the first POST actually
 * reached GitHub and was processed, but the response was lost to a
 * timeout or connection drop before this Worker saw it, a same-invocation
 * retry would fire a SECOND real dispatch on top of one that silently
 * succeeded. Found during final review, before any deploy — see
 * DispatchOutcome.ambiguous below for how the caller is expected to
 * react instead of blindly retrying.
 */

export interface DispatchConfig {
  owner: string;
  repo: string;
  workflowFile: string;
  ref: string;
  token: string;
}

export interface DispatchOutcome {
  ok: boolean;
  status: number;
  /**
   * True iff we have no way of knowing whether GitHub actually created the
   * dispatch before we lost the ability to observe the outcome (a network
   * error, a timeout, or any thrown exception during the request). False
   * for any case where GitHub's own HTTP response — success OR failure —
   * was received: a definitive answer, safe to act on without guessing.
   * Callers must NOT auto-retry when this is true, and should leave any
   * duplicate-dispatch claim in place rather than release it, exactly
   * mirroring productionDeployLock.mjs's confirmed-vs-ambiguous outcome
   * handling for the same underlying reason: a retry or an unlocked claim
   * could trigger — or allow — a second real side effect on top of one
   * that may have already happened.
   */
  ambiguous: boolean;
  /** Present only on a non-ok outcome; never includes the token. */
  errorBody?: string;
}

export function buildDispatchRequest(config: DispatchConfig): { url: string; init: RequestInit } {
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/actions/workflows/${config.workflowFile}/dispatches`;
  return {
    url,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "parkio-daily-scheduler",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: config.ref }),
    },
  };
}

type FetchLike = (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** Exactly one HTTP attempt. No retry — see the module header for why. */
export async function dispatchWorkflow(fetchImpl: FetchLike, config: DispatchConfig): Promise<DispatchOutcome> {
  const { url, init } = buildDispatchRequest(config);
  try {
    const res = await fetchImpl(url, init);
    if (res.ok) {
      return { ok: true, status: res.status, ambiguous: false };
    }
    // GitHub answered definitively: this specific POST did not create a
    // run (the API rejected it outright — bad auth, not found, validation
    // error, rate limit, or an edge-level server error that never reached
    // workflow-dispatch logic). Not ambiguous: we know what happened.
    const errorBody = await res.text().catch(() => "");
    return { ok: false, status: res.status, ambiguous: false, errorBody: redactToken(errorBody, config.token) };
  } catch (err) {
    // No HTTP response was ever observed — a network error, a timeout, a
    // dropped connection. GitHub may have received and fully processed
    // the request before we lost it. Genuinely unknown; never retried.
    return { ok: false, status: 0, ambiguous: true, errorBody: redactToken(String(err), config.token) };
  }
}

/** Defense in depth: GitHub would never echo the token back, but never let
 * it reach a log line even if some future error path reflected request
 * details. */
function redactToken(text: string, token: string): string {
  if (!token) return text;
  return text.split(token).join("[REDACTED]");
}

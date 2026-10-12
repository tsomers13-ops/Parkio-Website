/**
 * Calls GitHub's REST API to fire the EXISTING `workflow_dispatch:` trigger
 * on parkio-daily.yml. This is the only thing this Worker changes about
 * the pipeline: what causes the workflow to start. Everything after that
 * — content generation, the already-published check, baseline resolution
 * and revalidation under lock, productionDeployLock.mjs's acquire/deploy/
 * release, validatePublishCandidate.mjs's allowlist checks — is the
 * existing, unmodified pipeline, started exactly the way a human already
 * starts it from the Actions tab for a manual back-fill.
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
  /** Present only on a non-2xx response; never includes the token. */
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

/**
 * Single dispatch attempt, with exactly one immediate retry on failure —
 * bounded, not a loop: this fires at most twice a day per cron entry, so
 * there's no risk of a retry storm, and the dispatch-guard claim is only
 * taken once this function reports success, so a persistent failure here
 * leaves the day's claim open for the other DST-bracket tick or a manual
 * retry rather than silently eating the day's only attempt.
 */
export async function dispatchWorkflow(fetchImpl: FetchLike, config: DispatchConfig): Promise<DispatchOutcome> {
  const { url, init } = buildDispatchRequest(config);
  const attempt = async (): Promise<DispatchOutcome> => {
    try {
      const res = await fetchImpl(url, init);
      if (res.ok) return { ok: true, status: res.status };
      const errorBody = await res.text().catch(() => "");
      return { ok: false, status: res.status, errorBody: redactToken(errorBody, config.token) };
    } catch (err) {
      return { ok: false, status: 0, errorBody: redactToken(String(err), config.token) };
    }
  };

  const first = await attempt();
  if (first.ok) return first;
  return attempt();
}

/** Defense in depth: GitHub would never echo the token back, but never let
 * it reach a log line even if some future error path reflected request
 * details. */
function redactToken(text: string, token: string): string {
  if (!token) return text;
  return text.split(token).join("[REDACTED]");
}

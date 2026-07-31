/**
 * Shared error utilities.
 *
 * Parkio degrades gracefully almost everywhere: when themeparks.wiki is
 * down we still serve the static attraction list, and when a browser
 * fetch fails we keep the last-known data on screen. That is the right
 * user-facing behavior, but a fallback that leaves no trace is
 * indistinguishable from a bug. These helpers give every fallback path
 * one consistent, greppable log line.
 *
 * Edge-runtime safe — `console` only, no Node APIs.
 */

/** True for fetches we cancelled ourselves (unmount, refetch, navigation). */
export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/** A short, log-safe description of an unknown thrown value. */
export function describeError(err: unknown): string {
  if (err instanceof Error) {
    const cause =
      err.cause instanceof Error ? ` (cause: ${err.cause.message})` : "";
    return `${err.name}: ${err.message}${cause}`;
  }
  return String(err);
}

/**
 * Log a degraded-but-handled failure on the server.
 *
 * `context` should identify what was being fetched (park slug, endpoint)
 * so a spike in fallbacks can be traced to a specific park or route.
 */
export function logUpstreamFailure(
  scope: string,
  context: string,
  err: unknown,
): void {
  // eslint-disable-next-line no-console
  console.warn(
    `[${scope}] upstream fetch failed for ${context} — serving fallback: ${describeError(err)}`,
  );
}

/**
 * Log a handled failure in the browser. Aborts are expected control flow
 * and are never logged.
 */
export function logClientFailure(
  scope: string,
  context: string,
  err: unknown,
): void {
  if (isAbortError(err)) return;
  // eslint-disable-next-line no-console
  console.warn(`[${scope}] ${context}: ${describeError(err)}`);
}

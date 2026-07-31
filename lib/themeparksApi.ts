/**
 * Thin client for the upstream themeparks.wiki API.
 *
 * This module is INTERNAL. It must only be imported by:
 *   - Other lib/* modules (the normalizer)
 *   - Server-side route handlers (app/api/*)
 *
 * Never import this from a client component, page, or the iOS app —
 * always go through Parkio's own /api/* routes so we can cache,
 * normalize, and gracefully degrade.
 *
 * Docs: https://api.themeparks.wiki/docs/v1.html
 */

const BASE_URL = "https://api.themeparks.wiki/v1";

/** A queue entry inside the live-data response. Loosely typed. */
export interface ThemeparksLiveEntry {
  id: string;
  name: string;
  entityType: "ATTRACTION" | "SHOW" | "RESTAURANT" | "PARK" | string;
  status?: "OPERATING" | "DOWN" | "CLOSED" | "REFURBISHMENT";
  queue?: {
    STANDBY?: { waitTime: number | null };
    SINGLE_RIDER?: { waitTime: number | null };
    RETURN_TIME?: { state: string };
  };
  /**
   * Show / parade / meet-and-greet schedule for the entity. Populated
   * by the upstream when the entity has scheduled performance windows.
   * Times are ISO-8601 with the park's UTC offset.
   */
  showtimes?: Array<{
    type?: string;
    startTime?: string;
    endTime?: string;
  }>;
  lastUpdated?: string;
}

export interface ThemeparksLiveResponse {
  id: string;
  name: string;
  entityType: string;
  liveData?: ThemeparksLiveEntry[];
  lastUpdate?: string;
}

export interface ThemeparksScheduleEntry {
  date: string; // "YYYY-MM-DD"
  type: "OPERATING" | "INFO" | "EXTRA_HOURS" | "CLOSED" | string;
  openingTime?: string; // ISO with TZ offset
  closingTime?: string;
  description?: string;
}

export interface ThemeparksScheduleResponse {
  id: string;
  name: string;
  schedule?: ThemeparksScheduleEntry[];
}

export interface ThemeparksChild {
  id: string;
  name: string;
  entityType: string;
  location?: { latitude: number; longitude: number };
  parentId?: string;
}

export interface ThemeparksChildrenResponse {
  id: string;
  name: string;
  children?: ThemeparksChild[];
}

export interface ThemeparksEntityResponse {
  id: string;
  name: string;
  entityType: string;
  location?: { latitude: number; longitude: number };
  timezone?: string;
  destinationId?: string;
  parentId?: string;
}

/**
 * Upper bound on a single upstream round trip. Without it a hung
 * themeparks.wiki connection would hold an edge invocation (and the
 * user's request) open until the platform kills it, instead of failing
 * fast into each route's fallback path.
 */
const REQUEST_TIMEOUT_MS = 8_000;

class ThemeparksError extends Error {
  constructor(
    /** HTTP status, or 0 when the request never produced a response. */
    public readonly status: number,
    public readonly endpoint: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ThemeparksError";
  }
}

/**
 * Combines the caller's abort signal (if any) with our own timeout so
 * either can cancel the request. `AbortSignal.any` is available in every
 * runtime we target; the manual fallback keeps older Node happy.
 */
function withTimeout(signal: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  if (!signal) return timeout;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([signal, timeout]);
  }
  const ctl = new AbortController();
  const abort = () => ctl.abort();
  signal.addEventListener("abort", abort, { once: true });
  timeout.addEventListener("abort", abort, { once: true });
  return ctl.signal;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const url = `${BASE_URL}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      signal: withTimeout(signal),
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    // Caller-initiated aborts stay as-is so callers can tell them apart
    // from a genuine upstream failure.
    if (signal?.aborted) throw err;
    throw new ThemeparksError(
      0,
      path,
      `Upstream request to ${path} failed before a response`,
      { cause: err },
    );
  }

  if (!res.ok) {
    throw new ThemeparksError(res.status, path, `Upstream ${res.status} on ${path}`);
  }

  try {
    return (await res.json()) as T;
  } catch (err) {
    throw new ThemeparksError(
      res.status,
      path,
      `Upstream returned a non-JSON body on ${path}`,
      { cause: err },
    );
  }
}

/** GET /entity/{id} — basic entity metadata. */
export function getEntity(
  entityId: string,
  signal?: AbortSignal,
): Promise<ThemeparksEntityResponse> {
  return getJson<ThemeparksEntityResponse>(`/entity/${entityId}`, signal);
}

/** GET /entity/{id}/live — live wait times + ride statuses for the park. */
export function getEntityLive(
  entityId: string,
  signal?: AbortSignal,
): Promise<ThemeparksLiveResponse> {
  return getJson<ThemeparksLiveResponse>(`/entity/${entityId}/live`, signal);
}

/** GET /entity/{id}/schedule — operating hours forecast for the park. */
export function getEntitySchedule(
  entityId: string,
  signal?: AbortSignal,
): Promise<ThemeparksScheduleResponse> {
  return getJson<ThemeparksScheduleResponse>(
    `/entity/${entityId}/schedule`,
    signal,
  );
}

/** GET /entity/{id}/children — direct children of the entity (rides for a park). */
export function getEntityChildren(
  entityId: string,
  signal?: AbortSignal,
): Promise<ThemeparksChildrenResponse> {
  return getJson<ThemeparksChildrenResponse>(
    `/entity/${entityId}/children`,
    signal,
  );
}

export { ThemeparksError };

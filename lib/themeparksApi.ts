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

class ThemeparksError extends Error {
  constructor(
    public readonly status: number,
    public readonly endpoint: string,
    message: string,
  ) {
    super(message);
    this.name = "ThemeparksError";
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    cache: "no-store",
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new ThemeparksError(res.status, path, `Upstream ${res.status} on ${path}`);
  }
  return (await res.json()) as T;
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

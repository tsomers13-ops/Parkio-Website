"use client";

/**
 * Browser-side typed client for Parkio's own /api/* routes.
 *
 * The website talks to these routes; the routes talk to themeparks.wiki.
 * Client components should NEVER call themeparks.wiki directly — always
 * go through this module so caching, normalization, and graceful
 * fallback all happen on the server.
 */

import type {
  ApiPark,
  ApiParkHours,
  ApiParkLive,
} from "./types";

interface ParkioApiErrorBody {
  error: string;
  message: string;
  status: number;
}

export class ParkioApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ParkioApiErrorBody | null,
  ) {
    super(body?.message ?? `Parkio API error: ${status}`);
    this.name = "ParkioApiError";
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    let body: ParkioApiErrorBody | null = null;
    try {
      body = (await res.json()) as ParkioApiErrorBody;
    } catch {
      // ignore JSON parse failures on non-JSON error responses
    }
    throw new ParkioApiError(res.status, body);
  }
  return (await res.json()) as T;
}

export interface ParksListResponse {
  parks: ApiPark[];
  count: number;
  lastUpdated: string;
}

export function fetchParksList(signal?: AbortSignal): Promise<ParksListResponse> {
  return getJson<ParksListResponse>("/api/parks", signal);
}

export function fetchPark(
  slug: string,
  signal?: AbortSignal,
): Promise<ApiPark> {
  return getJson<ApiPark>(`/api/parks/${encodeURIComponent(slug)}`, signal);
}

export function fetchParkLive(
  slug: string,
  signal?: AbortSignal,
): Promise<ApiParkLive> {
  return getJson<ApiParkLive>(
    `/api/parks/${encodeURIComponent(slug)}/live`,
    signal,
  );
}

export function fetchParkHours(
  slug: string,
  signal?: AbortSignal,
): Promise<ApiParkHours> {
  return getJson<ApiParkHours>(
    `/api/parks/${encodeURIComponent(slug)}/hours`,
    signal,
  );
}

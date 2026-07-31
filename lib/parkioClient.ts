"use client";

/**
 * Browser-side typed client for Parkio's own /api/* routes.
 *
 * The website talks to these routes; the routes talk to themeparks.wiki.
 * Client components should NEVER call themeparks.wiki directly — always
 * go through this module so caching, normalization, and graceful
 * fallback all happen on the server.
 */

import { isAbortError } from "./errors";
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
    /** HTTP status, or 0 when the request never produced a response. */
    public readonly status: number,
    public readonly body: ParkioApiErrorBody | null,
    message?: string,
    options?: { cause?: unknown },
  ) {
    super(message ?? body?.message ?? `Parkio API error: ${status}`, options);
    this.name = "ParkioApiError";
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (err) {
    // Aborts are our own control flow (unmount, refetch) — callers check
    // for them by name, so they must not be rewritten.
    if (isAbortError(err)) throw err;
    throw new ParkioApiError(0, null, `Network error requesting ${path}`, {
      cause: err,
    });
  }

  if (!res.ok) {
    let body: ParkioApiErrorBody | null = null;
    try {
      body = (await res.json()) as ParkioApiErrorBody;
    } catch {
      // Non-JSON error response — the status alone has to carry the story.
    }
    throw new ParkioApiError(res.status, body);
  }

  try {
    return (await res.json()) as T;
  } catch (err) {
    // A 200 with an unparseable body is a real failure, not data. Without
    // this the raw SyntaxError escaped with no hint of which route broke.
    throw new ParkioApiError(
      res.status,
      null,
      `Malformed JSON in response from ${path}`,
      { cause: err },
    );
  }
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

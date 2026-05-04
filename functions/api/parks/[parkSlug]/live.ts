/**
 * GET /api/parks/[parkSlug]/live  —  Cloudflare Pages Function.
 *
 * Same public contract as the Next.js route this replaced: live wait
 * times + status for every supported attraction in the park, with a
 * 5-minute in-memory cache + Cloudflare edge cache via Cache-Control.
 *
 * Why a Pages Function and not a Next.js route handler:
 *   - Pages Functions get `env` and `waitUntil` directly on the context
 *     argument. No bridging layer (`getRequestContext`) is needed, no
 *     async-local-storage edge cases, no extra runtime dependency. The
 *     D1 binding is just `context.env.DB`.
 *   - In production this means the snapshot writer ACTUALLY runs on
 *     fresh upstream fetches — the previous Next.js route was failing
 *     to extract the request context, so writes were a silent no-op.
 *   - URL routing is identical: Pages Functions in /functions/* take
 *     precedence over Next.js routes for matching paths.
 *
 * The snapshot write pipeline:
 *   - On a cache miss, after we've successfully fetched + normalized,
 *     we call `context.waitUntil(persistLiveSnapshots(env, payload))`.
 *   - That keeps the response fast (the user gets the JSON immediately)
 *     while the D1 write completes in the background.
 *   - persistLiveSnapshots is fail-soft: missing binding, missing
 *     schema, write rejection — none of these can break the response.
 */

import { CACHE_TTL, getOrFetch } from "../../../../lib/cache";
import { getParkConfig } from "../../../../lib/disneyParkConfig";
import { persistLiveSnapshots } from "../../../../lib/historySnapshots";
import { normalizeLive } from "../../../../lib/parkioNormalizer";
import {
  getEntityLive,
  type ThemeparksLiveResponse,
} from "../../../../lib/themeparksApi";

/** Bindings configured on the Pages project. Only `DB` is required for snapshots. */
interface Env {
  DB?: unknown;
}

/**
 * Cloudflare Pages Function context shape (we type it minimally so the
 * file compiles without pulling in @cloudflare/workers-types as a hard
 * dep).
 */
interface FnContext {
  request: Request;
  env: Env;
  params: { parkSlug: string };
  waitUntil: (promise: Promise<unknown>) => void;
}

const SNAPSHOT_LOG_TAG = "[history]";

export const onRequestGet = async (context: FnContext): Promise<Response> => {
  const { params, env, waitUntil } = context;

  const cfg = getParkConfig(params.parkSlug);
  if (!cfg) {
    return jsonError(404, `Unknown park slug: ${params.parkSlug}`);
  }

  // Track whether this request actually pulled fresh upstream data —
  // the closure in `getOrFetch` only runs on cache miss.
  let isFreshFromUpstream = false;

  let live: ThemeparksLiveResponse | null = null;
  try {
    live = await getOrFetch(
      `live:${cfg.externalId}`,
      CACHE_TTL.live,
      async () => {
        isFreshFromUpstream = true;
        return await getEntityLive(cfg.externalId);
      },
    );
  } catch (err) {
    // Upstream unavailable — fall through to fallback. We surface a
    // log line so it's visible in Cloudflare's Functions tail, but the
    // user-facing response continues with the static attraction list.
    console.warn(`${SNAPSHOT_LOG_TAG} upstream fetch failed:`, err);
    live = null;
  }

  const payload = normalizeLive(cfg.slug, live);
  if (!payload) {
    return jsonError(404, `Unknown park slug: ${params.parkSlug}`);
  }

  // History collection — non-blocking, fresh fetches only. Errors
  // inside `persistLiveSnapshots` are caught and logged there; the
  // response is already heading out by the time the write runs.
  if (isFreshFromUpstream && payload.live) {
    waitUntil(
      persistLiveSnapshots(env, payload).catch((err) => {
        console.warn(`${SNAPSHOT_LOG_TAG} snapshot writer rejected:`, err);
      }),
    );
  }

  return jsonOk(payload, CACHE_TTL.live, CACHE_TTL.live * 4);
};

/* ─────────────── Response helpers (inlined — Pages Functions can't share `_lib/respond.ts` from /app) ─────────────── */

function jsonOk(
  body: unknown,
  sMaxAge: number,
  staleWhileRevalidate: number,
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
    },
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

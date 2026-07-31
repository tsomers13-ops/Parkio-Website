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

import { jsonOk, notFound } from "../../../../lib/apiResponse";
import { CACHE_TTL } from "../../../../lib/cache";
import { getParkConfig } from "../../../../lib/disneyParkConfig";
import { persistLiveSnapshots } from "../../../../lib/historySnapshots";
import { normalizeLive } from "../../../../lib/parkioNormalizer";
import { fetchLive } from "../../../../lib/upstream";

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
    return notFound(`Unknown park slug: ${params.parkSlug}`);
  }

  // Track whether this request actually pulled fresh upstream data —
  // `onFresh` only runs on a cache miss.
  let isFreshFromUpstream = false;

  // Upstream failure falls through to the static attraction list; the
  // log line surfaces in Cloudflare's Functions tail.
  const live = await fetchLive(cfg.externalId, {
    onFresh: () => {
      isFreshFromUpstream = true;
    },
    onError: (err) =>
      console.warn(`${SNAPSHOT_LOG_TAG} upstream fetch failed:`, err),
  });

  const payload = normalizeLive(cfg.slug, live);
  if (!payload) {
    return notFound(`Unknown park slug: ${params.parkSlug}`);
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

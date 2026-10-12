/**
 * Durable, date-keyed, concurrency-safe "has today's dispatch already
 * happened" guard.
 *
 * Two independent hazards motivate this:
 *   1. The scheduler fires from TWO cron entries every day (one for EDT,
 *      one for EST — see easternTime.ts), so on any given day one of them
 *      will correctly decide "it's 6:45 AM Eastern, dispatch now." If
 *      anything ever caused both to reach that conclusion (a clock skew, a
 *      retry, a redeploy near the boundary), only one dispatch must land.
 *   2. Cloudflare Cron Triggers are documented as at-least-once, not
 *      exactly-once, delivery — a single logical tick can in rare cases
 *      invoke the Worker more than once.
 *
 * Durable Objects are the Cloudflare-native fit for this: all requests to
 * one DO instance are processed one at a time (cooperatively interleaved,
 * never truly parallel), so routing every claim attempt through a single,
 * well-known instance id gives true mutual exclusion without a database or
 * a distributed lock protocol. State is kept in the DO's own durable
 * storage, so a claim survives eviction/restart within the day.
 *
 * `decideClaim` is the actual decision — pure, synchronous, and fully
 * testable without any Workers runtime. The `DispatchGuard` class is a thin
 * wrapper that loads/saves storage around it.
 */

export interface ClaimResult {
  /** True iff THIS call is the one that should proceed to dispatch. */
  claimed: boolean;
  /** True iff today's date was already claimed before this call. */
  alreadyDispatchedToday: boolean;
}

export function decideClaim(storedDateKey: string | null, todayKey: string): {
  result: ClaimResult;
  nextStoredDateKey: string;
} {
  if (storedDateKey === todayKey) {
    return {
      result: { claimed: false, alreadyDispatchedToday: true },
      nextStoredDateKey: storedDateKey,
    };
  }
  return {
    result: { claimed: true, alreadyDispatchedToday: false },
    nextStoredDateKey: todayKey,
  };
}

/**
 * Releases a claim that was taken but whose dispatch ultimately failed
 * (see githubDispatch.ts) — so a later attempt the same day (the other
 * DST-bracket cron tick, or a future manual retry) can still succeed,
 * instead of a single transient GitHub API failure silently costing the
 * whole day's automated trigger.
 */
export function decideRelease(storedDateKey: string | null, todayKey: string): string | null {
  if (storedDateKey === todayKey) return null;
  return storedDateKey;
}

const STORAGE_KEY = "lastDispatchedDateKey";

export interface DurableObjectStorageLike {
  get(key: string): Promise<string | undefined>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * The DO class itself. Kept deliberately thin — storage I/O only — so the
 * actual logic in decideClaim/decideRelease stays runtime-independent and
 * directly unit-testable.
 */
export class DispatchGuard {
  private readonly storage: DurableObjectStorageLike;

  constructor(state: { storage: DurableObjectStorageLike }) {
    this.storage = state.storage;
  }

  async claim(todayKey: string): Promise<ClaimResult> {
    const stored = (await this.storage.get(STORAGE_KEY)) ?? null;
    const { result, nextStoredDateKey } = decideClaim(stored, todayKey);
    if (result.claimed) {
      await this.storage.put(STORAGE_KEY, nextStoredDateKey);
    }
    return result;
  }

  async release(todayKey: string): Promise<void> {
    const stored = (await this.storage.get(STORAGE_KEY)) ?? null;
    const next = decideRelease(stored, todayKey);
    if (next === null) {
      await this.storage.delete(STORAGE_KEY);
    }
  }

  // Durable Object HTTP entrypoint (DOs are addressed via fetch()).
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const dateKey = url.searchParams.get("dateKey");
    if (!dateKey) {
      return new Response(JSON.stringify({ error: "missing dateKey" }), { status: 400 });
    }
    if (url.pathname === "/claim") {
      const result = await this.claim(dateKey);
      return new Response(JSON.stringify(result), { status: 200 });
    }
    if (url.pathname === "/release") {
      await this.release(dateKey);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: "unknown path" }), { status: 404 });
  }
}

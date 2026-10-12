/**
 * Durable, date-keyed, concurrency-safe "has this already happened today"
 * guard — used for two independent purposes against the same Durable
 * Object instance: "dispatch" (has today's workflow_dispatch already been
 * sent) and "alert" (has today's missed-publication email already been
 * sent). Each purpose gets its own storage key, so claiming one never
 * affects the other.
 *
 * Two hazards motivate using a Durable Object at all:
 *   1. The scheduler fires from TWO cron entries every day per purpose
 *      (one for EDT, one for EST — see easternTime.ts), so on any given
 *      day one of them will correctly decide "it's time, act now." If
 *      anything ever caused both to reach that conclusion (clock skew, a
 *      redeploy near the boundary), only one action must land.
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

export type GuardPurpose = "dispatch" | "alert";

export interface ClaimResult {
  /** True iff THIS call is the one that should proceed. */
  claimed: boolean;
  /** True iff today's date was already claimed, for this purpose, before this call. */
  alreadyClaimedToday: boolean;
}

export function decideClaim(storedDateKey: string | null, todayKey: string): {
  result: ClaimResult;
  nextStoredDateKey: string;
} {
  if (storedDateKey === todayKey) {
    return {
      result: { claimed: false, alreadyClaimedToday: true },
      nextStoredDateKey: storedDateKey,
    };
  }
  return {
    result: { claimed: true, alreadyClaimedToday: false },
    nextStoredDateKey: todayKey,
  };
}

/**
 * Releases a claim that was taken but whose action ultimately failed in a
 * CONFIRMED (non-ambiguous) way — see githubDispatch.ts's DispatchOutcome
 * — so a later attempt the same day can still succeed, instead of a
 * single definite failure silently costing the whole day's automated
 * action. An AMBIGUOUS outcome must never call this: see
 * handleDispatchTick in index.ts.
 */
export function decideRelease(storedDateKey: string | null, todayKey: string): string | null {
  if (storedDateKey === todayKey) return null;
  return storedDateKey;
}

function storageKeyFor(purpose: GuardPurpose): string {
  return `lastClaimedDateKey:${purpose}`;
}

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

  async claim(purpose: GuardPurpose, todayKey: string): Promise<ClaimResult> {
    const key = storageKeyFor(purpose);
    const stored = (await this.storage.get(key)) ?? null;
    const { result, nextStoredDateKey } = decideClaim(stored, todayKey);
    if (result.claimed) {
      await this.storage.put(key, nextStoredDateKey);
    }
    return result;
  }

  async release(purpose: GuardPurpose, todayKey: string): Promise<void> {
    const key = storageKeyFor(purpose);
    const stored = (await this.storage.get(key)) ?? null;
    const next = decideRelease(stored, todayKey);
    if (next === null) {
      await this.storage.delete(key);
    }
  }

  // Durable Object HTTP entrypoint (DOs are addressed via fetch()).
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const dateKey = url.searchParams.get("dateKey");
    const purposeParam = url.searchParams.get("purpose");
    if (!dateKey || (purposeParam !== "dispatch" && purposeParam !== "alert")) {
      return new Response(JSON.stringify({ error: "missing or invalid dateKey/purpose" }), { status: 400 });
    }
    const purpose = purposeParam;
    if (url.pathname === "/claim") {
      const result = await this.claim(purpose, dateKey);
      return new Response(JSON.stringify(result), { status: 200 });
    }
    if (url.pathname === "/release") {
      await this.release(purpose, dateKey);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: "unknown path" }), { status: 404 });
  }
}

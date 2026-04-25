"use client";

import { useAllLive } from "@/lib/useAllLive";

export function ParksTodayOverview() {
  const {
    status,
    averageWait,
    busiestPark,
    quietestPark,
    openParkCount,
    parks,
    lastUpdated,
  } = useAllLive();

  const total = parks.length || 6;

  return (
    <div className="mt-10">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-medium uppercase tracking-widest text-accent-600">
          Today's overview
        </span>
        <span aria-hidden className="text-ink-300">
          ·
        </span>
        <LiveDot status={status} lastUpdated={lastUpdated} total={total} openCount={openParkCount} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          label="Parks open"
          value={status === "loading" ? "—" : `${openParkCount} / ${total}`}
        />
        <Tile
          label="Avg wait"
          value={averageWait !== null ? `${averageWait} min` : "—"}
        />
        <Tile
          label="Busiest park"
          value={busiestPark ? busiestPark.name : "—"}
          sub={busiestPark ? `${busiestPark.avg} min avg` : undefined}
        />
        <Tile
          label="Quietest park"
          value={quietestPark ? quietestPark.name : "—"}
          sub={quietestPark ? `${quietestPark.avg} min avg` : undefined}
        />
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white px-4 py-3 shadow-soft">
      <div className="text-[10px] font-medium uppercase tracking-widest text-ink-500">
        {label}
      </div>
      <div className="mt-1 truncate text-base font-semibold tracking-tight text-ink-900">
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 truncate text-[11px] font-medium text-ink-500">
          {sub}
        </div>
      )}
    </div>
  );
}

function LiveDot({
  status,
  lastUpdated,
  total,
  openCount,
}: {
  status: "loading" | "live" | "estimates";
  lastUpdated: string | null;
  total: number;
  openCount: number;
}) {
  if (status === "loading") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ink-500">
        <span className="h-1.5 w-1.5 rounded-full bg-ink-300" />
        Checking…
      </span>
    );
  }
  if (status === "estimates") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ink-500">
        <span className="h-1.5 w-1.5 rounded-full bg-ink-400" />
        Estimates only
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-600">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      Live · {openCount} of {total} parks open
      {lastUpdated && ` · updated ${formatAge(lastUpdated)}`}
    </span>
  );
}

function formatAge(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "just now";
  const ageS = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (ageS < 30) return "just now";
  if (ageS < 90) return "1m ago";
  if (ageS < 60 * 60) return `${Math.round(ageS / 60)}m ago`;
  if (ageS < 60 * 60 * 24) return `${Math.round(ageS / 3600)}h ago`;
  return new Date(ts).toLocaleString();
}

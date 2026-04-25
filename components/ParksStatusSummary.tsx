"use client";

import { useEffect, useState } from "react";
import { fetchParksList } from "@/lib/parkioClient";

type Status = "loading" | "live" | "estimates";

export function ParksStatusSummary() {
  const [status, setStatus] = useState<Status>("loading");
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    fetchParksList(ctl.signal)
      .then((res) => {
        setOpenCount(res.parks.filter((p) => p.status === "OPEN").length);
        setTotal(res.parks.length);
        setLastUpdated(res.lastUpdated);
        setStatus("live");
      })
      .catch(() => setStatus("estimates"));
    return () => ctl.abort();
  }, []);

  return (
    <div className="mt-6 inline-flex flex-wrap items-center gap-3 rounded-full border border-ink-100 bg-white/70 px-3 py-1.5 text-[12px] font-medium text-ink-600 shadow-soft backdrop-blur">
      <span className="inline-flex items-center gap-1.5">
        {status === "loading" ? (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-ink-300" />
            Checking park status…
          </>
        ) : status === "estimates" ? (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-ink-400" />
            Live data unavailable — showing estimates
          </>
        ) : (
          <>
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            {openCount} of {total} parks open today
          </>
        )}
      </span>
      {lastUpdated && (
        <>
          <span aria-hidden className="text-ink-300">
            ·
          </span>
          <span className="text-ink-500">
            Updated {formatAge(lastUpdated)}
          </span>
        </>
      )}
    </div>
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

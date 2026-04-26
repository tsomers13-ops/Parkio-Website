"use client";

import { useEffect, useState } from "react";
import { fetchParksList } from "@/lib/parkioClient";
import type { ApiPark } from "@/lib/types";
import type { Park } from "@/lib/types";
import { ParkCard } from "./ParkCard";

interface ParkCardLiveProps {
  park: Park;
  /** When provided, used as the initial render state (SSR-friendly). */
  initialApi?: ApiPark | null;
}

/**
 * Wraps <ParkCard> and refreshes the OPEN/CLOSED status + today's hours
 * from /api/parks on mount, so the listing always reflects current state
 * without requiring a full server re-render.
 */
export function ParkCardLive({ park, initialApi = null }: ParkCardLiveProps) {
  const [api, setApi] = useState<ApiPark | null>(initialApi);

  useEffect(() => {
    const ctl = new AbortController();
    fetchParksList(ctl.signal)
      .then((res) => {
        const found = res.parks.find((p) => p.slug === park.id);
        if (found) setApi(found);
      })
      .catch(() => {
        // Silent fallback — keep showing the static `park` props.
      });
    return () => ctl.abort();
  }, [park.id]);

  // Override the static park's status/hours when we have fresh API data.
  // Importantly: if the API returns UNKNOWN (couldn't determine status),
  // fall back to the static park.status rather than incorrectly labeling
  // a park "Closed" when we just don't know — that would be a real
  // trust-breaker for a guest checking the site.
  const hydratedPark: Park =
    api === null
      ? park
      : {
          ...park,
          status:
            api.status === "OPEN"
              ? "Open"
              : api.status === "CLOSED"
                ? "Closed"
                : park.status,
          hours: api.todayHours
            ? formatHoursWindow(
                api.todayHours.open,
                api.todayHours.close,
                api.timezone,
              )
            : park.hours,
        };

  return <ParkCard park={hydratedPark} />;
}

/**
 * Formats an open/close ISO pair like "9AM — 11PM" using the park's
 * local timezone (NOT the user's browser timezone), so a guest in
 * California sees Magic Kingdom's hours in Eastern time.
 */
function formatHoursWindow(
  openIso: string,
  closeIso: string,
  timezone: string,
): string {
  try {
    const open = new Date(openIso);
    const close = new Date(closeIso);
    const fmt = (d: Date) =>
      d
        .toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
          timeZone: timezone,
        })
        .replace(":00", "")
        .replace(" ", "");
    return `${fmt(open)} — ${fmt(close)}`.toUpperCase();
  } catch {
    return "Today";
  }
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

interface MapFocusValue {
  /** The ride slug currently being focused, or null. */
  focusedRideSlug: string | null;
  /**
   * Increments on every focusRide() call so consumers can re-trigger
   * animations even when the same ride is requested twice in a row
   * (otherwise React would skip the effect because the slug is
   * unchanged).
   */
  focusToken: number;
  /** Request the map to focus on a ride. Pass null to clear. */
  focusRide: (slug: string | null) => void;
}

const Ctx = createContext<MapFocusValue | null>(null);

/**
 * Lightweight React context that lets the "Right now" hero ask the
 * <ParkMap> below to pan/zoom/highlight a specific ride. Scoped per
 * park-page render — naturally resets to null when the user navigates
 * to a different park (the provider unmounts and re-mounts).
 *
 * No data is fetched here. No API or scoring logic. Just UI focus
 * coordination between sibling components on the same page.
 */
export function MapFocusProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ slug: string | null; token: number }>({
    slug: null,
    token: 0,
  });

  const focusRide = useCallback((slug: string | null) => {
    setState((s) => ({ slug, token: s.token + 1 }));
  }, []);

  return (
    <Ctx.Provider
      value={{
        focusedRideSlug: state.slug,
        focusToken: state.token,
        focusRide,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useMapFocus(): MapFocusValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error("useMapFocus must be used inside <MapFocusProvider>");
  }
  return v;
}

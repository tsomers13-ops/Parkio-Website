"use client";

import { useEffect, useMemo, useState } from "react";
import { DiningVenueCard } from "@/components/dining/DiningVenueCard";
import { FestivalBoothCard, type BoothView } from "@/components/dining/FestivalBoothCard";
import { DINING_TYPES, diningTypeLabel, type DiningType, type PermanentDiningVenue } from "@/lib/diningTypes";
import { fetchBulkRatings, type BulkRatingEntry } from "@/lib/ratingsClient";

/**
 * The Dining decision surface.
 *
 * All lifecycle work is already done server-side — this component receives
 * resolved booth views and never computes a date. It only filters and
 * searches what it was given.
 *
 * Community ratings are the one thing loaded at runtime. The page itself is
 * statically generated, so ratings fetched at build time would be frozen at
 * build time — they have to arrive in the browser. They arrive in exactly one
 * request for the whole park, held here and handed down, so no card fetches
 * anything and filtering never touches the network.
 */

type Mode = "all" | "permanent" | "festival";
type TypeFilter = "all" | DiningType;
type MenuFilter = "all" | "food" | "nonAlcoholicBeverage" | "alcoholicBeverage" | "plantBased";

export interface FestivalSummary {
  name: string;
  startsOn: string;
  endsOn: string;
  status: "upcoming" | "active" | "expired";
}

interface Props {
  parkName: string;
  venueGroups: { name: string; venues: PermanentDiningVenue[] }[];
  boothViews: BoothView[];
  festival: FestivalSummary | null;
}

const MENU_FILTERS: { value: MenuFilter; label: string }[] = [
  { value: "all", label: "All items" },
  { value: "food", label: "Food" },
  { value: "nonAlcoholicBeverage", label: "Non-alcoholic" },
  { value: "plantBased", label: "Plant-based" },
  { value: "alcoholicBeverage", label: "Alcoholic" },
];

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-[40px] rounded-full border px-3.5 py-1.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 ${
        active
          ? "border-accent-600 bg-accent-600 text-white"
          : "border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50"
      }`}
    >
      {children}
    </button>
  );
}

const norm = (s: string) => s.toLowerCase();

export function ParkDiningExplorer({ parkName, venueGroups, boothViews, festival }: Props) {
  const hasFestival = festival !== null && boothViews.length > 0;
  const [mode, setMode] = useState<Mode>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [menuFilter, setMenuFilter] = useState<MenuFilter>("all");
  const [query, setQuery] = useState("");
  const [ratings, setRatings] = useState<Record<string, BulkRatingEntry>>({});

  /**
   * Every permanent venue in the park, in a stable order — deliberately NOT
   * the filtered set. Two reasons: the request must not change when someone
   * types in the search box, and a stable key list means every visitor to
   * this park requests the same URL, so the edge cache is actually useful.
   */
  const venueKeysParam = useMemo(
    () => venueGroups.flatMap((group) => group.venues.map((venue) => venue.venueKey)).join(","),
    [venueGroups],
  );

  /**
   * One request per park, keyed on the venue list rather than on filters, so
   * changing service type or search never refetches.
   *
   * On failure `ratings` stays empty and every card simply omits its rating
   * line. Dining discovery does not depend on this succeeding.
   */
  useEffect(() => {
    if (venueKeysParam === "") return;
    let cancelled = false;
    void fetchBulkRatings(venueKeysParam.split(",")).then((load) => {
      if (cancelled || load.status !== "ok") return;
      setRatings(load.ratings);
    });
    return () => {
      cancelled = true;
    };
  }, [venueKeysParam]);

  const q = norm(query.trim());

  const filteredGroups = useMemo(() => {
    return venueGroups
      .map((group) => ({
        name: group.name,
        venues: group.venues.filter((venue) => {
          if (typeFilter !== "all" && venue.type !== typeFilter) return false;
          if (!q) return true;
          return (
            norm(venue.name).includes(q) ||
            norm(venue.land).includes(q) ||
            norm(diningTypeLabel(venue.type)).includes(q)
          );
        }),
      }))
      .filter((group) => group.venues.length > 0);
  }, [venueGroups, typeFilter, q]);

  const filteredBooths = useMemo(() => {
    return boothViews.filter((view) => {
      const items = view.booth.menu;
      const matchesMenu =
        menuFilter === "all"
          ? true
          : menuFilter === "plantBased"
            ? items.some((i) => i.plantBased)
            : items.some((i) => i.itemKind === menuFilter);
      if (!matchesMenu) return false;
      if (!q) return true;
      return (
        norm(view.booth.name).includes(q) ||
        norm(view.booth.locationText).includes(q) ||
        items.some((i) => norm(i.name).includes(q))
      );
    });
  }, [boothViews, menuFilter, q]);

  const permanentCount = filteredGroups.reduce((n, g) => n + g.venues.length, 0);
  const showPermanent = mode === "all" || mode === "permanent";
  const showFestival = hasFestival && (mode === "all" || mode === "festival");

  return (
    <div>
      {/* ── Controls ─────────────────────────────────────────────── */}
      <div className="mt-8 space-y-4">
        {hasFestival && (
          <div role="group" aria-label="Dining type" className="flex flex-wrap gap-2">
            <FilterButton active={mode === "all"} onClick={() => setMode("all")}>
              All dining
            </FilterButton>
            <FilterButton active={mode === "permanent"} onClick={() => setMode("permanent")}>
              Year-round
            </FilterButton>
            <FilterButton active={mode === "festival"} onClick={() => setMode("festival")}>
              Festival food
            </FilterButton>
          </div>
        )}

        <div>
          <label htmlFor="dining-search" className="sr-only">
            Search {parkName} dining by name, area or menu item
          </label>
          <input
            id="dining-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search dining, areas or menu items — try “dumplings”"
            className="w-full rounded-2xl border border-ink-200 bg-white px-4 py-2.5 text-base text-ink-900 shadow-soft placeholder:text-ink-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
          />
        </div>

        {showPermanent && (
          <div role="group" aria-label="Filter year-round dining by service type" className="flex flex-wrap gap-2">
            <FilterButton active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>
              All types
            </FilterButton>
            {DINING_TYPES.map((type) => (
              <FilterButton
                key={type}
                active={typeFilter === type}
                onClick={() => setTypeFilter(type)}
              >
                {diningTypeLabel(type)}
              </FilterButton>
            ))}
          </div>
        )}

        {showFestival && (
          <div role="group" aria-label="Filter festival food by menu category" className="flex flex-wrap gap-2">
            {MENU_FILTERS.map((filter) => (
              <FilterButton
                key={filter.value}
                active={menuFilter === filter.value}
                onClick={() => setMenuFilter(filter.value)}
              >
                {filter.label}
              </FilterButton>
            ))}
          </div>
        )}
      </div>

      {/* ── Year-round dining ────────────────────────────────────── */}
      {showPermanent && (
        <section aria-labelledby="year-round-heading" className="mt-12">
          <h2 id="year-round-heading" className="text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">
            Year-round dining
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            {permanentCount} {permanentCount === 1 ? "location" : "locations"}, grouped by area.
          </p>

          {filteredGroups.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-ink-100 bg-white px-4 py-6 text-sm text-ink-600 shadow-soft">
              No year-round dining matches those filters.
            </p>
          ) : (
            <div className="mt-8 space-y-10">
              {filteredGroups.map((group) => (
                <div key={group.name}>
                  <h3 className="text-sm font-semibold uppercase tracking-widest text-accent-600">
                    {group.name}
                  </h3>
                  <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {group.venues.map((venue) => (
                      <li key={venue.slug}>
                        <DiningVenueCard venue={venue} rating={ratings[venue.venueKey]} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Festival food ────────────────────────────────────────── */}
      {showFestival && festival && (
        <section aria-labelledby="festival-heading" className="mt-14">
          <h2 id="festival-heading" className="text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">
            {festival.name}
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            {filteredBooths.length} participating{" "}
            {filteredBooths.length === 1 ? "location" : "locations"} · festival runs{" "}
            {festival.startsOn} to {festival.endsOn}. Open a location to see its menu and
            Disney&rsquo;s published prices.
          </p>

          {filteredBooths.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-ink-100 bg-white px-4 py-6 text-sm text-ink-600 shadow-soft">
              No festival locations match those filters.
            </p>
          ) : (
            <ul className="mt-8 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {filteredBooths.map((view) => (
                <FestivalBoothCard key={view.booth.id} view={view} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

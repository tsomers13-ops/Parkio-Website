// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Community ratings on Dining discovery cards.
 *
 * Two things are under test and the second matters as much as the first: what
 * a card shows, and how many network requests a discovery page makes. A
 * correct-looking card that costs 42 round trips is a failure.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

const { DiningVenueCard } = await import("@/components/dining/DiningVenueCard");
const { GuestRatingBadge } = await import("@/components/dining/GuestRatingBadge");
const { ParkDiningExplorer } = await import("@/components/dining/ParkDiningExplorer");
const { getPermanentDiningForPark, groupPermanentDiningByArea } = await import("@/lib/dining");
const { getSeasonalDiningForPark, getFestival } = await import("@/lib/seasonalDining");

const epcotVenues = getPermanentDiningForPark("epcot");
const dhsVenues = getPermanentDiningForPark("hollywood-studios");
const epcotGroups = groupPermanentDiningByArea(epcotVenues);
const dhsGroups = groupPermanentDiningByArea(dhsVenues);

const editorialVenue = epcotVenues.find((v) => v.editorial)!;
const factualVenue = epcotVenues.find((v) => !v.editorial)!;

interface FetchLog {
  calls: string[];
  inits: (RequestInit | undefined)[];
}

function stubBulkFetch(
  ratings: Record<string, { ratingCount: number; overallAverage: number | null }> | null,
): FetchLog {
  const log: FetchLog = { calls: [], inits: [] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      log.calls.push(url);
      log.inits.push(init);
      if (ratings === null) return { ok: false, status: 503, json: async () => ({}) } as Response;
      return { ok: true, status: 200, json: async () => ({ ratings }) } as Response;
    }),
  );
  return log;
}

const explorer = (groups: typeof epcotGroups) =>
  createElement(ParkDiningExplorer, {
    parkName: "EPCOT",
    venueGroups: groups,
    boothViews: [],
    festival: null,
  });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ── Card display ────────────────────────────────────────────────────────────

describe("GuestRatingBadge", () => {
  it("shows the average to one decimal and the count", () => {
    render(createElement(GuestRatingBadge, { rating: { ratingCount: 328, overallAverage: 4.638 } }));
    expect(screen.getByText("4.6")).toBeTruthy();
    expect(screen.getByText("328 ratings")).toBeTruthy();
  });

  it("does not display excessive precision", () => {
    render(createElement(GuestRatingBadge, { rating: { ratingCount: 47, overallAverage: 4.638297872 } }));
    expect(document.body.textContent).toContain("4.6");
    expect(document.body.textContent).not.toContain("4.638");
  });

  it("keeps a whole average as one decimal", () => {
    render(createElement(GuestRatingBadge, { rating: { ratingCount: 1, overallAverage: 5 } }));
    expect(screen.getByText("5.0")).toBeTruthy();
  });

  it("says '1 rating', not '1 ratings'", () => {
    render(createElement(GuestRatingBadge, { rating: { ratingCount: 1, overallAverage: 5 } }));
    expect(screen.getByText("1 rating")).toBeTruthy();
  });

  it("says '2 ratings'", () => {
    render(createElement(GuestRatingBadge, { rating: { ratingCount: 2, overallAverage: 4.5 } }));
    expect(screen.getByText("2 ratings")).toBeTruthy();
  });

  it("renders nothing for a venue with zero ratings", () => {
    const { container } = render(
      createElement(GuestRatingBadge, { rating: { ratingCount: 0, overallAverage: null } }),
    );
    expect(container.textContent).toBe("");
  });

  it("never renders a fabricated 0.0", () => {
    const { container } = render(
      createElement(GuestRatingBadge, { rating: { ratingCount: 0, overallAverage: null } }),
    );
    expect(container.textContent).not.toContain("0.0");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders nothing when ratings are unavailable", () => {
    const { container } = render(createElement(GuestRatingBadge, { rating: undefined }));
    expect(container.textContent).toBe("");
  });

  it("says nothing at all rather than 'No ratings'", () => {
    const { container } = render(createElement(GuestRatingBadge, { rating: null }));
    expect(container.textContent).not.toMatch(/no ratings|not rated|unavailable/i);
  });

  it("ignores a count with no average", () => {
    const { container } = render(
      createElement(GuestRatingBadge, { rating: { ratingCount: 5, overallAverage: null } }),
    );
    expect(container.textContent).toBe("");
  });

  it("gives screen readers the scale and the sample size", () => {
    render(createElement(GuestRatingBadge, { rating: { ratingCount: 328, overallAverage: 4.6 } }));
    expect(screen.getByText("Guest rating 4.6 out of 5 from 328 ratings")).toBeTruthy();
  });

  it("keeps the star decorative and untabbable", () => {
    const { container } = render(
      createElement(GuestRatingBadge, { rating: { ratingCount: 9, overallAverage: 4.2 } }),
    );
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("focusable")).toBe("false");
    expect(container.querySelector("[tabindex]")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
  });

  it("emits only phrasing content, so it is valid inside the card's anchor", () => {
    const { container } = render(
      createElement(GuestRatingBadge, { rating: { ratingCount: 9, overallAverage: 4.2 } }),
    );
    for (const tag of ["DIV", "P", "UL", "LI", "SECTION"]) {
      expect(container.querySelector(tag.toLowerCase())).toBeNull();
    }
  });
});

// ── Card integration ────────────────────────────────────────────────────────

describe("DiningVenueCard", () => {
  it("shows a rating on an editorial venue alongside Parkio pick", () => {
    render(
      createElement(DiningVenueCard, {
        venue: editorialVenue,
        rating: { ratingCount: 128, overallAverage: 4.4 },
      }),
    );
    expect(screen.getByText("4.4")).toBeTruthy();
    expect(screen.getByText("128 ratings")).toBeTruthy();
    expect(screen.getByText("Parkio pick")).toBeTruthy();
  });

  it("shows a rating on a factual-only venue with no editorial at all", () => {
    render(
      createElement(DiningVenueCard, {
        venue: factualVenue,
        rating: { ratingCount: 12, overallAverage: 3.9 },
      }),
    );
    expect(screen.getByText("3.9")).toBeTruthy();
    expect(screen.queryByText("Parkio pick")).toBeNull();
  });

  it("never puts a Parkio score on the card next to the guest average", () => {
    render(
      createElement(DiningVenueCard, {
        venue: editorialVenue,
        rating: { ratingCount: 128, overallAverage: 4.4 },
      }),
    );
    // Parkio's 1-10 score stays on the detail page; the card carries only the
    // qualitative "Parkio pick" marker, so no /10 can sit beside the ★ 4.4.
    expect(document.body.textContent).not.toContain("/10");
    expect(document.body.textContent).not.toMatch(/Parkio score/i);
  });

  it("renders a complete card when the venue has no rating", () => {
    render(createElement(DiningVenueCard, { venue: factualVenue }));
    expect(screen.getByText(factualVenue.name)).toBeTruthy();
    expect(document.body.textContent).not.toContain("0.0");
  });

  it("still links to the venue detail page", () => {
    const { container } = render(
      createElement(DiningVenueCard, {
        venue: factualVenue,
        rating: { ratingCount: 3, overallAverage: 4 },
      }),
    );
    const links = container.querySelectorAll("a");
    expect(links.length).toBe(1);
    expect(links[0].getAttribute("href")).toContain(`/dining/${factualVenue.slug}/`);
  });
});

// ── Network behaviour ───────────────────────────────────────────────────────

describe("discovery ratings network behaviour", () => {
  it("loads all 42 EPCOT venues in ONE request, not 42", async () => {
    const log = stubBulkFetch({});
    render(explorer(epcotGroups));
    await waitFor(() => expect(log.calls.length).toBe(1));
    expect(epcotVenues.length).toBe(42);
    expect(log.calls.length).toBe(1);
  });

  it("loads all 20 Hollywood Studios venues in ONE request, not 20", async () => {
    const log = stubBulkFetch({});
    render(
      createElement(ParkDiningExplorer, {
        parkName: "Hollywood Studios",
        venueGroups: dhsGroups,
        boothViews: [],
        festival: null,
      }),
    );
    await waitFor(() => expect(log.calls.length).toBe(1));
    expect(dhsVenues.length).toBe(20);
    expect(log.calls.length).toBe(1);
  });

  it("asks for every park venue, not just the visible ones", async () => {
    const log = stubBulkFetch({});
    render(explorer(epcotGroups));
    await waitFor(() => expect(log.calls.length).toBe(1));
    const keys = new URL(log.calls[0], "https://parkio.info").searchParams.get("venueKeys")!;
    expect(keys.split(",").length).toBe(42);
  });

  it("uses a trailing slash before the query string", async () => {
    const log = stubBulkFetch({});
    render(explorer(epcotGroups));
    await waitFor(() => expect(log.calls.length).toBe(1));
    expect(log.calls[0].startsWith("/api/dining/ratings/?")).toBe(true);
  });

  it("never calls /me from discovery", async () => {
    const log = stubBulkFetch({});
    render(explorer(epcotGroups));
    await waitFor(() => expect(log.calls.length).toBe(1));
    expect(log.calls.some((url) => url.includes("/me/"))).toBe(false);
  });

  it("only ever issues GETs from discovery", async () => {
    const log = stubBulkFetch({});
    render(explorer(epcotGroups));
    await waitFor(() => expect(log.calls.length).toBe(1));
    expect(log.inits.every((init) => (init?.method ?? "GET") === "GET")).toBe(true);
  });

  it("does not refetch when the search query changes", async () => {
    const log = stubBulkFetch({});
    render(explorer(epcotGroups));
    await waitFor(() => expect(log.calls.length).toBe(1));

    const search = screen.getByLabelText(/search/i);
    fireEvent.change(search, { target: { value: "steak" } });
    fireEvent.change(search, { target: { value: "sushi" } });
    fireEvent.change(search, { target: { value: "" } });

    await waitFor(() => expect(log.calls.length).toBe(1));
  });

  it("does not refetch when the service-type filter changes", async () => {
    const log = stubBulkFetch({});
    render(explorer(epcotGroups));
    await waitFor(() => expect(log.calls.length).toBe(1));

    fireEvent.click(screen.getByRole("button", { name: "Table Service" }));
    fireEvent.click(screen.getByRole("button", { name: "Quick Service" }));
    fireEvent.click(screen.getByRole("button", { name: "All types" }));

    await waitFor(() => expect(log.calls.length).toBe(1));
  });
});

// ── Discovery rendering ─────────────────────────────────────────────────────

describe("discovery card rendering", () => {
  it("shows the rating on a rated card and nothing on an unrated one", async () => {
    const rated = epcotVenues[0];
    const unrated = epcotVenues[1];
    const ratings: Record<string, { ratingCount: number; overallAverage: number | null }> = {};
    for (const venue of epcotVenues) ratings[venue.venueKey] = { ratingCount: 0, overallAverage: null };
    ratings[rated.venueKey] = { ratingCount: 87, overallAverage: 4.3 };

    stubBulkFetch(ratings);
    render(explorer(epcotGroups));

    await waitFor(() => expect(screen.getByText("87 ratings")).toBeTruthy());
    expect(screen.getByText("4.3")).toBeTruthy();
    // Exactly one card gained a rating line. Counted via the accessible
    // sentence, which appears once per rendered badge.
    expect(screen.getAllByText(/^Guest rating \d/).length).toBe(1);
    expect(screen.getByText(unrated.name)).toBeTruthy();
  });

  it("renders no rating anywhere when every venue has zero", async () => {
    const ratings: Record<string, { ratingCount: number; overallAverage: number | null }> = {};
    for (const venue of epcotVenues) ratings[venue.venueKey] = { ratingCount: 0, overallAverage: null };

    stubBulkFetch(ratings);
    render(explorer(epcotGroups));

    await waitFor(() => expect(screen.getByText(epcotVenues[0].name)).toBeTruthy());
    expect(screen.queryAllByText(/ratings?$/).length).toBe(0);
    expect(document.body.textContent).not.toContain("0.0");
  });

  it("stays fully usable when the ratings service is down", async () => {
    stubBulkFetch(null);
    render(explorer(epcotGroups));

    await waitFor(() => expect(screen.getByText(epcotVenues[0].name)).toBeTruthy());
    // Every card still renders, and none claims there are no ratings.
    for (const venue of epcotVenues.slice(0, 5)) {
      expect(screen.getByText(venue.name)).toBeTruthy();
    }
    expect(screen.queryAllByText(/ratings?$/).length).toBe(0);
    expect(document.body.textContent).not.toMatch(/0\.0|no guest ratings|unavailable/i);
  });

  it("survives a malformed ratings response without showing a false zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ nonsense: true }) }) as Response),
    );
    render(explorer(epcotGroups));
    await waitFor(() => expect(screen.getByText(epcotVenues[0].name)).toBeTruthy());
    expect(screen.queryAllByText(/ratings?$/).length).toBe(0);
  });

  it("ignores a rating returned for a venue that is not on the page", async () => {
    stubBulkFetch({ "hs-backlot-express": { ratingCount: 99, overallAverage: 5 } });
    render(explorer(epcotGroups));
    await waitFor(() => expect(screen.getByText(epcotVenues[0].name)).toBeTruthy());
    expect(screen.queryByText("99 ratings")).toBeNull();
  });
});

// ── Festival exclusion ──────────────────────────────────────────────────────

describe("festival booths are excluded", () => {
  const booths = getSeasonalDiningForPark("epcot");
  const festivalRecord = booths[0] ? getFestival(booths[0].festivalId) : undefined;

  it("has festival fixtures to test against", () => {
    expect(booths.length).toBeGreaterThan(0);
    expect(festivalRecord).toBeTruthy();
  });

  it("requests no ratings for festival ids", async () => {
    const log = stubBulkFetch({});
    render(
      createElement(ParkDiningExplorer, {
        parkName: "EPCOT",
        venueGroups: epcotGroups,
        boothViews: booths.slice(0, 5).map((booth) => ({
          booth,
          status: "active" as const,
          opensOn: null,
          host: null,
        })),
        festival: {
          name: festivalRecord!.name,
          startsOn: festivalRecord!.startsOn,
          endsOn: festivalRecord!.endsOn,
          status: "active" as const,
        },
      }),
    );
    await waitFor(() => expect(log.calls.length).toBe(1));
    const keys = new URL(log.calls[0], "https://parkio.info").searchParams.get("venueKeys")!;
    const requested = keys.split(",");
    for (const booth of booths.slice(0, 5)) {
      expect(requested).not.toContain(booth.id);
    }
    expect(requested.length).toBe(42);
  });

  it("shows no rating affordance on a festival card", async () => {
    stubBulkFetch({});
    const { container } = render(
      createElement(ParkDiningExplorer, {
        parkName: "EPCOT",
        venueGroups: [],
        boothViews: booths.slice(0, 3).map((booth) => ({
          booth,
          status: "active" as const,
          opensOn: null,
          host: null,
        })),
        festival: {
          name: festivalRecord!.name,
          startsOn: festivalRecord!.startsOn,
          endsOn: festivalRecord!.endsOn,
          status: "active" as const,
        },
      }),
    );
    await waitFor(() => expect(screen.getByText(booths[0].name)).toBeTruthy());
    expect(container.textContent).not.toMatch(/Rate this booth|Guest rating|Rate this restaurant/i);
    expect(container.querySelectorAll("svg.text-amber-500").length).toBe(0);
  });
});

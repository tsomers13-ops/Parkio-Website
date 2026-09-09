// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GuestRatingSection } from "@/components/dining/GuestRatingSection";
import { emptyDiningRatingAggregate, type DiningRatingAggregate } from "@/lib/ratingsTypes";

/**
 * Behaviour of the guest-facing rating block. Fetch is stubbed per test so the
 * three public states — zero, rated, unavailable — can each be asserted.
 */

const VENUE = "ep-le-cellier";
const NAME = "Le Cellier Steakhouse";

const rated = (over: Partial<DiningRatingAggregate> = {}): DiningRatingAggregate => ({
  ...emptyDiningRatingAggregate(VENUE),
  ratingCount: 127,
  overallAverage: 4.42,
  tasteAverage: 4.6,
  tasteCount: 90,
  valueAverage: 4.1,
  valueCount: 70,
  qualityAverage: 4.5,
  qualityCount: 60,
  ...over,
});

interface Stub {
  aggregate?: unknown;
  aggregateOk?: boolean;
  me?: unknown;
  post?: unknown;
  postOk?: boolean;
}

function stubFetch({ aggregate, aggregateOk = true, me = { rating: null }, post, postOk = true }: Stub) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (init?.method === "POST") {
        return { ok: postOk, status: postOk ? 200 : 503, json: async () => post } as Response;
      }
      if (url.endsWith("/me/")) return { ok: true, status: 200, json: async () => me } as Response;
      return { ok: aggregateOk, status: aggregateOk ? 200 : 503, json: async () => aggregate } as Response;
    }),
  );
  return calls;
}

const renderSection = () =>
  render(createElement(GuestRatingSection, { venueKey: VENUE, venueName: NAME }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  document.cookie = "";
});

describe("state A — no ratings", () => {
  it("says nobody has rated yet, and never shows a 0.0 score", async () => {
    stubFetch({ aggregate: emptyDiningRatingAggregate(VENUE) });
    renderSection();
    await screen.findByText("No guest ratings yet");
    expect(screen.getByText(`Be the first to rate ${NAME}.`)).toBeTruthy();
    expect(document.body.textContent).not.toContain("0.0");
    expect(screen.getByRole("button", { name: "Rate this restaurant" })).toBeTruthy();
  });
});

describe("state B — ratings exist", () => {
  it("shows the average, the count and only the answered dimensions", async () => {
    stubFetch({ aggregate: rated() });
    renderSection();
    await screen.findByText("4.4");
    expect(screen.getByText("127 ratings from Parkio guests")).toBeTruthy();
    expect(screen.getByText("Taste")).toBeTruthy();
    expect(screen.getByText("Value")).toBeTruthy();
    expect(screen.getByText("Quality")).toBeTruthy();
  });

  it("uses singular copy for a single rating", async () => {
    stubFetch({ aggregate: rated({ ratingCount: 1, overallAverage: 5, tasteCount: 0, valueCount: 0, qualityCount: 0 }) });
    renderSection();
    await screen.findByText("1 rating from Parkio guests");
    expect(document.body.textContent).not.toContain("1 ratings");
  });

  it("omits a dimension nobody rated rather than showing 0.0", async () => {
    stubFetch({ aggregate: rated({ valueCount: 0, valueAverage: null }) });
    renderSection();
    await screen.findByText("Taste");
    expect(screen.queryByText("Value")).toBeNull();
    expect(document.body.textContent).not.toContain("0.0");
  });

  it("carries each dimension's own count, since participation differs", async () => {
    stubFetch({ aggregate: rated() });
    renderSection();
    await screen.findByText("4.4");
    expect(screen.getByText("(90 ratings)")).toBeTruthy();
    expect(screen.getByText("(70 ratings)")).toBeTruthy();
    expect(screen.getByText("(60 ratings)")).toBeTruthy();
  });
});

describe("state C — unavailable", () => {
  it("hides the block entirely rather than claiming zero ratings", async () => {
    stubFetch({ aggregate: {}, aggregateOk: false });
    const { container } = renderSection();
    await waitFor(() => expect(container.querySelector("section")).toBeNull());
    expect(document.body.textContent).not.toContain("No guest ratings yet");
    expect(document.body.textContent).not.toContain("0.0");
  });
});

describe("rating form", () => {
  it("requires Overall before submission is possible", async () => {
    stubFetch({ aggregate: emptyDiningRatingAggregate(VENUE) });
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Rate this restaurant" }));
    const submit = screen.getByRole("button", { name: "Submit rating" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Overall is required")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Overall rating: 4 out of 5"));
    expect((screen.getByRole("button", { name: "Submit rating" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("exposes every star as an accessible, keyboard-reachable radio", async () => {
    stubFetch({ aggregate: emptyDiningRatingAggregate(VENUE) });
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Rate this restaurant" }));
    for (const dim of ["Overall", "Taste", "Value", "Quality"]) {
      for (let star = 1; star <= 5; star += 1) {
        const input = screen.getByLabelText(`${dim} rating: ${star} out of 5`);
        expect((input as HTMLInputElement).type).toBe("radio");
      }
    }
    expect(screen.getAllByRole("radio")).toHaveLength(20);
  });

  it("marks Taste, Value and Quality optional but not Overall", async () => {
    stubFetch({ aggregate: emptyDiningRatingAggregate(VENUE) });
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Rate this restaurant" }));
    expect(screen.getAllByText("Optional")).toHaveLength(3);
  });

  it("submits Overall alone without inventing the other dimensions", async () => {
    const calls = stubFetch({
      aggregate: emptyDiningRatingAggregate(VENUE),
      post: { rating: { overall: 4, taste: null, value: null, quality: null }, aggregate: rated({ ratingCount: 1, overallAverage: 4 }) },
    });
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Rate this restaurant" }));
    fireEvent.click(screen.getByLabelText("Overall rating: 4 out of 5"));
    fireEvent.click(screen.getByRole("button", { name: "Submit rating" }));

    await screen.findByText("Thanks — your rating helps other park guests.");
    const post = calls.find((c) => c.init?.method === "POST")!;
    expect(post.url).toBe("/api/dining/ep-le-cellier/ratings/");
    expect(JSON.parse(post.init!.body as string)).toEqual({ overall: 4 });
  });

  it("updates the visible aggregate from the server response, not local arithmetic", async () => {
    stubFetch({
      aggregate: emptyDiningRatingAggregate(VENUE),
      post: { rating: { overall: 5, taste: null, value: null, quality: null }, aggregate: rated({ ratingCount: 1, overallAverage: 5, tasteCount: 0, valueCount: 0, qualityCount: 0 }) },
    });
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Rate this restaurant" }));
    fireEvent.click(screen.getByLabelText("Overall rating: 5 out of 5"));
    fireEvent.click(screen.getByRole("button", { name: "Submit rating" }));
    await screen.findByText("5.0");
    expect(screen.getByText("1 rating from Parkio guests")).toBeTruthy();
  });

  it("keeps the guest's selections and offers a retry when saving fails", async () => {
    stubFetch({ aggregate: emptyDiningRatingAggregate(VENUE), post: {}, postOk: false });
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Rate this restaurant" }));
    fireEvent.click(screen.getByLabelText("Overall rating: 3 out of 5"));
    fireEvent.click(screen.getByLabelText("Taste rating: 5 out of 5"));
    fireEvent.click(screen.getByRole("button", { name: "Submit rating" }));

    await screen.findByText("We couldn’t save your rating. Please try again.");
    expect((screen.getByLabelText("Overall rating: 3 out of 5") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Taste rating: 5 out of 5") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("button", { name: "Submit rating" }) as HTMLButtonElement).disabled).toBe(false);
    expect(document.body.textContent).not.toContain("Thanks");
  });

  it("never leaks infrastructure detail in an error", async () => {
    stubFetch({ aggregate: emptyDiningRatingAggregate(VENUE), post: {}, postOk: false });
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Rate this restaurant" }));
    fireEvent.click(screen.getByLabelText("Overall rating: 3 out of 5"));
    fireEvent.click(screen.getByRole("button", { name: "Submit rating" }));
    await screen.findByText("We couldn’t save your rating. Please try again.");
    for (const leak of ["D1", "Cloudflare", "503", "stack", "SQL"]) {
      expect(document.body.textContent).not.toContain(leak);
    }
  });
});

describe("existing rating", () => {
  const mine = { overall: 4, taste: 5, value: null, quality: null };

  it("offers Update instead of Rate, and shows the guest's current values", async () => {
    stubFetch({ aggregate: rated({ ratingCount: 1, overallAverage: 4 }), me: { rating: mine } });
    renderSection();
    await screen.findByRole("button", { name: "Update your rating" });
    expect(screen.getByText("Your rating")).toBeTruthy();
    expect(screen.getByText(/Overall 4\/5/)).toBeTruthy();
  });

  it("prefills answered dimensions and leaves unanswered ones unselected", async () => {
    stubFetch({ aggregate: rated({ ratingCount: 1 }), me: { rating: mine } });
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Update your rating" }));
    expect((screen.getByLabelText("Overall rating: 4 out of 5") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Taste rating: 5 out of 5") as HTMLInputElement).checked).toBe(true);
    for (let star = 1; star <= 5; star += 1) {
      expect((screen.getByLabelText(`Value rating: ${star} out of 5`) as HTMLInputElement).checked).toBe(false);
    }
  });

  it("updates through the same endpoint and does not add a vote", async () => {
    const calls = stubFetch({
      aggregate: rated({ ratingCount: 1, overallAverage: 4, tasteCount: 1, tasteAverage: 5, valueCount: 0, qualityCount: 0 }),
      me: { rating: mine },
      post: { rating: { overall: 5, taste: 5, value: null, quality: null }, aggregate: rated({ ratingCount: 1, overallAverage: 5, tasteCount: 1, tasteAverage: 5, valueCount: 0, qualityCount: 0 }) },
    });
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Update your rating" }));
    fireEvent.click(screen.getByLabelText("Overall rating: 5 out of 5"));
    fireEvent.click(screen.getByRole("button", { name: "Update rating" }));

    await screen.findByText("Your rating has been updated.");
    expect(screen.getByText("1 rating from Parkio guests")).toBeTruthy();
    const posts = calls.filter((c) => c.init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe("/api/dining/ep-le-cellier/ratings/");
  });
});

describe("identity privacy", () => {
  it("only ever calls the two trailing-slash ratings URLs", async () => {
    const calls = stubFetch({ aggregate: emptyDiningRatingAggregate(VENUE) });
    renderSection();
    await screen.findByText("No guest ratings yet");
    fireEvent.click(screen.getByRole("button", { name: "Rate this restaurant" }));
    for (const call of calls) {
      expect(["/api/dining/ep-le-cellier/ratings/", "/api/dining/ep-le-cellier/ratings/me/"]).toContain(call.url);
    }
    expect(calls.some((c) => c.init?.method === "POST")).toBe(false);
  });

  it("never reads the HttpOnly identity cookie from script", async () => {
    const source = GuestRatingSection.toString();
    expect(source).not.toContain("document.cookie");
    expect(source).not.toContain("parkio_rater");
  });

  it("shows no identity metadata in the rendered output", async () => {
    stubFetch({ aggregate: rated(), me: { rating: { overall: 4, taste: null, value: null, quality: null } } });
    renderSection();
    await screen.findByText("4.4");
    for (const leak of ["raterId", "rater_id", "signature", "updatedAt", "created_at", "status"]) {
      expect(document.body.textContent).not.toContain(leak);
    }
  });
});

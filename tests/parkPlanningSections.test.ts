// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AttractionsByLand } from "@/components/park/AttractionsByLand";
import { ParkIdentityHeader } from "@/components/park/ParkIdentityHeader";
import { ParkPlanningOverview } from "@/components/park/ParkPlanningOverview";
import { StartWithThese } from "@/components/park/StartWithThese";
import { getPark, getRidesForPark } from "@/lib/data";
import type { Park } from "@/lib/types";

/**
 * These render the real planning components. They are all server-safe —
 * no "use client", no hooks, no fetch — which is precisely why they can
 * be rendered here and why they end up in the prerendered HTML.
 */

afterEach(cleanup);

const epcot = getPark("epcot")!;
const dhs = getPark("hollywood-studios")!;

function links(container: HTMLElement): string[] {
  return [...container.querySelectorAll("a[href]")].map(
    (a) => a.getAttribute("href")!,
  );
}

describe("AttractionsByLand renders without live data", () => {
  it("lists all 11 EPCOT attractions", () => {
    const { container } = render(
      createElement(AttractionsByLand, { park: epcot }),
    );
    const hrefs = links(container);
    expect(hrefs).toHaveLength(11);
    expect(new Set(hrefs).size).toBe(11);
    for (const href of hrefs) {
      expect(href.startsWith("/parks/epcot/attractions/"), href).toBe(true);
    }
  });

  it("lists all 9 Hollywood Studios attractions", () => {
    const { container } = render(
      createElement(AttractionsByLand, { park: dhs }),
    );
    const hrefs = links(container);
    expect(hrefs).toHaveLength(9);
    for (const href of hrefs) {
      expect(
        href.startsWith("/parks/hollywood-studios/attractions/"),
        href,
      ).toBe(true);
    }
  });

  it("keeps EPCOT's World Showcase grouping with pavilion labels", () => {
    const { container } = render(
      createElement(AttractionsByLand, { park: epcot }),
    );
    const headings = [...container.querySelectorAll("h3")].map((h) =>
      h.textContent!.trim(),
    );
    expect(headings).toEqual([
      "World Discovery",
      "World Nature",
      "World Showcase",
      "World Celebration",
    ]);
    // Pavilion labels survive the grouping (uppercase is CSS, not text).
    for (const pavilion of ["Norway", "France", "Mexico"]) {
      expect(container.textContent, pavilion).toContain(pavilion);
    }
  });

  it("shows planning facts, never a wait time", () => {
    const { container } = render(
      createElement(AttractionsByLand, { park: epcot }),
    );
    const text = container.textContent!;
    expect(text).toContain("No height requirement");
    expect(text).toContain("Lightning Lane: Available");
    expect(text).not.toMatch(/\bmin\b|Typically ~|posted by the park/);
  });
});

describe("StartWithThese renders the curated set only", () => {
  it("shows 6 EPCOT headliners, all EPCOT links", () => {
    const { container } = render(createElement(StartWithThese, { park: epcot }));
    const hrefs = links(container);
    expect(hrefs).toHaveLength(6);
    for (const href of hrefs) {
      expect(href.startsWith("/parks/epcot/attractions/"), href).toBe(true);
    }
  });

  it("shows 6 Hollywood Studios headliners", () => {
    expect(
      links(render(createElement(StartWithThese, { park: dhs })).container),
    ).toHaveLength(6);
  });

  it("makes no personalization or quality claim", () => {
    const { container } = render(createElement(StartWithThese, { park: epcot }));
    const text = container.textContent!;
    expect(text).toContain("Start with these");
    expect(text).not.toMatch(/best rides|must-?do|for you|recommended|top pick/i);
  });
});

describe("ParkIdentityHeader keeps static data qualified", () => {
  it("labels hours and crowd as typical, not current", () => {
    const { container } = render(
      createElement(ParkIdentityHeader, { park: epcot }),
    );
    const text = container.textContent!;
    expect(text).toContain("EPCOT");
    expect(text).toContain("Typical hours");
    expect(text).toContain("Typically moderate");
    expect(text).not.toMatch(/open now|closed now|right now|current crowd/i);
  });

  it("renders exactly one h1", () => {
    const { container } = render(
      createElement(ParkIdentityHeader, { park: dhs }),
    );
    const h1s = container.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe(dhs.name);
  });
});

describe("ParkPlanningOverview counts, and only counts", () => {
  it("reports EPCOT's real totals", () => {
    const { container } = render(
      createElement(ParkPlanningOverview, { park: epcot }),
    );
    const text = container.textContent!;
    const rides = getRidesForPark("epcot");
    expect(text).toContain(`${rides.length} attractions across 4 areas`);
    expect(text).toContain(String(rides.filter((r) => r.lightningLane).length));
  });

  it("reports Hollywood Studios' real totals", () => {
    const { container } = render(
      createElement(ParkPlanningOverview, { park: dhs }),
    );
    expect(container.textContent).toContain("9 attractions across 5 areas");
  });

  it("makes no crowd, timing, or historical claim", () => {
    for (const park of [epcot, dhs] as Park[]) {
      const { container } = render(
        createElement(ParkPlanningOverview, { park }),
      );
      expect(container.textContent).not.toMatch(
        /best time|crowd level|busiest|quietest|average wait|historically|usually busy/i,
      );
      cleanup();
    }
  });
});

describe("all four planning sections are server-safe", () => {
  it("render with no fetch, no timers and no live data", () => {
    // Any accidental client dependency would throw here: jsdom has no
    // fetch stub installed in this file.
    for (const park of [epcot, dhs] as Park[]) {
      expect(() => {
        render(createElement(ParkIdentityHeader, { park }));
        render(createElement(ParkPlanningOverview, { park }));
        render(createElement(StartWithThese, { park }));
        render(createElement(AttractionsByLand, { park }));
      }).not.toThrow();
      cleanup();
    }
  });
});

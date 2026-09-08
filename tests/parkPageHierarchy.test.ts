import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Composition-order checks read the route source directly. The page mixes
 * server and client components, so it cannot be rendered in isolation —
 * but the order it composes them in is exactly what this slice changed,
 * and that is plain text in the file.
 *
 * Rendered-output proof for the planning sections lives in
 * tests/parkPlanningSections.test.ts, which renders the server-safe
 * components for real.
 */
const page = readFileSync("app/parks/[parkId]/page.tsx", "utf8");

/** Remove block and line comments so assertions test code, not prose. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** Index of a JSX element's usage, ignoring the import line. */
function usageIndex(component: string): number {
  return page.indexOf(`<${component}`, page.indexOf("export default"));
}

function usageCount(component: string): number {
  const body = page.slice(page.indexOf("export default"));
  return body.split(`<${component}`).length - 1;
}

describe("planning comes before the in-park tools", () => {
  it("orders identity → jump actions → planning → discovery → disclosure", () => {
    const order = [
      "ParkIdentityHeader",
      "ParkJumpActions",
      "ParkPlanningOverview",
      "StartWithThese",
      "AttractionsByLand",
      "InParkDisclosure",
    ].map((c) => ({ c, at: usageIndex(c) }));

    for (const entry of order) {
      expect(entry.at, `${entry.c} is not rendered`).toBeGreaterThan(-1);
    }
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i].at,
        `${order[i].c} must render after ${order[i - 1].c}`,
      ).toBeGreaterThan(order[i - 1].at);
    }
  });

  it("puts every live component inside the disclosure, after all planning", () => {
    const disclosure = usageIndex("InParkDisclosure");
    for (const live of [
      "ParkMap",
      "ParkRightNow",
      "ParkHappeningSoon",
      "ParkNearYou",
      "ParkNextMove",
      "ParkInsights",
    ]) {
      expect(usageIndex(live), live).toBeGreaterThan(disclosure);
    }
  });

  it("keeps the accepted live-stack order", () => {
    const live = [
      "ParkMap",
      "ParkRightNow",
      "ParkHappeningSoon",
      "ParkNearYou",
      "ParkNextMove",
      "ParkInsights",
    ].map(usageIndex);
    expect(live).toEqual([...live].sort((a, b) => a - b));
  });

  it("no longer mounts discovery below the live stack (Slice 4's temporary spot)", () => {
    expect(usageIndex("AttractionsByLand")).toBeLessThan(
      usageIndex("InParkDisclosure"),
    );
    expect(usageIndex("StartWithThese")).toBeLessThan(
      usageIndex("InParkDisclosure"),
    );
    expect(page).not.toContain("TEMPORARY PLACEMENT");
  });
});

describe("no duplication after the move", () => {
  it("renders each discovery section exactly once", () => {
    expect(usageCount("StartWithThese")).toBe(1);
    expect(usageCount("AttractionsByLand")).toBe(1);
    expect(usageCount("ParkPlanningOverview")).toBe(1);
    expect(usageCount("InParkDisclosure")).toBe(1);
  });

  it("renders each live component exactly once", () => {
    for (const live of [
      "ParkMap",
      "ParkRightNow",
      "ParkHappeningSoon",
      "ParkNearYou",
      "ParkNextMove",
      "ParkInsights",
    ]) {
      expect(usageCount(live), live).toBe(1);
    }
  });
});

describe("global navigation", () => {
  it("renders the global Navbar and Footer", () => {
    expect(usageIndex("Navbar")).toBeGreaterThan(-1);
    expect(usageIndex("Footer")).toBeGreaterThan(-1);
  });

  it("no longer mounts the full-screen map's floating overlay", () => {
    expect(usageIndex("MapNavOverlay")).toBe(-1);
  });

  it("keeps the app CTA and footer after the content", () => {
    expect(usageIndex("ParkPageAppCta")).toBeGreaterThan(
      usageIndex("InParkDisclosure"),
    );
    expect(usageIndex("Footer")).toBeGreaterThan(usageIndex("ParkPageAppCta"));
  });
});

describe("the map is no longer a full-viewport hero here", () => {
  it("passes a constrained height on the planning page", () => {
    expect(page).toMatch(/heightClassName="h-\[70vh\]/);
  });

  it("leaves the default height for other callers", () => {
    const parkMap = readFileSync("components/ParkMap.tsx", "utf8");
    expect(parkMap).toContain('heightClassName = "min-h-[100dvh]"');
    for (const other of [
      "components/SeoParkLanding.tsx",
      "components/SeoParkBestRides.tsx",
    ]) {
      expect(readFileSync(other, "utf8"), other).not.toContain(
        "heightClassName",
      );
    }
  });
});

describe("guest-facing copy honesty", () => {
  it("keeps the static crowd value qualified as typical", () => {
    const header = readFileSync(
      "components/park/ParkIdentityHeader.tsx",
      "utf8",
    );
    expect(header).toContain("crowdLabel(park.crowd)");
    expect(header).not.toMatch(/\{park\.crowd\}\s*crowd/);
    // Static hours must not be presented as today's hours.
    expect(header).toContain("Typical hours");
  });

  it("does not imply Parkio knows the guest's physical location", () => {
    const nearYou = readFileSync("components/ParkNearYou.tsx", "utf8");
    expect(nearYou).not.toContain("Near you");
    expect(nearYou).toContain("Near this ride");
    expect(nearYou).toContain("Based on your last selected ride");
    // Still no geolocation anywhere.
    expect(nearYou).not.toMatch(/geolocation|getCurrentPosition|watchPosition/);
  });

  it("derives the overview from counts, never from wait data", () => {
    // Strip comments first: the doc block legitimately *names* the things
    // this component must not do, and matching prose would flag itself.
    const overview = stripComments(
      readFileSync("components/park/ParkPlanningOverview.tsx", "utf8"),
    );
    expect(overview).not.toMatch(/baseWait|trend|waitMinutes/);
  });
});

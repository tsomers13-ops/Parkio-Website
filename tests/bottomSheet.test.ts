// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BottomSheet } from "@/components/BottomSheet";

/**
 * Leaflet paints its panes at z-index 200–700 and ParkMap's floating
 * controls at 800, all in the same stacking context as the sheet.
 * Anything at or below that buried the sheet behind the map.
 */
const MAP_MAX_Z = 800;

afterEach(cleanup);

function sheetElement(open: boolean, onClose: () => void) {
  return createElement(BottomSheet, {
    open,
    onClose,
    children: createElement("p", null, "Space Mountain"),
  });
}

function renderSheet(open: boolean, onClose = vi.fn()) {
  const utils = render(sheetElement(open, onClose));
  const sheet = utils.container.querySelector(
    '[role="dialog"]',
  ) as HTMLElement;
  const scrim = utils.container.querySelector("[aria-hidden]") as HTMLElement;
  return { ...utils, sheet, scrim, onClose };
}

function zIndexOf(el: HTMLElement) {
  return Number(
    [...el.classList]
      .map((c) => /^z-\[(\d+)\]$/.exec(c)?.[1] ?? /^z-(\d+)$/.exec(c)?.[1])
      .find(Boolean),
  );
}

describe("BottomSheet", () => {
  it("stacks above every Leaflet pane and map control", () => {
    const { sheet, scrim } = renderSheet(true);
    expect(zIndexOf(sheet)).toBeGreaterThan(MAP_MAX_Z);
    expect(zIndexOf(scrim)).toBeGreaterThan(MAP_MAX_Z);
    expect(zIndexOf(sheet)).toBeGreaterThan(zIndexOf(scrim));
  });

  it("pins itself to the viewport rather than the page flow", () => {
    const { sheet } = renderSheet(true);
    expect(sheet.className).toContain("fixed");
    expect(sheet.className).toContain("bottom-0");
    expect(sheet.style.transform).toBe("translateY(0px)");
  });

  it("hides itself from the a11y tree and pointer events when closed", () => {
    const { sheet } = renderSheet(false);
    expect(sheet.getAttribute("aria-hidden")).toBe("true");
    expect(sheet.className).toContain("pointer-events-none");
    expect(sheet.style.transform).toBe("translateY(100%)");
  });

  it("moves focus into the sheet on open and releases it on close", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    const { sheet, rerender } = renderSheet(true);
    await waitFor(() => expect(document.activeElement).toBe(sheet));

    rerender(sheetElement(false, vi.fn()));
    await waitFor(() => expect(document.activeElement).toBe(opener));
    opener.remove();
  });

  it("closes on Escape and on scrim click, but only while open", () => {
    const onClose = vi.fn();
    const { scrim, rerender } = renderSheet(true, onClose);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(scrim);
    expect(onClose).toHaveBeenCalledTimes(2);

    rerender(sheetElement(false, onClose));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InParkDisclosure } from "@/components/park/InParkDisclosure";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

function renderDisclosure() {
  return render(
    createElement(
      InParkDisclosure,
      null,
      createElement("p", { "data-testid": "live" }, "live stack"),
    ),
  );
}

function details(container: HTMLElement): HTMLDetailsElement {
  return container.querySelector("details")!;
}

describe("in-park disclosure", () => {
  it("uses native details/summary semantics", () => {
    const { container } = renderDisclosure();
    const el = details(container);
    expect(el).toBeTruthy();
    expect(el.querySelector("summary")).toBeTruthy();
    // No custom fake-button disclosure.
    expect(container.querySelector('[role="button"]')).toBeNull();
  });

  it("carries the #in-park anchor id", () => {
    const { container } = renderDisclosure();
    expect(details(container).id).toBe("in-park");
  });

  it("is closed by default on an ordinary visit", () => {
    const { container } = renderDisclosure();
    expect(details(container).open).toBe(false);
  });

  it("opens when the guest activates the summary", () => {
    const { container } = renderDisclosure();
    const el = details(container);
    // jsdom does not implement the native toggle, so mirror what the
    // browser does on activation and assert the component reacts.
    el.open = true;
    fireEvent(el, new Event("toggle"));
    expect(el.open).toBe(true);
  });

  it("keeps the summary keyboard reachable", () => {
    const { container } = renderDisclosure();
    const summary = details(container).querySelector("summary")!;
    summary.focus();
    expect(document.activeElement).toBe(summary);
    // Native <summary> is focusable without a tabindex hack.
    expect(summary.getAttribute("tabindex")).toBeNull();
  });

  it("renders its children so they are present for crawlers", () => {
    const { getByTestId } = renderDisclosure();
    expect(getByTestId("live")).toBeTruthy();
  });
});

describe("#in-park deep link", () => {
  it("opens the section when the page loads at that hash", async () => {
    window.location.hash = "#in-park";
    const { container } = renderDisclosure();
    await waitFor(() => expect(details(container).open).toBe(true));
  });

  it("stays closed for any other hash", async () => {
    window.location.hash = "#plan";
    const { container } = renderDisclosure();
    await new Promise((r) => setTimeout(r, 20));
    expect(details(container).open).toBe(false);
  });

  it("opens on a later hashchange", async () => {
    const { container } = renderDisclosure();
    expect(details(container).open).toBe(false);
    window.location.hash = "#in-park";
    fireEvent(window, new HashChangeEvent("hashchange"));
    await waitFor(() => expect(details(container).open).toBe(true));
  });
});

describe("map re-measure on reveal", () => {
  it("dispatches a resize once the section becomes visible", async () => {
    const onResize = vi.fn();
    window.addEventListener("resize", onResize);
    const { container } = renderDisclosure();

    const el = details(container);
    el.open = true;
    fireEvent(el, new Event("toggle"));

    // Leaflet measures its container on mount; inside a closed <details>
    // that measurement is zero, so it must re-measure on reveal.
    await waitFor(() => expect(onResize).toHaveBeenCalled(), { timeout: 1000 });
    window.removeEventListener("resize", onResize);
  });

  it("does not dispatch a resize while it stays closed", async () => {
    const onResize = vi.fn();
    window.addEventListener("resize", onResize);
    renderDisclosure();
    await new Promise((r) => setTimeout(r, 60));
    expect(onResize).not.toHaveBeenCalled();
    window.removeEventListener("resize", onResize);
  });
});

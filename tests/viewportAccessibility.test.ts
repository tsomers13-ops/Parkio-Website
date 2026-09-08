import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * WCAG 1.4.4: people with low vision must be able to zoom. Capping the
 * viewport scale silently removes that. This guards the fix so it cannot
 * quietly return.
 */
const layout = readFileSync("app/layout.tsx", "utf8");

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("root viewport does not block zoom", () => {
  const code = stripComments(layout);

  it("sets no maximumScale", () => {
    expect(code).not.toMatch(/maximumScale/);
  });

  it("sets no userScalable restriction", () => {
    expect(code).not.toMatch(/userScalable/);
  });

  it("emits no raw maximum-scale / user-scalable meta tag", () => {
    expect(code).not.toMatch(/maximum-scale|user-scalable/);
  });

  it("still declares the responsive viewport basics", () => {
    expect(code).toMatch(/width:\s*"device-width"/);
    expect(code).toMatch(/initialScale:\s*1/);
  });
});

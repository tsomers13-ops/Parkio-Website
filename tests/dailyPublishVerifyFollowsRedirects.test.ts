import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";

// Found during the full execution-path audit, specifically "pay
// particular attention to everything after TypeScript" — this is the
// FIRST time this exact step was examined, since no live run had ever
// reached it before every earlier defect was fixed.
//
// parkio.info 308-redirects a bare `/guide/<slug>` path to its own
// trailing-slash form REGARDLESS of whether the page is actually
// published — confirmed directly against the real site: an
// already-live page (2026-10-07) still returns 308 without `-L`, not
// 200. The original "Verify the publish" step's curl calls had no
// `-L`, which means they would have reported FAILURE on every single
// successful publish, forever — this workflow simply never lived long
// enough, until now, to find out.
//
// This spins up a real local HTTP server reproducing the exact same
// redirect shape, so the test doesn't depend on the live production
// site and isn't flaky on network access. It uses Node's own `fetch`
// with `redirect: "manual"` / `"follow"` — the same underlying HTTP
// semantics as curl's missing/present `-L` — rather than shelling out
// to the real `curl` binary: this sandbox's subprocess loopback
// networking hung/timed out when tested directly (confirmed via a
// standalone repro, with and without the sandbox restriction lifted,
// before falling back to this), even though in-process networking to
// the same server works immediately. `redirect: "manual"` vs
// `"follow"` is what curl's `-L` flag controls under the hood, so this
// still directly proves the real property at stake, just via Node's
// own HTTP client instead of spawning curl.
describe("'Verify the publish' must follow redirects, or it misreports a successful publish as failed", () => {
  let server: http.Server;
  let baseUrl: string;

  beforeEach(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/guide/parkio-daily-2026-10-07") {
        // Mirrors the real site exactly: a bare path 308s to the
        // trailing-slash form even though the page genuinely exists.
        res.writeHead(308, { Location: "/guide/parkio-daily-2026-10-07/" });
        res.end();
      } else if (req.url === "/guide/parkio-daily-2026-10-07/") {
        res.writeHead(200);
        res.end("<html>today's briefing</html>");
      } else if (req.url === "/guide/parkio-daily-2026-10-10") {
        // A genuinely unpublished day: same 308-to-trailing-slash
        // behavior, but the trailing-slash destination 404s for real.
        res.writeHead(308, { Location: "/guide/parkio-daily-2026-10-10/" });
        res.end();
      } else if (req.url === "/guide/parkio-daily-2026-10-10/") {
        res.writeHead(404);
        res.end("not found");
      } else {
        res.writeHead(404);
        res.end("not found");
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function statusCode(path: string, follow: boolean): Promise<number> {
    const res = await fetch(`${baseUrl}${path}`, { redirect: follow ? "follow" : "manual" });
    return res.status;
  }

  it("the OLD pattern (no -L / manual redirect) reports 308 for an ALREADY-LIVE page — this is the bug: it would fail the check on a genuinely successful publish", async () => {
    expect(await statusCode("/guide/parkio-daily-2026-10-07", false)).toBe(308);
  });

  it("the FIXED pattern (-L / follow redirect) correctly reports 200 for the same already-live page", async () => {
    expect(await statusCode("/guide/parkio-daily-2026-10-07", true)).toBe(200);
  });

  it("the FIXED pattern (-L / follow redirect) still correctly reports 404 for a genuinely unpublished page — the fix doesn't mask real failures", async () => {
    expect(await statusCode("/guide/parkio-daily-2026-10-10", true)).toBe(404);
  });
});

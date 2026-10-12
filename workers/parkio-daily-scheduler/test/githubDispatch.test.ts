import { describe, expect, it, vi } from "vitest";
import { buildDispatchRequest, dispatchWorkflow, type DispatchConfig } from "../src/githubDispatch";

const BASE_CONFIG: DispatchConfig = {
  owner: "tsomers13-ops",
  repo: "Parkio-Website",
  workflowFile: "parkio-daily.yml",
  ref: "main",
  token: "github_pat_SUPER_SECRET_VALUE_12345",
};

describe("buildDispatchRequest", () => {
  it("targets the exact workflow_dispatch REST endpoint for parkio-daily.yml", () => {
    const { url } = buildDispatchRequest(BASE_CONFIG);
    expect(url).toBe(
      "https://api.github.com/repos/tsomers13-ops/Parkio-Website/actions/workflows/parkio-daily.yml/dispatches"
    );
  });

  it("sends the token as a Bearer Authorization header and the correct ref in the body", () => {
    const { init } = buildDispatchRequest(BASE_CONFIG);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${BASE_CONFIG.token}`);
    expect(JSON.parse(init.body as string)).toEqual({ ref: "main" });
  });
});

describe("dispatchWorkflow — success path", () => {
  it("returns ok:true, ambiguous:false on a successful response, with exactly one HTTP call", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => "" });
    const outcome = await dispatchWorkflow(fetchImpl, BASE_CONFIG);
    expect(outcome).toEqual({ ok: true, status: 204, ambiguous: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("dispatchWorkflow — never retries (the lost-response / duplicate-dispatch risk)", () => {
  // Found during final review, before any deploy: GitHub's workflow_dispatch
  // endpoint is not idempotent — each successful POST queues a new real
  // run. If a POST actually reached GitHub and was processed, but its
  // response was lost (timeout, dropped connection), retrying would fire
  // a SECOND real dispatch on top of one that may have silently
  // succeeded. These tests prove that can no longer happen: exactly one
  // HTTP attempt is made, always, regardless of outcome.

  it("makes exactly ONE call on a confirmed (non-2xx) failure — no retry", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "Bad credentials" });
    const outcome = await dispatchWorkflow(fetchImpl, BASE_CONFIG);
    expect(outcome.ok).toBe(false);
    expect(outcome.ambiguous).toBe(false);
    expect(outcome.status).toBe(401);
    expect(outcome.errorBody).toBe("Bad credentials");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("makes exactly ONE call on a network-level throw, and marks the outcome ambiguous", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network unreachable"));
    const outcome = await dispatchWorkflow(fetchImpl, BASE_CONFIG);
    expect(outcome.ok).toBe(false);
    expect(outcome.ambiguous).toBe(true);
    expect(outcome.status).toBe(0);
    expect(outcome.errorBody).toContain("network unreachable");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("a timeout-shaped rejection is also ambiguous, not confirmed", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("timeout"));
    const outcome = await dispatchWorkflow(fetchImpl, BASE_CONFIG);
    expect(outcome.ambiguous).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("a 5xx HTTP response IS a received response — not ambiguous, even though it indicates a server-side problem", async () => {
    // This endpoint responding at all (even with a 5xx body) means a
    // full request/response cycle completed; GitHub told us plainly that
    // this specific attempt did not succeed.
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "Service Unavailable" });
    const outcome = await dispatchWorkflow(fetchImpl, BASE_CONFIG);
    expect(outcome.ambiguous).toBe(false);
    expect(outcome.status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("dispatchWorkflow — credential handling: the token must never appear in any failure output", () => {
  it("redacts the token even if a mock error message happened to echo it back", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 403, text: async () => `token ${BASE_CONFIG.token} is forbidden` });
    const outcome = await dispatchWorkflow(fetchImpl, BASE_CONFIG);
    expect(outcome.errorBody).not.toContain(BASE_CONFIG.token);
    expect(outcome.errorBody).toContain("[REDACTED]");
  });

  it("redacts the token from a thrown error's message too", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error(`failed with token ${BASE_CONFIG.token} attached`));
    const outcome = await dispatchWorkflow(fetchImpl, BASE_CONFIG);
    expect(outcome.errorBody).not.toContain(BASE_CONFIG.token);
  });

  it("the request init itself carries the token only in the Authorization header, never in the URL or logged fields", () => {
    const { url, init } = buildDispatchRequest(BASE_CONFIG);
    expect(url).not.toContain(BASE_CONFIG.token);
    expect(JSON.stringify(init.body)).not.toContain(BASE_CONFIG.token);
  });
});

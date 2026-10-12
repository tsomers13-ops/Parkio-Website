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
  it("returns ok:true on the first successful attempt, with no retry", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => "" });
    const outcome = await dispatchWorkflow(fetchImpl, BASE_CONFIG);
    expect(outcome).toEqual({ ok: true, status: 204 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("dispatchWorkflow — GitHub API failure handling", () => {
  it("retries exactly once after a non-2xx response, and succeeds if the retry works", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "Service Unavailable" })
      .mockResolvedValueOnce({ ok: true, status: 204, text: async () => "" });

    const outcome = await dispatchWorkflow(fetchImpl, BASE_CONFIG);
    expect(outcome).toEqual({ ok: true, status: 204 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("reports failure after both attempts fail, bounded at exactly two calls (no retry storm)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "Bad credentials" });
    const outcome = await dispatchWorkflow(fetchImpl, BASE_CONFIG);
    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBe(401);
    expect(outcome.errorBody).toBe("Bad credentials");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("handles a network-level throw (not just a non-2xx response) the same way, bounded at two attempts", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network unreachable"));
    const outcome = await dispatchWorkflow(fetchImpl, BASE_CONFIG);
    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBe(0);
    expect(outcome.errorBody).toContain("network unreachable");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("recovers from a network throw on attempt 1 if attempt 2 succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ ok: true, status: 204, text: async () => "" });
    const outcome = await dispatchWorkflow(fetchImpl, BASE_CONFIG);
    expect(outcome.ok).toBe(true);
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

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { todaysSlugAndDate } from "../scripts/parkio-daily/build.mjs";

// Real subprocess, not mocked — same reasoning as the CLI e2e suites
// elsewhere in this repo: a unit test against an exported pure function
// would never catch a bug in the actual script entry point (the
// `isMain` guard, the early-return placement relative to requireEnv,
// etc). Runs with dummy API keys that satisfy requireEnv's presence
// check without ever being used — the whole point of the idempotency
// skip is that it returns before any network call would need them for
// real.
describe("build.mjs idempotency — a re-dispatch must not regenerate an already-existing day's briefing", () => {
  const scriptPath = path.resolve(__dirname, "../scripts/parkio-daily/build.mjs");
  let tmpDir: string;
  let outPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "daily-build-idempotency-"));
    const { slug } = todaysSlugAndDate();
    const outDir = path.join(tmpDir, "content", "guide", "daily");
    fs.mkdirSync(outDir, { recursive: true });
    outPath = path.join(outDir, `${slug}.json`);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("skips generation entirely — and never touches the existing file — when today's briefing already exists", () => {
    const existingContent = JSON.stringify({ marker: "pre-existing, must not be overwritten" }, null, 2) + "\n";
    fs.writeFileSync(outPath, existingContent, "utf8");
    const before = fs.statSync(outPath).mtimeMs;

    const output = execFileSync("node", [scriptPath], {
      cwd: tmpDir,
      encoding: "utf8",
      env: { ...process.env, ANTHROPIC_API_KEY: "test-unused", YOUTUBE_API_KEY: "test-unused" },
      timeout: 10_000,
    });

    expect(output).toContain("already exists — skipping generation");
    // The real proof, not just the log line: content and mtime
    // byte-for-byte unchanged — nothing was regenerated or rewritten.
    expect(fs.readFileSync(outPath, "utf8")).toBe(existingContent);
    expect(fs.statSync(outPath).mtimeMs).toBe(before);
  }, 15_000);

  it("does NOT skip — and starts the real pipeline — when no file exists yet for today", () => {
    // Negative control: without the pre-existing file, the script must
    // proceed PAST the idempotency check, not stop there. It cannot
    // actually finish without real API keys/network access, so this
    // only asserts it started (logged "Building briefing for") and
    // never logged the skip message — not that it completes or fails
    // in any particular way. A short timeout is the expected, not
    // flaky, terminal state here: it's attempting real network calls
    // with fake credentials.
    expect(fs.existsSync(outPath)).toBe(false);
    let stdout = "";
    try {
      stdout = execFileSync("node", [scriptPath], {
        cwd: tmpDir,
        encoding: "utf8",
        env: { ...process.env, ANTHROPIC_API_KEY: "test-unused", YOUTUBE_API_KEY: "test-unused" },
        timeout: 4_000,
      });
    } catch (err: any) {
      stdout = typeof err.stdout === "string" ? err.stdout : "";
    }
    expect(stdout).toContain("Building briefing for");
    expect(stdout).not.toContain("already exists — skipping generation");
    expect(fs.existsSync(outPath)).toBe(false);
  }, 10_000);
});

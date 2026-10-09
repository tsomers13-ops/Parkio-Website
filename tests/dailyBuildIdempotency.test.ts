import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isValidExistingDailyPost, todaysSlugAndDate } from "../scripts/parkio-daily/build.mjs";

describe("isValidExistingDailyPost — pure schema check mirroring lib/guideDaily.ts's DailyPost", () => {
  it("accepts a minimal but complete post", () => {
    expect(
      isValidExistingDailyPost({ slug: "x", title: "T", date: "2026-01-01", teaser: "..." })
    ).toBe(true);
  });

  it.each(["slug", "title", "date", "teaser"])("rejects a post missing required field %s", (field) => {
    const post: Record<string, string> = { slug: "x", title: "T", date: "2026-01-01", teaser: "..." };
    delete post[field];
    expect(isValidExistingDailyPost(post)).toBe(false);
  });

  it("rejects a required field that is present but empty/blank", () => {
    expect(isValidExistingDailyPost({ slug: "x", title: "  ", date: "2026-01-01", teaser: "..." })).toBe(false);
  });

  it("rejects non-object candidates", () => {
    expect(isValidExistingDailyPost(null)).toBe(false);
    expect(isValidExistingDailyPost(undefined)).toBe(false);
    expect(isValidExistingDailyPost("a string")).toBe(false);
    expect(isValidExistingDailyPost([])).toBe(false);
  });

  it("does not require optional fields (sections, videos, rightNow, meta)", () => {
    expect(isValidExistingDailyPost({ slug: "x", title: "T", date: "2026-01-01", teaser: "..." })).toBe(true);
  });
});

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

  // A minimal but genuinely valid DailyPost per lib/guideDaily.ts's
  // required fields (slug, title, date, teaser) — everything else is
  // optional there, so this is deliberately sparse.
  function validDailyPost(slug: string) {
    return JSON.stringify(
      { slug, title: "Parkio Daily — Test", date: "2026-01-01", teaser: "A valid pre-existing teaser." },
      null,
      2,
    ) + "\n";
  }

  it("skips generation entirely — and never touches the existing file — when today's briefing already exists and is valid", () => {
    const { slug } = todaysSlugAndDate();
    const existingContent = validDailyPost(slug);
    fs.writeFileSync(outPath, existingContent, "utf8");
    const before = fs.statSync(outPath).mtimeMs;

    const output = execFileSync("node", [scriptPath], {
      cwd: tmpDir,
      encoding: "utf8",
      env: { ...process.env, ANTHROPIC_API_KEY: "test-unused", YOUTUBE_API_KEY: "test-unused" },
      timeout: 10_000,
    });

    expect(output).toContain("already exists and is valid — skipping generation");
    // The real proof, not just the log line: content and mtime
    // byte-for-byte unchanged — nothing was regenerated or rewritten.
    expect(fs.readFileSync(outPath, "utf8")).toBe(existingContent);
    expect(fs.statSync(outPath).mtimeMs).toBe(before);
  }, 15_000);

  it("fails closed — does not overwrite, does not treat as reusable — when the existing file is not valid JSON", () => {
    const corrupt = "{ this is not valid json,,,";
    fs.writeFileSync(outPath, corrupt, "utf8");

    let threw = false;
    let stderr = "";
    try {
      execFileSync("node", [scriptPath], {
        cwd: tmpDir,
        encoding: "utf8",
        env: { ...process.env, ANTHROPIC_API_KEY: "test-unused", YOUTUBE_API_KEY: "test-unused" },
        timeout: 10_000,
      });
    } catch (err: any) {
      threw = true;
      stderr = typeof err.stderr === "string" ? err.stderr : "";
    }
    expect(threw).toBe(true);
    expect(stderr).toContain("not valid JSON");
    // Fails closed means exactly that — the corrupt file is left
    // exactly as it was, neither "fixed" nor silently published.
    expect(fs.readFileSync(outPath, "utf8")).toBe(corrupt);
  }, 15_000);

  it("fails closed — does not overwrite, does not treat as reusable — when the existing file is valid JSON but missing required DailyPost fields", () => {
    const incomplete = JSON.stringify({ slug: "whatever" }, null, 2) + "\n"; // missing title/date/teaser
    fs.writeFileSync(outPath, incomplete, "utf8");

    let threw = false;
    let stderr = "";
    try {
      execFileSync("node", [scriptPath], {
        cwd: tmpDir,
        encoding: "utf8",
        env: { ...process.env, ANTHROPIC_API_KEY: "test-unused", YOUTUBE_API_KEY: "test-unused" },
        timeout: 10_000,
      });
    } catch (err: any) {
      threw = true;
      stderr = typeof err.stderr === "string" ? err.stderr : "";
    }
    expect(threw).toBe(true);
    expect(stderr).toContain("missing required DailyPost fields");
    expect(fs.readFileSync(outPath, "utf8")).toBe(incomplete);
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

describe("slug-extraction sed pattern — shared by the new already-live check and the pre-existing publish-verification step", () => {
  // Both .github/workflows/parkio-daily-publish.yml's new "check" job and
  // its pre-existing "Verify the publish" step derive today's slug from
  // the content commit's own message ("Parkio Daily — YYYY-MM-DD") with
  // this exact sed pattern. A regex bug here would silently break the
  // already-live check (always false, or always true) without any
  // actionlint or TypeScript signal — this exercises the real `sed`
  // binary, not a JS re-implementation of the pattern, so it can't drift
  // from what the workflow actually runs.
  const SED_PATTERN = "s/.*— ([0-9]{4}-[0-9]{2}-[0-9]{2})/\\1/";

  function extractSlug(commitMessage: string): string {
    return execFileSync("sed", ["-E", SED_PATTERN], { input: commitMessage, encoding: "utf8" }).trim();
  }

  it("extracts the date from a real-shaped commit message", () => {
    expect(extractSlug("Parkio Daily — 2026-10-09")).toBe("2026-10-09");
  });

  it("extracts correctly across a year/month boundary", () => {
    expect(extractSlug("Parkio Daily — 2027-01-01")).toBe("2027-01-01");
  });
});

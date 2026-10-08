import { describe, expect, it } from "vitest";
import {
  DAILY_BOT_AUTHOR_EMAIL,
  DAILY_BOT_AUTHOR_NAME,
  isAllowedPath,
  validateCandidate,
} from "../scripts/parkio-daily/validatePublishCandidate.mjs";

const GOOD_AUTHOR = {
  authorName: DAILY_BOT_AUTHOR_NAME,
  authorEmail: DAILY_BOT_AUTHOR_EMAIL,
};

describe("isAllowedPath", () => {
  it("allows a guide/daily JSON file", () => {
    expect(isAllowedPath("content/guide/daily/parkio-daily-2026-10-07.json")).toBe(true);
  });

  it("allows a social markdown file", () => {
    expect(isAllowedPath("content/social/parkio-daily-2026-10-07.md")).toBe(true);
  });

  it("rejects a guide/daily file with the wrong extension", () => {
    expect(isAllowedPath("content/guide/daily/parkio-daily-2026-10-07.md")).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(isAllowedPath("content/guide/daily/parkio-daily-2026-13-99.json")).toBe(false);
  });

  it("rejects a path that merely starts with the allowed prefix", () => {
    expect(isAllowedPath("content/guide/daily/../../../etc/passwd")).toBe(false);
    expect(isAllowedPath("content/guide/daily-evil/parkio-daily-2026-10-07.json")).toBe(false);
  });

  it("rejects application source, workflow, and config files", () => {
    expect(isAllowedPath("app/api/dining/[venueKey]/ratings/route.ts")).toBe(false);
    expect(isAllowedPath(".github/workflows/workers-production.yml")).toBe(false);
    expect(isAllowedPath("wrangler.production.jsonc")).toBe(false);
    expect(isAllowedPath("package.json")).toBe(false);
    expect(isAllowedPath("package-lock.json")).toBe(false);
  });
});

describe("validateCandidate — happy paths", () => {
  it("passes a normal two-file Daily commit", () => {
    const result = validateCandidate({
      ...GOOD_AUTHOR,
      changedPaths: [
        "content/guide/daily/parkio-daily-2026-10-07.json",
        "content/social/parkio-daily-2026-10-07.md",
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
    expect(result.allowedPaths).toHaveLength(2);
  });

  it("passes a single-file Daily commit (social.mjs skipped, per its own documented non-fatal failure mode)", () => {
    const result = validateCandidate({
      ...GOOD_AUTHOR,
      changedPaths: ["content/guide/daily/parkio-daily-2026-10-07.json"],
    });
    expect(result.ok).toBe(true);
  });
});

describe("validateCandidate — fails closed", () => {
  it("rejects an unrelated application source change", () => {
    const result = validateCandidate({
      ...GOOD_AUTHOR,
      changedPaths: [
        "content/guide/daily/parkio-daily-2026-10-07.json",
        "lib/ratingsWriteHost.ts",
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/lib\/ratingsWriteHost\.ts/);
  });

  it("rejects a workflow/CI configuration change", () => {
    const result = validateCandidate({
      ...GOOD_AUTHOR,
      changedPaths: [
        "content/guide/daily/parkio-daily-2026-10-07.json",
        ".github/workflows/workers-production.yml",
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a production config / infra change", () => {
    const result = validateCandidate({
      ...GOOD_AUTHOR,
      changedPaths: ["wrangler.production.jsonc"],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a dependency manifest change", () => {
    const result = validateCandidate({
      ...GOOD_AUTHOR,
      changedPaths: [
        "content/guide/daily/parkio-daily-2026-10-07.json",
        "package.json",
        "package-lock.json",
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an empty diff", () => {
    const result = validateCandidate({ ...GOOD_AUTHOR, changedPaths: [] });
    expect(result.ok).toBe(false);
  });

  it("rejects a commit not authored by the Daily bot, even with allowlisted paths", () => {
    const result = validateCandidate({
      authorName: "Tom Somers",
      authorEmail: "tsomers@outlook.com",
      changedPaths: ["content/guide/daily/parkio-daily-2026-10-07.json"],
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/author mismatch/);
  });

  it("rejects a spoofed author name with the bot's email changed", () => {
    const result = validateCandidate({
      authorName: DAILY_BOT_AUTHOR_NAME,
      authorEmail: "attacker@example.com",
      changedPaths: ["content/guide/daily/parkio-daily-2026-10-07.json"],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects when a disallowed path rides along with otherwise-valid Daily files", () => {
    const result = validateCandidate({
      ...GOOD_AUTHOR,
      changedPaths: [
        "content/guide/daily/parkio-daily-2026-10-07.json",
        "content/social/parkio-daily-2026-10-07.md",
        ".github/workflows/parkio-daily.yml",
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.allowedPaths).toHaveLength(2);
  });
});

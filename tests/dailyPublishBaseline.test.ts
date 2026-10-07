import { describe, expect, it } from "vitest";
import {
  parseVersionTag,
  resolveActiveVersionId,
  resolveApprovedBaseline,
} from "../scripts/parkio-daily/resolveApprovedBaseline.mjs";

const SHA_A = "a".repeat(40); // "released" / originally-deployed baseline
const SHA_B = "b".repeat(40); // a later, never-deployed release attempt

function deployment(versionId: string, percentage: number, createdOn: string) {
  return {
    id: `deploy-${versionId}`,
    versions: [{ version_id: versionId, percentage }],
    created_on: createdOn,
  };
}

function version(id: string, tag?: string) {
  return {
    id,
    annotations: tag ? { "workers/tag": tag } : { "workers/triggered_by": "deployment" },
  };
}

const ALWAYS_EXISTS = () => true;
const NEVER_EXISTS = () => false;

describe("parseVersionTag", () => {
  it("extracts a well-formed sha tag", () => {
    expect(parseVersionTag(`sha:${SHA_A}`)).toBe(SHA_A);
  });
  it("rejects a missing tag", () => {
    expect(parseVersionTag(undefined)).toBeNull();
  });
  it("rejects a tag with the wrong prefix", () => {
    expect(parseVersionTag(`commit:${SHA_A}`)).toBeNull();
  });
  it("rejects a short/invalid hex sha", () => {
    expect(parseVersionTag("sha:abc123")).toBeNull();
  });
});

describe("resolveActiveVersionId", () => {
  it("fails closed on no deployments", () => {
    expect(resolveActiveVersionId([]).ok).toBe(false);
  });

  it("fails closed during a gradual rollout (two versions splitting traffic)", () => {
    const result = resolveActiveVersionId([
      {
        id: "d1",
        versions: [
          { version_id: "v1", percentage: 90 },
          { version_id: "v2", percentage: 10 },
        ],
        created_on: "2026-10-07T00:00:00Z",
      },
    ]);
    expect(result.ok).toBe(false);
  });

  it("picks the single 100% version of the most recent deployment", () => {
    const result = resolveActiveVersionId([
      deployment("v-old", 100, "2026-10-01T00:00:00Z"),
      deployment("v-new", 100, "2026-10-07T00:00:00Z"),
    ]);
    expect(result).toEqual({ ok: true, versionId: "v-new" });
  });
});

describe("resolveApprovedBaseline — scenario A: normal production release", () => {
  it("resolves the just-released sha as the baseline", () => {
    const result = resolveApprovedBaseline({
      deploymentsListJson: [deployment("v1", 100, "2026-10-07T16:21:00Z")],
      versionsListJson: [version("v1", `sha:${SHA_A}`)],
      gitShaExists: ALWAYS_EXISTS,
    });
    expect(result).toEqual({ ok: true, sha: SHA_A, versionId: "v1" });
  });
});

describe("resolveApprovedBaseline — scenario B: Daily publication after a release", () => {
  it("Daily's own prior publish re-asserted the same tag — resolves identically on the next run", () => {
    // Daily's own deploy re-tags with the SAME baseline sha, so a second
    // Daily run sees an unchanged, stable baseline.
    const result = resolveApprovedBaseline({
      deploymentsListJson: [
        deployment("v1", 100, "2026-10-07T16:21:00Z"),
        deployment("v1", 100, "2026-10-08T11:00:00Z"), // Daily re-deployed the SAME version's tag content
      ],
      versionsListJson: [version("v1", `sha:${SHA_A}`)],
      gitShaExists: ALWAYS_EXISTS,
    });
    expect(result).toEqual({ ok: true, sha: SHA_A, versionId: "v1" });
  });
});

describe("resolveApprovedBaseline — scenario C/D: rollback", () => {
  it("after a rollback to an older version, resolves THAT version's original sha — not the newer one it replaced", () => {
    // v2 (SHA_B) was deployed, then rolled back to v1 (SHA_A). The rollback
    // creates a NEW deployment record referencing the OLD version v1 — v1's
    // own tag, set when v1 was originally created, is unchanged.
    const result = resolveApprovedBaseline({
      deploymentsListJson: [
        deployment("v1", 100, "2026-10-01T00:00:00Z"),
        deployment("v2", 100, "2026-10-07T00:00:00Z"),
        deployment("v1", 100, "2026-10-07T12:00:00Z"), // rollback
      ],
      versionsListJson: [version("v1", `sha:${SHA_A}`), version("v2", `sha:${SHA_B}`)],
      gitShaExists: ALWAYS_EXISTS,
    });
    expect(result).toEqual({ ok: true, sha: SHA_A, versionId: "v1" });
  });

  it("a subsequent Daily publication after the rollback still resolves the rolled-back baseline", () => {
    const result = resolveApprovedBaseline({
      deploymentsListJson: [
        deployment("v1", 100, "2026-10-01T00:00:00Z"),
        deployment("v2", 100, "2026-10-07T00:00:00Z"),
        deployment("v1", 100, "2026-10-07T12:00:00Z"),
        deployment("v1", 100, "2026-10-08T11:00:00Z"), // next day's Daily publish
      ],
      versionsListJson: [version("v1", `sha:${SHA_A}`), version("v2", `sha:${SHA_B}`)],
      gitShaExists: ALWAYS_EXISTS,
    });
    expect(result.ok).toBe(true);
    expect(result.sha).toBe(SHA_A);
  });
});

describe("resolveApprovedBaseline — scenario E/F: a newer tag/release exists but was never deployed", () => {
  it("a production-release-* tag with no corresponding deployed version is simply invisible — never consulted", () => {
    // SHA_B has a git tag (not modeled here at all, by design) but no
    // Cloudflare version/deployment exists for it — resolution is driven
    // entirely by what IS live, so it cannot surface.
    const result = resolveApprovedBaseline({
      deploymentsListJson: [deployment("v1", 100, "2026-10-01T00:00:00Z")],
      versionsListJson: [version("v1", `sha:${SHA_A}`)],
      gitShaExists: ALWAYS_EXISTS,
    });
    expect(result.sha).toBe(SHA_A);
    expect(result.sha).not.toBe(SHA_B);
  });

  it("fails closed when the active version has no tag at all (e.g. deployed before this convention existed)", () => {
    const result = resolveApprovedBaseline({
      deploymentsListJson: [deployment("v1", 100, "2026-10-01T00:00:00Z")],
      versionsListJson: [version("v1")], // no tag annotation
      gitShaExists: ALWAYS_EXISTS,
    });
    expect(result.ok).toBe(false);
  });
});

describe("resolveApprovedBaseline — fails closed", () => {
  it("when the active version cannot be found in the versions list", () => {
    const result = resolveApprovedBaseline({
      deploymentsListJson: [deployment("v-missing", 100, "2026-10-07T00:00:00Z")],
      versionsListJson: [version("v1", `sha:${SHA_A}`)],
      gitShaExists: ALWAYS_EXISTS,
    });
    expect(result.ok).toBe(false);
  });

  it("when the tagged sha does not exist in local git history (metadata/reality disagreement)", () => {
    const result = resolveApprovedBaseline({
      deploymentsListJson: [deployment("v1", 100, "2026-10-07T00:00:00Z")],
      versionsListJson: [version("v1", `sha:${SHA_A}`)],
      gitShaExists: NEVER_EXISTS,
    });
    expect(result.ok).toBe(false);
    expect(result.problems?.join(" ")).toMatch(/does not exist in local git history/);
  });

  it("when no deployments exist at all", () => {
    const result = resolveApprovedBaseline({
      deploymentsListJson: [],
      versionsListJson: [],
      gitShaExists: ALWAYS_EXISTS,
    });
    expect(result.ok).toBe(false);
  });

  it("when a malformed tag is present", () => {
    const result = resolveApprovedBaseline({
      deploymentsListJson: [deployment("v1", 100, "2026-10-07T00:00:00Z")],
      versionsListJson: [version("v1", "not-a-valid-tag")],
      gitShaExists: ALWAYS_EXISTS,
    });
    expect(result.ok).toBe(false);
  });
});

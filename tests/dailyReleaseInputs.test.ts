import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assessDailyWorkflowRun,
  inspectInputs,
  materializeFixedRef,
  materializeHeldBriefing,
  parseFixedRef,
  restoreHeldEvidence,
  runCheck,
  sha256Bytes,
  verifyHeldRunId,
} from "../scripts/parkio-daily/releaseInputs.mjs";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "parkio-release-"));
  temps.push(dir);
  return dir;
}

describe("release input shape", () => {
  const today = "2026-11-25";

  it("rejects both paths, a bad run id, ack alone, and a ref that is not today's slug", () => {
    expect(inspectInputs({ releaseHeldRunId: "123", fixedRef: "daily-fix/parkio-daily-2026-11-25", ack: "", today }).ok).toBe(false);
    expect(inspectInputs({ releaseHeldRunId: "abc", fixedRef: "", ack: "", today }).ok).toBe(false);
    expect(inspectInputs({ releaseHeldRunId: "", fixedRef: "", ack: "b-closed-attraction:abc", today }).problems.join(" ")).toMatch(/no skip switch/i);
    expect(parseFixedRef("daily-fix/parkio-daily-2026-11-24", today).ok).toBe(false);
    expect(parseFixedRef("main", today).ok).toBe(false);
    expect(parseFixedRef("daily-fix/../main", today).ok).toBe(false);
    const ok = inspectInputs({ releaseHeldRunId: "", fixedRef: "refs/heads/daily-fix/parkio-daily-2026-11-25", ack: "id-1", today });
    expect(ok.ok).toBe(true);
    expect(ok.download).toBe(false);
    expect(ok.apply).toBe(true);
    expect(ok.fixed?.relPath).toBe("content/guide/daily/parkio-daily-2026-11-25.json");
    const normal = inspectInputs({ releaseHeldRunId: "", fixedRef: "", ack: "", today });
    expect(normal).toMatchObject({ ok: true, download: false, apply: false });
  });
});

describe("release_held_run_id must be this repo's Parkio Daily workflow", () => {
  const repo = "tsomers13-ops/Parkio-Website";

  it("accepts parkio-daily.yml and rejects another workflow, another repo, and a 404", async () => {
    expect(assessDailyWorkflowRun({
      path: ".github/workflows/parkio-daily.yml",
      name: "Parkio Daily",
      repository: { full_name: repo },
    }, { repo, runId: "123" }).ok).toBe(true);

    expect(assessDailyWorkflowRun({
      path: ".github/workflows/workers-production.yml",
      name: "Production",
      repository: { full_name: repo },
    }, { repo, runId: "456" }).ok).toBe(false);

    expect(assessDailyWorkflowRun({
      path: ".github/workflows/parkio-daily.yml",
      name: "Parkio Daily",
      repository: { full_name: "other/Parkio-Website" },
    }, { repo, runId: "789" }).problems.join(" ")).toMatch(/other\/Parkio-Website/);

    const fetchImpl = async (url: string) => {
      if (String(url).endsWith("/789")) return { ok: false, status: 404, json: async () => ({}) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          path: ".github/workflows/parkio-daily.yml",
          name: "Parkio Daily",
          repository: { full_name: repo },
        }),
      };
    };
    const good = await verifyHeldRunId("123", { repo, token: "token", fetchImpl });
    expect(good.ok).toBe(true);
    const missing = await verifyHeldRunId("789", { repo, token: "token", fetchImpl });
    expect(missing.ok).toBe(false);
    expect(missing.problems.join(" ")).toMatch(/not a workflow run/);

    const previous = { repo: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN, run: process.env.RELEASE_HELD_RUN_ID, out: process.env.GITHUB_OUTPUT };
    const out = path.join(tempDir(), "output");
    process.env.GITHUB_REPOSITORY = repo;
    process.env.GITHUB_TOKEN = "token";
    process.env.RELEASE_HELD_RUN_ID = "456";
    process.env.GITHUB_OUTPUT = out;
    delete process.env.FIXED_REF;
    delete process.env.ACK;
    try {
      const code = await runCheck({
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => ({ path: ".github/workflows/workers-preview.yml", name: "Preview", repository: { full_name: repo } }),
        }),
      });
      expect(code).toBe(1);
    } finally {
      if (previous.repo === undefined) delete process.env.GITHUB_REPOSITORY;
      else process.env.GITHUB_REPOSITORY = previous.repo;
      if (previous.token === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = previous.token;
      if (previous.run === undefined) delete process.env.RELEASE_HELD_RUN_ID;
      else process.env.RELEASE_HELD_RUN_ID = previous.run;
      if (previous.out === undefined) delete process.env.GITHUB_OUTPUT;
      else process.env.GITHUB_OUTPUT = previous.out;
    }
  });
});

describe("held artifact bytes", () => {
  it("refuses a hash mismatch and a slug that is not today", () => {
    const dir = tempDir();
    const briefing = Buffer.from(JSON.stringify({
      slug: "parkio-daily-2026-11-25",
      title: "t",
      date: "2026-11-25",
      teaser: "t",
    }));
    writeFileSync(path.join(dir, "briefing.json"), briefing);
    writeFileSync(path.join(dir, "report.json"), JSON.stringify({ sha256: "deadbeef" }));
    expect(() => materializeHeldBriefing({ artifactDir: dir, repo: dir, today: "2026-11-25" })).toThrow(/sha256/);

    writeFileSync(path.join(dir, "report.json"), JSON.stringify({ sha256: sha256Bytes(briefing) }));
    expect(() => materializeHeldBriefing({ artifactDir: dir, repo: dir, today: "2026-11-26" })).toThrow(/not today/);

    const { sha } = materializeHeldBriefing({ artifactDir: dir, repo: dir, today: "2026-11-25" });
    expect(sha).toBe(sha256Bytes(briefing));
    const written = readFileSync(path.join(dir, "content", "guide", "daily", "parkio-daily-2026-11-25.json"));
    expect(sha256Bytes(written)).toBe(sha);
  });

  it("restores feed evidence beside the briefing so the re-check sees the same sources", () => {
    const dir = tempDir();
    const evidence = { version: 1, skipped: false, items: [{ source: "WDWNT", title: "t", link: "https://wdwnt.com/a", pubDate: "2026-11-24T10:30:00.000Z" }] };
    writeFileSync(path.join(dir, "evidence.json"), JSON.stringify(evidence));
    const dest = path.join(dir, "out", "parkio-daily-evidence.json");
    expect(restoreHeldEvidence(dir, dest)).toEqual({ restored: true, dest });
    expect(JSON.parse(readFileSync(dest, "utf8"))).toEqual(evidence);
    expect(restoreHeldEvidence(path.join(dir, "empty"), path.join(dir, "missing.json")).restored).toBe(false);
  });
});

describe("fixed_ref copies only today's JSON", () => {
  it("fetches the branch and does not check out the rest of it", () => {
    const root = tempDir();
    const origin = path.join(root, "origin.git");
    execFileSync("git", ["init", "--bare", "-b", "main", origin]);
    const seed = path.join(root, "seed");
    execFileSync("git", ["clone", origin, seed]);
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: "Tom",
      GIT_AUTHOR_EMAIL: "tom@example.com",
      GIT_COMMITTER_NAME: "Tom",
      GIT_COMMITTER_EMAIL: "tom@example.com",
    };
    execFileSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: seed, env });
    execFileSync("git", ["push", "origin", "HEAD:main"], { cwd: seed });
    execFileSync("git", ["checkout", "-b", "daily-fix/parkio-daily-2026-11-25"], { cwd: seed });
    const rel = path.join("content", "guide", "daily", "parkio-daily-2026-11-25.json");
    const json = `${JSON.stringify({
      slug: "parkio-daily-2026-11-25",
      title: "Corrected",
      date: "2026-11-25",
      teaser: "A corrected briefing.",
    }, null, 2)}\n`;
    mkdirSync(path.dirname(path.join(seed, rel)), { recursive: true });
    writeFileSync(path.join(seed, rel), json);
    writeFileSync(path.join(seed, "evil.txt"), "do not copy\n");
    execFileSync("git", ["add", "."], { cwd: seed });
    execFileSync("git", ["commit", "-m", "fix"], { cwd: seed, env });
    execFileSync("git", ["push", "origin", "HEAD:daily-fix/parkio-daily-2026-11-25"], { cwd: seed });

    const runner = path.join(root, "runner");
    execFileSync("git", ["clone", origin, runner]);
    const git = (args: string[]) =>
      execFileSync("git", args, {
        cwd: runner,
        encoding: "utf8",
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
    const spec = parseFixedRef("daily-fix/parkio-daily-2026-11-25", "2026-11-25");
    expect(spec.ok).toBe(true);
    const { dest } = materializeFixedRef({ spec, repo: runner, git });
    expect(readFileSync(dest, "utf8")).toBe(json);
    expect(() => readFileSync(path.join(runner, "evil.txt"), "utf8")).toThrow();
  });
});

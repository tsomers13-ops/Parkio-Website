import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import {
  buildFeedEvidence,
  feedEvidencePath,
  parsePubDateToIso,
  writeFeedEvidenceFile,
  writeSkippedFeedEvidence,
} from "../scripts/parkio-daily/build.mjs";
import {
  checkDailyPost,
  etCalendarDate,
  evaluateAcknowledgements,
  explicitDates,
  issueWeekday,
  loadAttractionStatus,
  loadFacts,
  parseAckList,
  resolveEvidence,
  runCli,
} from "../scripts/parkio-daily/factcheck.mjs";

const REPO = process.cwd();
const DAILY = path.join(REPO, "content", "guide", "daily");
const PRECORRECTION_BLOB = "17261b14a13cd24a192964059665a23361881b51";

/**
 * JSON-only debut holds from the replay of every file in content/guide/daily
 * at the time this test was written (198 files on fa8db4ea plus this branch's
 * data files; the daily JSON files themselves are unchanged). Each one is a
 * real d-debut-tense hit, not a guessed list.
 */
const REPLAY_HOLDS = [
  "parkio-daily-2026-07-23.json",
  "parkio-daily-2026-08-06.json",
  "parkio-daily-2026-08-12.json",
  "parkio-daily-2026-08-15.json",
  "parkio-daily-2026-11-12.json",
] as const;

function loadDaily(name: string) {
  return JSON.parse(readFileSync(path.join(DAILY, name), "utf8"));
}

describe("ledger and attraction seed", () => {
  it("seeds only DINOSAUR and DinoLand U.S.A., from the March 6, 2025 Disney Parks Blog post", () => {
    const attractions = loadAttractionStatus() as Array<{
      id: string;
      effectiveDate: string;
      lastOperatingDay: string;
      status: string;
      source: { url: string; publishedAt: string; tier: string };
    }>;
    expect(attractions.map((a) => a.id)).toEqual(["ak-dinosaur", "ak-dinoland"]);
    for (const a of attractions) {
      expect(a.effectiveDate).toBe("2026-02-02");
      expect(a.lastOperatingDay).toBe("2026-02-01");
      expect(a.status).toBe("closed-permanently");
      expect(a.source.url).toBe("https://disneyparksblog.com/wdw/dinoland-closing-animal-kingdom/");
      expect(a.source.publishedAt).toBe("2025-03-06");
      expect(a.source.tier).toBe("official");
    }
  });

  it("seeds Twilight Tales as secondary, with official confirmation not found", () => {
    const facts = loadFacts() as Array<{
      id: string;
      subject: string;
      tier: string;
      officialConfirmation: string;
      startDate: string;
      endDate: string;
      sources: Array<{ url: string; tier: string }>;
    }>;
    expect(facts.map((f) => f.id)).toEqual(["ak-twilight-tales"]);
    const fact = facts[0];
    expect(fact.subject).toBe("Twilight Tales");
    expect(fact.tier).toBe("secondary");
    expect(fact.officialConfirmation).toBe("not-found");
    expect(fact.startDate).toBe("2026-12-20");
    expect(fact.endDate).toBe("2027-01-03");
    expect(fact.sources[0].url).toContain("wdwnt.com/2026/11/new-nighttime-version");
    expect(fact.sources[0].tier).toBe("secondary");
  });
});

describe("pre-correction Nov 24 must fail, and the corrected issues must pass", () => {
  const fixture = path.join(REPO, "tests", "fixtures", "parkio-daily-2026-11-24-precorrection.json");

  it("the fixture bytes are the git blob from 2aa6f73", () => {
    const hashed = execFileSync("git", ["hash-object", fixture], { encoding: "utf8" }).trim();
    expect(hashed).toBe(PRECORRECTION_BLOB);
  });

  it("fails DINOSAUR final season, Monday-as-this-morning, and Twilight Tales stated as current", () => {
    const post = JSON.parse(readFileSync(fixture, "utf8"));
    const { findings } = checkDailyPost(post);
    expect(findings.some((f) => f.rule === "b-closed-attraction" && /final season/i.test(f.text) && /DINOSAUR/.test(f.text))).toBe(true);
    expect(findings.some((f) => f.rule === "c-weekday-mismatch" && /this morning/i.test(f.text))).toBe(true);
    expect(findings.some((f) => f.rule === "c-teaser-sameday" && /this morning/i.test(f.text))).toBe(true);
    expect(findings.some((f) => f.rule === "d-debut-tense" && /debuts/i.test(f.text))).toBe(true);
    expect(findings.some((f) => f.rule === "d-debut-tense" && f.path.startsWith("rightNow"))).toBe(true);
    expect(findings.some((f) => f.rule === "d-debut-tense" && f.path.includes("parkioInsight") && /today/i.test(f.text))).toBe(true);
    expect(findings.some((f) => f.rule === "a-fact-ledger" && /debuts/i.test(f.text))).toBe(true);
  });

  it("the corrected Nov 24 issue and the Nov 23 issue pass with no findings", () => {
    expect(checkDailyPost(loadDaily("parkio-daily-2026-11-24.json")).findings).toEqual([]);
    expect(checkDailyPost(loadDaily("parkio-daily-2026-11-23.json")).findings).toEqual([]);
  });
});

describe("rule edges", () => {
  it("lets a replacement mention and a past-tense closure pass", () => {
    const post = {
      date: "2026-11-24",
      title: "t",
      teaser: "Indiana Jones updates.",
      sections: {
        topstories: [
          {
            title: "Indiana Jones ride replacing DINOSAUR",
            body: "DINOSAUR closed in February. The land replacing DinoLand U.S.A. opens in 2027.",
            parkioInsight: { text: "The replacement is still years out." },
          },
        ],
      },
    };
    expect(checkDailyPost(post).findings).toEqual([]);
  });

  it("passes a debut that names a later calendar date, and fails an undated debut whose body is future tense", () => {
    const dated = {
      date: "2026-06-01",
      title: "t",
      teaser: "The new coaster debuts August 7.",
      sections: {
        breaking: [{ title: "The new coaster debuts August 7", body: "It will open August 7 after testing." }],
      },
    };
    const undated = {
      date: "2026-06-01",
      title: "t",
      teaser: "The new coaster debuts.",
      sections: {
        breaking: [{ title: "The new coaster debuts", body: "It will open after testing." }],
      },
    };
    expect(checkDailyPost(dated).findings).toEqual([]);
    const failed = checkDailyPost(undated).findings;
    expect(failed.some((f) => f.rule === "d-debut-tense")).toBe(true);
  });

  it("does not treat a weekday in the claim as an undated debut", () => {
    const post = loadDaily("parkio-daily-2026-05-23.json");
    expect(checkDailyPost(post).findings).toEqual([]);
  });

  it("a bare Twilight Tales mention is not a finding; a stale reviewBy is only a notice", () => {
    const post = {
      date: "2026-11-24",
      title: "t",
      teaser: "Twilight Tales is a nighttime safari.",
      sections: {},
    };
    const facts = [
      {
        id: "ak-twilight-tales",
        subject: "Twilight Tales",
        aliases: [],
        tier: "secondary",
        officialConfirmation: "not-found",
        startDate: "2026-12-20",
        endDate: "2027-01-03",
        reviewBy: "2026-01-01",
        sources: [{ url: "https://wdwnt.com/example", tier: "secondary" }],
      },
    ];
    const result = checkDailyPost(post, { facts, attractions: [] });
    expect(result.findings).toEqual([]);
    expect(result.notices).toHaveLength(1);
  });

  it("'coming Dec 20' agrees with the Twilight Tales window", () => {
    const post = {
      date: "2026-11-24",
      title: "t",
      teaser: "Twilight Tales safari coming Dec 20 at Animal Kingdom.",
      sections: {
        breaking: [
          {
            title: "Twilight Tales safari coming Dec 20 at Animal Kingdom",
            body: "Twilight Tales is coming Dec 20.",
          },
        ],
      },
    };
    expect(checkDailyPost(post).findings).toEqual([]);
  });
});

describe("America/New_York source dates", () => {
  it("11:30 PM ET the day before is not the issue date, including across DST", () => {
    expect(etCalendarDate("2026-11-24T04:30:00.000Z")).toBe("2026-11-23");
    expect(etCalendarDate("2026-11-24T05:00:00.000Z")).toBe("2026-11-24");
    expect(etCalendarDate("2026-07-05T03:30:00.000Z")).toBe("2026-07-04");
    expect(etCalendarDate("2026-07-05T04:00:00.000Z")).toBe("2026-07-05");
    expect(issueWeekday("2026-11-24")).toBe("Tuesday");
    expect(explicitDates("on Monday, November 30", "2026-11-24")).toContain("2026-11-30");
  });

  it("a same-day outage claim fails when the cited pubDate is still the previous ET date", () => {
    const post = {
      date: "2026-11-24",
      title: "t",
      teaser: "Space Mountain is down this morning.",
      sections: {
        breaking: [
          {
            title: "Space Mountain is down this morning",
            body: "The ride stopped after rope drop.",
            source: { label: "Example", url: "https://example.com/space" },
          },
        ],
      },
    };
    const previousEvening = {
      skipped: false,
      items: [
        {
          source: "Example",
          title: "Space Mountain down",
          link: "https://example.com/space",
          pubDate: "2026-11-24T04:30:00.000Z",
          excerpt: "down late Monday",
        },
      ],
    };
    const sameMorning = {
      skipped: false,
      items: [
        {
          source: "Example",
          title: "Space Mountain down",
          link: "https://example.com/space",
          pubDate: "2026-11-24T11:00:00.000Z",
          excerpt: "down after rope drop",
        },
      ],
    };
    const held = checkDailyPost(post, { evidence: previousEvening }).findings;
    expect(held.some((f) => f.rule === "c-source-date" && f.path.endsWith(".title"))).toBe(true);
    const passed = checkDailyPost(post, { evidence: sameMorning }).findings;
    expect(passed.filter((f) => f.rule === "c-source-date")).toEqual([]);
  });

  it("the hand-built Nov 24 evidence flags the Monday outage and a future-tense Twilight Tales excerpt", () => {
    // ITM pubDate is the instant recorded in the Nov 24 scope. This session
    // did not re-fetch that Inside the Magic page. The WDWNT excerpt is the
    // fetched headline ("Coming to"), not a reconstructed article body.
    const post = JSON.parse(
      readFileSync(path.join(REPO, "tests", "fixtures", "parkio-daily-2026-11-24-precorrection.json"), "utf8"),
    );
    const evidence = {
      skipped: false,
      items: [
        {
          source: "Inside the Magic",
          title: "Haunted Mansion and Big Thunder fail to open through midday",
          link: "https://insidethemagic.net/2026/11/as-thanksgiving-crowds-head-to-disney-world-haunted-mansion-and-big-thunder-mountain-railroad-fail-to-open-through-midday-at-magic-kingdom/",
          pubDate: "2026-11-23T20:30:20.000Z",
          excerpt: "The rides failed to open through midday on Monday, November 23, 2026.",
        },
        {
          source: "WDWNT",
          title: "Twilight Tales Coming to Disney's Animal Kingdom",
          link: "https://wdwnt.com/2026/11/new-nighttime-version-of-kilimanjaro-safaris-attraction-called-twilight-tales-coming-to-disneys-animal-kingdom-in-todays-daily-recap-for-11-23-2026/",
          pubDate: "2026-11-24T10:30:00.000Z",
          excerpt: "Twilight Tales is coming to Disney's Animal Kingdom.",
        },
      ],
    };
    expect(etCalendarDate("2026-11-23T20:30:20.000Z")).toBe("2026-11-23");
    const { findings } = checkDailyPost(post, { evidence });
    expect(findings.some((f) => f.rule === "c-source-date" && f.path === "sections.breaking[0].title")).toBe(true);
    expect(findings.some((f) => f.rule === "c-source-date" && f.path === "teaser" && /this morning/i.test(f.text))).toBe(true);
    expect(findings.some((f) => f.rule === "d-debut-tense" && /debuts/i.test(f.text))).toBe(true);
  });

  it("a current-tense debut fails when the feed excerpt is still future tense", () => {
    const post = {
      date: "2026-11-24",
      title: "t",
      teaser: "Quiet day.",
      sections: {
        breaking: [
          {
            title: "The pavilion now open",
            body: "Guests can walk through.",
            source: { url: "https://example.com/pavilion", label: "Example" },
          },
        ],
      },
    };
    const evidence = {
      skipped: false,
      items: [
        {
          source: "Example",
          title: "Pavilion set to open",
          link: "https://example.com/pavilion",
          pubDate: "2026-11-24T12:00:00.000Z",
          excerpt: "The pavilion is set to open next month.",
        },
      ],
    };
    const { findings } = checkDailyPost(post, { evidence });
    expect(findings.some((f) => f.rule === "d-source-date")).toBe(true);
  });
});

describe("feed evidence capture", () => {
  it("parses an RSS pubDate to ISO and keeps an unparsed string as null", () => {
    expect(parsePubDateToIso("Mon, 23 Nov 2026 20:30:20 +0000")).toBe("2026-11-23T20:30:20.000Z");
    expect(parsePubDateToIso("not a date")).toBeNull();
  });

  it("writes title, link, pubDate, and source outside the repo, and does not replace a restored file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "parkio-evidence-"));
    const file = path.join(dir, "parkio-daily-evidence.json");
    const previous = process.env.PARKIO_DAILY_EVIDENCE_PATH;
    process.env.PARKIO_DAILY_EVIDENCE_PATH = file;
    try {
      const payload = buildFeedEvidence(
        [{ title: "Official", link: "https://disneyparksblog.com/a", pubDate: "Mon, 23 Nov 2026 20:30:20 +0000", description: "excerpt" }],
        [{ name: "WDWNT", ok: true, items: [{ title: "Fan", link: "https://wdwnt.com/a", pubDate: "nope", description: "coming soon" }] }],
      );
      writeFeedEvidenceFile(payload);
      const written = JSON.parse(readFileSync(feedEvidencePath(), "utf8"));
      expect(written.items).toEqual([
        {
          source: "Disney Parks Blog",
          title: "Official",
          link: "https://disneyparksblog.com/a",
          pubDate: "2026-11-23T20:30:20.000Z",
          pubDateRaw: "Mon, 23 Nov 2026 20:30:20 +0000",
          excerpt: "excerpt",
        },
        {
          source: "WDWNT",
          title: "Fan",
          link: "https://wdwnt.com/a",
          pubDate: null,
          pubDateRaw: "nope",
          excerpt: "coming soon",
        },
      ]);
      writeSkippedFeedEvidence("existing-file");
      expect(JSON.parse(readFileSync(file, "utf8")).skipped).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.PARKIO_DAILY_EVIDENCE_PATH;
      else process.env.PARKIO_DAILY_EVIDENCE_PATH = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("acknowledgements", () => {
  const findings = [
    { id: "b-closed-attraction:abc", rule: "b-closed-attraction", path: "x", text: "t", evidence: "e" },
    { id: "c-weekday-mismatch:def", rule: "c-weekday-mismatch", path: "y", text: "t", evidence: "e" },
  ];

  it("rejects ack on a normal run and requires every id on a release", () => {
    expect(parseAckList(" a, b\nc ")).toEqual(["a", "b", "c"]);
    expect(evaluateAcknowledgements({ findings, ackIds: ["b-closed-attraction:abc"], releaseRequested: false }).ok).toBe(false);
    const partial = evaluateAcknowledgements({
      findings,
      ackIds: ["b-closed-attraction:abc"],
      releaseRequested: true,
    });
    expect(partial.ok).toBe(false);
    expect(partial.problems.join(" ")).toMatch(/c-weekday-mismatch:def/);
    const typo = evaluateAcknowledgements({
      findings,
      ackIds: ["b-closed-attraction:abc", "c-weekday-mismatch:def", "nope"],
      releaseRequested: true,
    });
    expect(typo.ok).toBe(false);
    const full = evaluateAcknowledgements({
      findings,
      ackIds: ["c-weekday-mismatch:def", "b-closed-attraction:abc"],
      releaseRequested: true,
    });
    expect(full.ok).toBe(true);
  });

  it("refuses to run the CLI without an evidence file", () => {
    const previous = {
      today: process.env.PARKIO_DAILY_TODAY,
      evidence: process.env.PARKIO_DAILY_EVIDENCE_PATH,
      held: process.env.PARKIO_DAILY_HELD_DIR,
      release: process.env.RELEASE_HELD_RUN_ID,
      fixed: process.env.FIXED_REF,
      ack: process.env.ACK,
    };
    const dir = mkdtempSync(path.join(tmpdir(), "parkio-cli-"));
    process.env.PARKIO_DAILY_TODAY = "2026-11-24";
    process.env.PARKIO_DAILY_EVIDENCE_PATH = path.join(dir, "missing.json");
    process.env.PARKIO_DAILY_HELD_DIR = dir;
    delete process.env.RELEASE_HELD_RUN_ID;
    delete process.env.FIXED_REF;
    delete process.env.ACK;
    try {
      expect(runCli()).toBe(1);
      expect(resolveEvidence(null).error).toMatch(/missing/i);
      writeFileSync(process.env.PARKIO_DAILY_EVIDENCE_PATH, JSON.stringify({ version: 1, skipped: true, items: [] }));
      expect(runCli()).toBe(0);
    } finally {
      for (const [key, value] of Object.entries({
        PARKIO_DAILY_TODAY: previous.today,
        PARKIO_DAILY_EVIDENCE_PATH: previous.evidence,
        PARKIO_DAILY_HELD_DIR: previous.held,
        RELEASE_HELD_RUN_ID: previous.release,
        FIXED_REF: previous.fixed,
        ACK: previous.ack,
      })) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("full-history replay", () => {
  it("holds 5 of the archived issues, all on the debut check, and none on a, b, or c", () => {
    const files = readdirSync(DAILY).filter((name) => name.endsWith(".json")).sort();
    expect(files).toHaveLength(198);
    const held: string[] = [];
    for (const name of files) {
      const { findings } = checkDailyPost(loadDaily(name));
      if (!findings.length) continue;
      held.push(name);
      expect(findings.every((f) => f.rule === "d-debut-tense")).toBe(true);
    }
    expect(held).toEqual([...REPLAY_HOLDS]);
  });
});

describe("parkio-daily.yml wires the gate without a skip switch", () => {
  const yaml = readFileSync(path.join(REPO, ".github", "workflows", "parkio-daily.yml"), "utf8");
  const doc = YAML.parse(yaml);
  const steps = doc.jobs.build.steps as Array<{ name?: string; run?: string; if?: string }>;

  it("checks after verify and before social and commit, including the re-offer path", () => {
    const names = steps.map((step) => step.name);
    const verify = names.indexOf("Verify today's briefing was written");
    const fact = names.indexOf("Fact-check today's briefing");
    const social = names.indexOf("Generate social drafts");
    const commit = names.indexOf("Commit the new briefing");
    expect(verify).toBeGreaterThan(-1);
    expect(fact).toBeGreaterThan(verify);
    expect(social).toBeGreaterThan(fact);
    expect(commit).toBeGreaterThan(fact);
    const factStep = steps[fact];
    expect(factStep.run).toBe("node scripts/parkio-daily/factcheck.mjs");
    expect(factStep.if).toBeUndefined();
  });

  it("has no warn mode and no skip input, and publish still requires a push", () => {
    expect(yaml).not.toMatch(/skip_factcheck|FACTCHECK_MODE|warn-only/);
    const inputs = Object.keys(doc.on.workflow_dispatch.inputs);
    expect(inputs).toEqual(["release_held_run_id", "ack", "fixed_ref"]);
    expect(doc.on.schedule).toEqual([{ cron: "0 11 * * *" }]);
    expect(doc.jobs.publish.if).toBe("needs.build.outputs.pushed == 'true'");
    expect(doc.jobs.build.permissions.actions).toBe("write");
    const upload = steps.find((step) => step.name === "Upload held briefing");
    expect(upload?.if).toMatch(/factcheck/);
  });

  it("is not referenced by the publish workflow", () => {
    const publish = readFileSync(path.join(REPO, ".github", "workflows", "parkio-daily-publish.yml"), "utf8");
    expect(publish).not.toMatch(/factcheck/);
  });
});

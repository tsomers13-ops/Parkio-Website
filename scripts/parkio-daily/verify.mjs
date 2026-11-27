#!/usr/bin/env node
/**
 * Parkio Daily — fact-check pass.
 *
 * Runs after build.mjs has written today's briefing and before it is
 * committed (and therefore before it is published and emailed).
 *
 * Two checks:
 *   1. Code check (free, always runs): every "Weekday, Month D" pair in
 *      the issue must match the real calendar. Models get this wrong.
 *   2. Model check (Claude Sonnet 5.5): only the risky claims — dates,
 *      prices, openings, closings, status — plus the teaser and the lead
 *      story are sent. It reads Disney's own pages first (web fetch /
 *      search limited to Disney sites and the five blogs we use), and
 *      ThemeParks.wiki for park hours, schedules and live ride status.
 *      It returns one verdict per claim:
 *        confirmed | reported-only | wrong | unverifiable
 *
 * Code, not the model, decides what happens:
 *   • wrong                      → cut the item
 *   • unverifiable, not hedged   → cut the item
 *   • reported-only, not hedged  → keep, flagged for wording
 *   • HOLD the issue (no commit, no email) when the teaser or the lead is
 *     cut, 3+ items are cut, or the check itself fails.
 *
 * Mode (env PARKIO_FACTCHECK_MODE):
 *   • "shadow"  (default) — report only. The briefing file is not changed
 *                and the step always exits 0, so publishing is unaffected.
 *   • "enforce" — cuts are applied to the file, and a hold exits 1 so the
 *                workflow stops before the commit step.
 *
 * Run locally:
 *   ANTHROPIC_API_KEY=… node scripts/parkio-daily/verify.mjs [path/to/issue.json]
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

/* ──────────────────────────────────────────────────────────────
 * Tunables
 * ────────────────────────────────────────────────────────────── */

const MODEL = "claude-sonnet-5-5";
const MAX_TOKENS = 16000;
const EFFORT = "medium";
const TIMEOUT_MS = 300_000;
const MAX_PAUSE_RESUMES = 4;

const PRICE_INPUT_PER_M = 2.0;
const PRICE_OUTPUT_PER_M = 10.0;
const PRICE_PER_SEARCH = 0.01;

const MCP_BETA = "mcp-client-2025-11-20";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const THEMEPARKS_MCP_URL = "https://api.themeparks.wiki/mcp";

/* Disney's own sites first, then the five blogs the writer reads. */
const OFFICIAL_DOMAINS = [
  "disneyparksblog.com",
  "disney.go.com", // covers disneyworld.disney.go.com, disneyland.disney.go.com
  "thewaltdisneycompany.com",
];
const REPORTED_DOMAINS = [
  "wdwnt.com",
  "allears.net",
  "disneyfoodblog.com",
  "disneytouristblog.com",
  "insidethemagic.net",
];
const ALLOWED_DOMAINS = [...OFFICIAL_DOMAINS, ...REPORTED_DOMAINS];

/* Holds are triggered by this many cuts (or by losing the teaser/lead). */
const HOLD_AT_CUTS = 3;

const SECTIONS = ["breaking", "bignews", "topstories", "icymi", "spotlight"];

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3,
  april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10,
  november: 10, dec: 11, december: 11,
};

/* ──────────────────────────────────────────────────────────────
 * Pure helpers (exported for tests)
 * ────────────────────────────────────────────────────────────── */

/**
 * Flatten the issue into checkable items. The teaser is its own item;
 * the lead is the first breaking item, or the first bignews item when
 * there is no breaking news.
 */
function collectItems(post) {
  const items = [];
  if (typeof post?.teaser === "string" && post.teaser.trim()) {
    items.push({
      id: "teaser",
      section: "teaser",
      index: 0,
      title: "Teaser",
      text: post.teaser,
      source: null,
      isTeaser: true,
      isLead: false,
    });
  }
  let leadAssigned = false;
  for (const section of SECTIONS) {
    const list = post?.sections?.[section];
    if (!Array.isArray(list)) continue;
    list.forEach((item, index) => {
      if (!item || typeof item !== "object") return;
      const isLead =
        !leadAssigned && (section === "breaking" || section === "bignews");
      if (isLead) leadAssigned = true;
      items.push({
        id: `${section}-${index}`,
        section,
        index,
        title: String(item.title ?? ""),
        text: [item.title, item.body, item.parkioInsight?.text]
          .filter((s) => typeof s === "string" && s.trim())
          .join(" — "),
        source:
          item.source && typeof item.source.url === "string"
            ? { label: String(item.source.label ?? ""), url: item.source.url }
            : null,
        isTeaser: false,
        isLead,
      });
    });
  }
  return items;
}

const RISKY_PATTERNS = [
  new RegExp(`\\b(${WEEKDAYS.join("|")})\\b`, "i"),
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i,
  /\b(today|tonight|tomorrow|yesterday|this (morning|week|weekend)|next (week|month))\b/i,
  /\$\s?\d/,
  /\b\d{1,2}(:\d{2})?\s?(a\.?m\.?|p\.?m\.?)\b/i,
  /\b(open(s|ed|ing)?|reopen(s|ed|ing)?|clos(e|es|ed|ing|ure)|debut(s|ed)?|launch(es|ed)?|return(s|ed|ing)?|final|last day|ends?|ending|refurb\w*|extended|delay(ed)?|cancel+ed|sold out|price[sd]?|cost(s)?|ticket(s)?|hours|down|outage|reservation(s)?|available|begins?|starts?)\b/i,
];

/** A claim worth paying to check: dates, prices, status, and the like. */
function isRisky(item) {
  if (item.isTeaser || item.isLead) return true;
  return RISKY_PATTERNS.some((re) => re.test(item.text));
}

/** Words that already present a claim as someone's report, not fact. */
const HEDGE_RE =
  /\b(reports?|reported|reportedly|according to|says|said|per (wdwnt|allears|disney food blog|disney tourist blog|inside the magic)|rumou?r(ed|s)?|expected|planned|could|may|might|appears?|unconfirmed)\b/i;

function isHedged(text) {
  return HEDGE_RE.test(text || "");
}

/**
 * Code check: every "Weekday, Month D" (or "Weekday Month D") must match
 * the calendar. The year is the one nearest the issue date, so a
 * "Friday, January 2" in a late-December issue is read as next year.
 */
function findWeekdayDateMismatches(text, etDate) {
  if (typeof text !== "string" || !text) return [];
  const issue = new Date(`${etDate}T00:00:00Z`);
  const re = new RegExp(
    `\\b(${WEEKDAYS.join("|")}),?\\s+(${Object.keys(MONTHS).join("|")})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`,
    "gi",
  );
  const found = [];
  let m;
  while ((m = re.exec(text))) {
    const weekday = m[1];
    const month = MONTHS[m[2].toLowerCase()];
    const day = Number(m[3]);
    if (month === undefined || day < 1 || day > 31) continue;
    const candidates = [-1, 0, 1].map(
      (dy) => new Date(Date.UTC(issue.getUTCFullYear() + dy, month, day)),
    );
    const nearest = candidates
      .filter((d) => d.getUTCMonth() === month) // drops Feb 30 etc.
      .sort((a, b) => Math.abs(a - issue) - Math.abs(b - issue))[0];
    if (!nearest) continue;
    const actual = WEEKDAYS[nearest.getUTCDay()];
    if (actual.toLowerCase() !== weekday.toLowerCase()) {
      found.push({
        phrase: m[0],
        stated: weekday,
        actual,
        date: nearest.toISOString().slice(0, 10),
      });
    }
  }
  return found;
}

/** Calendar lines, same format the writer sees. */
function calendarLines(etDate, { back = 14, ahead = 30 } = {}) {
  const base = Date.parse(`${etDate}T00:00:00Z`);
  const out = [];
  for (let d = -back; d <= ahead; d++) {
    const day = new Date(base + d * 86_400_000);
    out.push(
      `${day.toISOString().slice(0, 10)} = ${day.toLocaleDateString("en-US", {
        timeZone: "UTC",
        weekday: "long",
        month: "long",
        day: "numeric",
      })}${d === 0 ? "  <- issue date" : ""}`,
    );
  }
  return out.join("\n");
}

function buildCheckPrompt({ etDate, claims, useThemeParks }) {
  const claimText = claims
    .map((c) =>
      [
        `[${c.id}]${c.isTeaser ? " (TEASER)" : ""}${c.isLead ? " (LEAD STORY)" : ""}`,
        c.text,
        c.source ? `Cited source: ${c.source.label} — ${c.source.url}` : "Cited source: none",
      ].join("\n"),
    )
    .join("\n\n");

  return `You are the fact-checker for Parkio Daily, a Disney parks morning newsletter. Today's issue is dated ${etDate} (America/New_York). It has NOT been published yet. Your job is to catch wrong facts before guests read them.

Check every factual claim in each item below: dates, weekdays, times, prices, openings, closings, reopenings, final days, refurbishments, ride or show status, hours, and who said what. Ignore opinion and planning advice ("arrive early", "likely busy") unless it states a fact.

How to check, in this order:
1. Disney's own pages first: the Disney Parks Blog (disneyparksblog.com), Walt Disney World and Disneyland sites (disney.go.com). Fetch the cited source link when it is one of these.
2. ${useThemeParks ? "ThemeParks.wiki tools for park hours, schedules and whether a ride is operating, closed or under refurbishment." : "(ThemeParks.wiki is not available on this run.)"}
3. Only then the community blogs (wdwnt.com, allears.net, disneyfoodblog.com, disneytouristblog.com, insidethemagic.net). A claim only these support is "reported-only", not "confirmed".
Use the calendar below for every weekday/date pair. Never work out a weekday yourself.
Be economical: one or two lookups per claim is enough. Stop when every claim has a verdict.

Verdicts, one per item:
- "confirmed": a Disney page, or ThemeParks.wiki for hours/status, supports every fact in the item.
- "reported-only": only a community blog supports it; nothing you found contradicts it.
- "wrong": a source contradicts a fact in the item (wrong date, weekday, price, status, or an announcement written as if it already happened).
- "unverifiable": you could not find support for a key fact.

CALENDAR:
${calendarLines(etDate)}

ITEMS:
${claimText}

When you are done, reply with ONLY a JSON array, no prose and no code fence, one object per item:
[{"id": "<item id>", "verdict": "confirmed" | "reported-only" | "wrong" | "unverifiable", "problem": "<one sentence on what is wrong or missing, empty if confirmed>", "fix": "<corrected wording if wrong, else empty>", "evidence": ["<url you relied on>", ...]}]`;
}

/** Pull the JSON verdict array out of the model's final text. */
function parseVerdicts(text) {
  if (typeof text !== "string") return null;
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  try {
    const arr = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(arr)) return null;
    const allowed = new Set(["confirmed", "reported-only", "wrong", "unverifiable"]);
    return arr
      .filter((v) => v && typeof v.id === "string" && allowed.has(v.verdict))
      .map((v) => ({
        id: v.id,
        verdict: v.verdict,
        problem: typeof v.problem === "string" ? v.problem : "",
        fix: typeof v.fix === "string" ? v.fix : "",
        evidence: Array.isArray(v.evidence)
          ? v.evidence.filter((u) => typeof u === "string").slice(0, 5)
          : [],
      }));
  } catch {
    return null;
  }
}

/**
 * Decide what happens to each item. Pure: no I/O.
 *   items       — from collectItems()
 *   verdicts    — from parseVerdicts(), or null when the model check failed
 *   dateIssues  — { [itemId]: mismatch[] } from the code check
 *   checkedIds  — ids that were sent to the model
 */
function decide({ items, verdicts, dateIssues = {}, checkedIds = [], checkerError = null }) {
  const byId = new Map((verdicts ?? []).map((v) => [v.id, v]));
  const results = [];
  for (const item of items) {
    const dates = dateIssues[item.id] ?? [];
    const v = byId.get(item.id);
    let action = "keep";
    let reason = "";
    if (dates.length) {
      action = "cut";
      reason = dates
        .map((d) => `"${d.phrase}" — ${d.date} is a ${d.actual}`)
        .join("; ");
    } else if (v?.verdict === "wrong") {
      action = "cut";
      reason = v.problem || "contradicted by a source";
    } else if (v?.verdict === "unverifiable") {
      if (isHedged(item.text)) {
        action = "flag";
        reason = `unverified but worded as a report: ${v.problem || ""}`.trim();
      } else {
        action = "cut";
        reason = v.problem || "no source supports it";
      }
    } else if (v?.verdict === "reported-only" && !isHedged(item.text)) {
      action = "flag";
      reason = "only a fan blog supports it; wording should say so";
    } else if (checkedIds.includes(item.id) && !v && verdicts) {
      action = "flag";
      reason = "checker returned no verdict for this item";
    }
    results.push({
      id: item.id,
      section: item.section,
      index: item.index,
      title: item.title,
      isTeaser: item.isTeaser,
      isLead: item.isLead,
      verdict: dates.length ? "wrong" : v?.verdict ?? (checkedIds.includes(item.id) ? "no-verdict" : "not-checked"),
      action,
      reason,
      fix: v?.fix ?? "",
      evidence: v?.evidence ?? [],
    });
  }

  const cuts = results.filter((r) => r.action === "cut");
  const holdReasons = [];
  if (checkerError) holdReasons.push(`the fact-check could not run: ${checkerError}`);
  if (cuts.some((r) => r.isTeaser)) holdReasons.push("the teaser failed the check");
  if (cuts.some((r) => r.isLead)) holdReasons.push("the lead story failed the check");
  if (cuts.length >= HOLD_AT_CUTS) holdReasons.push(`${cuts.length} items failed the check`);

  return { results, cuts, hold: holdReasons.length > 0, holdReasons };
}

/** Remove cut items from a copy of the post. The teaser is never cut here (a cut teaser holds the issue). */
function applyCuts(post, decision) {
  const next = JSON.parse(JSON.stringify(post));
  const drop = new Map();
  for (const r of decision.cuts) {
    if (r.section === "teaser") continue;
    if (!drop.has(r.section)) drop.set(r.section, new Set());
    drop.get(r.section).add(r.index);
  }
  for (const [section, idxs] of drop) {
    if (!Array.isArray(next.sections?.[section])) continue;
    next.sections[section] = next.sections[section].filter((_, i) => !idxs.has(i));
  }
  return next;
}

function renderReport({ etDate, mode, decision, usage, costUsd, useThemeParks, skipped }) {
  const lines = [];
  lines.push(`## Parkio Daily fact-check — ${etDate} (${mode} mode)`);
  lines.push("");
  if (skipped) {
    lines.push(skipped);
    return lines.join("\n");
  }
  const { results, cuts, hold, holdReasons } = decision;
  const flags = results.filter((r) => r.action === "flag");
  const verb = mode === "enforce" ? "" : "would ";
  if (hold) {
    lines.push(`**Hold:** this issue ${verb}not publish — ${holdReasons.join("; ")}.`);
  } else if (cuts.length) {
    lines.push(`**Publish with ${cuts.length} cut${cuts.length === 1 ? "" : "s"}** (${verb}remove the items below).`);
  } else {
    lines.push("**Publish as written.** Nothing failed the check.");
  }
  lines.push("");
  lines.push("| Item | Verdict | Action | Why |");
  lines.push("| --- | --- | --- | --- |");
  for (const r of results) {
    if (r.verdict === "not-checked") continue;
    const why = [r.reason, r.fix ? `Fix: ${r.fix}` : "", r.evidence[0] ? `Evidence: ${r.evidence[0]}` : ""]
      .filter(Boolean)
      .join(" ")
      .replace(/\|/g, "\\|");
    lines.push(`| ${r.id}: ${r.title.replace(/\|/g, "\\|").slice(0, 60)} | ${r.verdict} | ${r.action} | ${why} |`);
  }
  const notChecked = results.filter((r) => r.verdict === "not-checked").length;
  lines.push("");
  lines.push(
    `${notChecked} low-risk item(s) skipped (no dates, prices or status). ` +
      `${flags.length} flagged for wording. ThemeParks.wiki: ${useThemeParks ? "on" : "off"}.`,
  );
  if (usage) {
    lines.push(
      `Checker usage: ${usage.input_tokens ?? 0} in / ${usage.output_tokens ?? 0} out tokens, ` +
        `${usage.server_tool_use?.web_search_requests ?? 0} searches, ` +
        `${usage.server_tool_use?.web_fetch_requests ?? 0} fetches ≈ $${costUsd.toFixed(4)}.`,
    );
  }
  return lines.join("\n");
}

/* ──────────────────────────────────────────────────────────────
 * Claude call (web search + web fetch + ThemeParks.wiki MCP)
 * ────────────────────────────────────────────────────────────── */

function checkerRequest({ prompt, useThemeParks }) {
  const tools = [
    {
      type: "web_fetch_20260209",
      name: "web_fetch",
      allowed_domains: ALLOWED_DOMAINS,
      max_uses: 15,
    },
    {
      type: "web_search_20260209",
      name: "web_search",
      allowed_domains: ALLOWED_DOMAINS,
      max_uses: 8,
    },
  ];
  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    output_config: { effort: EFFORT },
    fallbacks: "default",
    tools,
    messages: [{ role: "user", content: prompt }],
  };
  const betas = [FALLBACK_BETA];
  if (useThemeParks) {
    body.mcp_servers = [{ type: "url", url: THEMEPARKS_MCP_URL, name: "themeparks" }];
    tools.push({ type: "mcp_toolset", mcp_server_name: "themeparks" });
    betas.push(MCP_BETA);
  }
  return { body, betas };
}

async function postMessages(body, betas) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-beta": betas.join(","),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return json;
}

function addUsage(total, u) {
  if (!u) return total;
  total.input_tokens += u.input_tokens ?? 0;
  total.output_tokens += u.output_tokens ?? 0;
  total.server_tool_use.web_search_requests += u.server_tool_use?.web_search_requests ?? 0;
  total.server_tool_use.web_fetch_requests += u.server_tool_use?.web_fetch_requests ?? 0;
  return total;
}

/** Run the check, resuming on pause_turn. Returns { text, usage }. */
async function runChecker({ prompt, useThemeParks }) {
  const { body, betas } = checkerRequest({ prompt, useThemeParks });
  const usage = {
    input_tokens: 0,
    output_tokens: 0,
    server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
  };
  let response = await postMessages(body, betas);
  addUsage(usage, response.usage);
  for (let i = 0; response.stop_reason === "pause_turn" && i < MAX_PAUSE_RESUMES; i++) {
    // Re-send with the paused assistant turn appended; the server resumes it.
    body.messages = [
      body.messages[0],
      { role: "assistant", content: response.content },
    ];
    response = await postMessages(body, betas);
    addUsage(usage, response.usage);
  }
  if (response.stop_reason === "refusal") {
    throw new Error("the checker model declined the request");
  }
  const texts = (response.content ?? []).filter((b) => b?.type === "text");
  return { text: texts.length ? texts[texts.length - 1].text : "", usage };
}

/* ──────────────────────────────────────────────────────────────
 * Entry point
 * ────────────────────────────────────────────────────────────── */

function todaysPath() {
  const etDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return {
    etDate,
    file: path.join("content", "guide", "daily", `parkio-daily-${etDate}.json`),
  };
}

function isTrackedByGit(file) {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", file], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function writeSummary(markdown) {
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + "\n");
  }
}

async function main() {
  const mode = process.env.PARKIO_FACTCHECK_MODE === "enforce" ? "enforce" : "shadow";
  const useThemeParks = process.env.PARKIO_FACTCHECK_THEMEPARKS !== "off";
  const today = todaysPath();
  const file = process.argv[2] || today.file;

  if (!existsSync(file)) {
    console.error(`[factcheck] ${file} not found — nothing to check.`);
    process.exit(mode === "enforce" ? 1 : 0);
  }
  const post = JSON.parse(readFileSync(file, "utf8"));
  const etDate = typeof post.date === "string" ? post.date : today.etDate;

  // An issue already committed (a re-run offering yesterday's build to
  // publish) has been through this step once; don't pay to check it again.
  if (!process.argv[2] && isTrackedByGit(file)) {
    writeSummary(renderReport({ etDate, mode, skipped: `${file} is already committed — skipped.` }));
    return;
  }
  if (post.meta?.fallbackReason) {
    writeSummary(renderReport({ etDate, mode, skipped: `Fallback issue (${post.meta.fallbackReason}) — nothing to check.` }));
    return;
  }

  const items = collectItems(post);
  const dateIssues = {};
  for (const item of items) {
    const found = findWeekdayDateMismatches(item.text, etDate);
    if (found.length) dateIssues[item.id] = found;
  }
  const claims = items.filter(isRisky);
  const checkedIds = claims.map((c) => c.id);

  let verdicts = null;
  let checkerError = null;
  let usage = null;
  let costUsd = 0;
  let themeParksUsed = useThemeParks;

  if (!process.env.ANTHROPIC_API_KEY) {
    checkerError = "ANTHROPIC_API_KEY is not set";
  } else if (claims.length) {
    try {
      let out;
      try {
        out = await runChecker({ prompt: buildCheckPrompt({ etDate, claims, useThemeParks }), useThemeParks });
      } catch (err) {
        // If ThemeParks.wiki is down or refused, check without it rather than fail.
        if (useThemeParks && err.status && err.status >= 400 && err.status < 500) {
          console.warn(`[factcheck] ThemeParks.wiki request failed (${err.message}); retrying without it.`);
          themeParksUsed = false;
          out = await runChecker({ prompt: buildCheckPrompt({ etDate, claims, useThemeParks: false }), useThemeParks: false });
        } else {
          throw err;
        }
      }
      usage = out.usage;
      costUsd =
        (usage.input_tokens * PRICE_INPUT_PER_M + usage.output_tokens * PRICE_OUTPUT_PER_M) / 1_000_000 +
        usage.server_tool_use.web_search_requests * PRICE_PER_SEARCH;
      verdicts = parseVerdicts(out.text);
      if (!verdicts) checkerError = "the checker's answer was not valid JSON";
    } catch (err) {
      checkerError = String(err?.message || err).slice(0, 200);
    }
  } else {
    verdicts = [];
  }

  const decision = decide({ items, verdicts, dateIssues, checkedIds, checkerError });
  writeSummary(renderReport({ etDate, mode, decision, usage, costUsd, useThemeParks: themeParksUsed }));

  if (mode === "shadow") {
    console.log("[factcheck] Shadow mode — briefing left unchanged; publishing continues.");
    return;
  }
  if (decision.hold) {
    console.error(`::error::Parkio Daily held by fact-check: ${decision.holdReasons.join("; ")}`);
    process.exit(1);
  }
  if (decision.cuts.length) {
    const next = applyCuts(post, decision);
    next.meta = Object.assign({}, next.meta, {
      factcheck: {
        mode,
        cut: decision.cuts.map((r) => ({ id: r.id, title: r.title, reason: r.reason })),
        checkedAt: new Date().toISOString(),
      },
    });
    writeFileSync(file, JSON.stringify(next, null, 2) + "\n", "utf8");
    console.log(`[factcheck] Removed ${decision.cuts.length} item(s) from ${file}.`);
  }
}

export {
  collectItems,
  isRisky,
  isHedged,
  findWeekdayDateMismatches,
  calendarLines,
  buildCheckPrompt,
  parseVerdicts,
  decide,
  applyCuts,
  renderReport,
  checkerRequest,
  ALLOWED_DOMAINS,
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  main().catch((err) => {
    console.error("[factcheck] FATAL:", err?.stack || err?.message || err);
    // Never block publishing from shadow mode.
    process.exit(process.env.PARKIO_FACTCHECK_MODE === "enforce" ? 1 : 0);
  });
}

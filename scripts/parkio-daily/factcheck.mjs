#!/usr/bin/env node
/**
 * Parkio Daily fact-check.
 *
 * Runs in the build job of parkio-daily.yml, on the workflow's checkout of
 * main, after today's JSON exists and before social drafts and commit.
 * It does not run in parkio-daily-publish.yml. That workflow loads tooling
 * from the candidate commit, which can be older than the rule fix.
 *
 * Every check blocks. There is no warn mode and no skip switch. A later
 * run the same day that produces a clean briefing is allowed to commit
 * and publish (Tom, Nov 25, 2026: a later passing run can auto-publish).
 *
 * Acknowledgements are per finding id, and only when this run was started
 * with release_held_run_id or fixed_ref. The actor is logged.
 *
 * Historical issues have no saved feed, so checkDailyPost() without
 * `evidence` applies the JSON-only backstop (b, c2, d's tense contradiction,
 * and the facts ledger). Source-date rules run only when a build captured
 * feed evidence.
 */

import { createHash } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { augmentEvidence, fetchCitedPage } from "./pageDate.mjs";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const MONTHS = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sept: 9, sep: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

const OPERATING =
  /\b(final season|last (?:ride|chance|year)|one last|before (?:it|the \w+) (?:closes|goes)|still (?:open|operating|running)|running its|closing soon|remains? open|still operating|remains? operational|operational)\b/i;
const WAIT_TIME = /\b\d+\s*(?:min|mins|minutes)\b|\bwalk-?on\b/i;
const SAME_DAY =
  /\b(this morning|today|tonight|right now|this afternoon|this evening|currently)\b/i;
const STATUS_VERB =
  /\b(down|closed|fail(?:ed|s)? to open|not operating|outage|reopen(?:s|ed|ing)?|delay(?:ed)?|evacuat\w*|broke down|breakdown)\b/i;
// Source-date (c) is narrower than the JSON weekday backstop: a concrete
// same-day status claim, not a tip that merely says "today" or "currently".
const C_SOURCE_SAME_DAY = /\b(this morning|today)\b/i;
const C_SOURCE_STATUS =
  /\b(down|closed|fail(?:ed|s)? to open|(?:re-?)?open(?:s|ed|ing)?)\b/i;
// Source-date (d) is an opening or closing claim about a named attraction,
// venue, or show. The adjective "new" is not enough.
const OPEN_CLOSE_CLAIM =
  /\b(debuts?|debuted|now open|now meeting|opens(?:\s+today)?|opened(?:\s+today)?|re-?opens?(?:\s+today)?|re-?opened(?:\s+today)?|premieres?|premiered|final season|last chance|last ride|closing soon)\b/i;
const DEBUT_NOW =
  /\b(debuts?|debuted|now open|opens today|now meeting|premieres?|launch(?:es|ing)? today|new [\w'’-]+(?:\s+[\w'’-]+){0,6}\s+(?:today|version))\b/i;
const FUTURE =
  /\b(is coming|coming to|coming soon|will (?:open|debut|launch|arrive|offer|begin)|set to (?:open|debut)|later this|upcoming)\b/i;
const FUTURE_CUE = /\b(coming|will\b|set to|later this|upcoming|next (?:year|month|week))\b/i;
const CURRENT_DEBUT =
  /\b(debuts?|debuted|now open|opens today|now meeting|premieres?|is open|is here|has opened|opened today|launches today|launching today|now running|already open)\b/i;
const LOOSE_DATED =
  /\b(ahead of|date set|this (?:week|weekend|fall|winter|season)|20\d{2})\b/i;
const NOUN_STOP = new Set([
  "Magic Kingdom",
  "Animal Kingdom",
  "Hollywood Studios",
  "Walt Disney World",
  "Disney World",
  "Disneyland",
  "Disney",
  "EPCOT",
  "Epcot",
]);

export function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

export function etToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Calendar date in America/New_York for an absolute instant. */
export function etCalendarDate(instant) {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Weekday name for a YYYY-MM-DD issue date. Noon UTC stays on that date in ET. */
export function issueWeekday(isoDate) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
  }).format(new Date(`${isoDate}T12:00:00Z`));
}

export function explicitDates(text, issueDate) {
  const re =
    /\b(January|February|March|April|May|June|July|August|September|Sept|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(20\d{2}))?/gi;
  const [iy, im, iday] = issueDate.split("-").map(Number);
  const issueUtc = Date.UTC(iy, im - 1, iday);
  const out = [];
  for (const m of String(text || "").matchAll(re)) {
    const month = MONTHS[m[1].toLowerCase()];
    const day = Number(m[2]);
    if (!month || day < 1 || day > 31) continue;
    let year;
    if (m[3]) {
      year = Number(m[3]);
    } else {
      const sameYear = Date.UTC(iy, month - 1, day);
      year = sameYear < issueUtc - 1000 * 60 * 60 * 24 * 180 ? iy + 1 : iy;
    }
    out.push(padIso(year, month, day));
  }
  return out;
}

function padIso(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function sentences(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return [];
  // Keep "U.S.A." from splitting "DinoLand U.S.A. remains open" into two sentences.
  const masked = t.replace(/\b([A-Z])\./g, "$1\u0000");
  return masked
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/\u0000/g, ".").trim())
    .filter(Boolean);
}

export function parseAckList(raw) {
  if (raw == null || String(raw).trim() === "") return [];
  return [...new Set(String(raw).split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];
}

export function normalizeUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    u.hash = "";
    u.search = "";
    let s = u.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s.toLowerCase();
  } catch {
    return raw.replace(/\/+$/, "").toLowerCase();
  }
}

function findingId(rule, where, text) {
  const norm = String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
  const h = createHash("sha256").update(`${rule}\n${where}\n${norm}`).digest("hex").slice(0, 12);
  return `${rule}:${h}`;
}

function pushFinding(findings, { rule, where, text, evidence, findingClass }) {
  const sliced = String(text || "").replace(/\s+/g, " ").trim().slice(0, 300);
  const id = findingId(rule, where, sliced);
  if (findings.some((f) => f.id === id)) return;
  findings.push({
    id,
    rule,
    class: findingClass || (rule === "unverifiable" ? "unverifiable" : "contradiction"),
    path: where,
    text: sliced,
    evidence,
  });
}

function pageFetchFor(evidence, url) {
  const needle = normalizeUrl(url);
  if (!needle) return null;
  return (evidence?.pageFetches || []).find((row) => normalizeUrl(row.url) === needle) || null;
}

/**
 * A failed page fetch is unverifiable, never a contradiction.
 * A dated feed or page item that does not support the claim stays a contradiction.
 * No URL at all stays a contradiction (there was nothing to fetch).
 */
function gapClass(evidence, urls, datedItems) {
  if ((datedItems || []).some((item) => item?.pubDate)) return "contradiction";
  const fetches = (urls || []).map((url) => pageFetchFor(evidence, url)).filter(Boolean);
  if (fetches.length && fetches.every((row) => !row.ok)) return "unverifiable";
  return "contradiction";
}

function pushGap(findings, { rule, where, text, evidenceText, evidenceBag, urls, datedItems }) {
  const kind = gapClass(evidenceBag, urls, datedItems);
  if (kind === "unverifiable") {
    const failed = (urls || []).map((url) => pageFetchFor(evidenceBag, url)).find((row) => row && !row.ok);
    pushFinding(findings, {
      rule: "unverifiable",
      where,
      text,
      evidence: `Source fetch failed (${failed?.reason || "unknown"}${failed?.status ? ` HTTP ${failed.status}` : ""}) for ${failed?.url || "the cited URL"}. This is not a contradiction.`,
    });
    return;
  }
  pushFinding(findings, { rule, where, text, evidence: evidenceText });
}

function compileMatchers(attractions) {
  return attractions.map((a) => {
    const match = (a.match || []).map((source) => {
      try {
        // Case-insensitive so "Dinosaur" and "DINOSAUR" are the same ride.
        return new RegExp(source, "i");
      } catch (err) {
        throw new Error(`attraction ${a.id} has an invalid match /${source}/: ${err.message}`);
      }
    });
    if (match.length === 0) throw new Error(`attraction ${a.id} has no match patterns`);
    return { ...a, compiled: match };
  });
}

export function loadAttractionStatus(root = repoRoot()) {
  const file = path.join(root, "data", "parkio-daily", "attraction-status.json");
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (!data || !Array.isArray(data.attractions)) {
    throw new Error(`${file} is missing attractions[]`);
  }
  for (const a of data.attractions) {
    for (const key of ["id", "name", "status", "effectiveDate"]) {
      if (!a[key]) throw new Error(`${file} entry is missing ${key}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.effectiveDate)) {
      throw new Error(`${file} ${a.id} effectiveDate must be YYYY-MM-DD`);
    }
    if (!a.source?.url || !a.source?.publishedAt || !a.source?.tier) {
      throw new Error(`${file} ${a.id} source needs url, publishedAt, and tier`);
    }
  }
  return compileMatchers(data.attractions);
}

export function loadFactcheckConfig(root = repoRoot()) {
  const file = path.join(root, "data", "parkio-daily", "factcheck-config.json");
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (data?.unverifiable !== "hold" && data?.unverifiable !== "pass") {
    throw new Error(`${file} unverifiable must be "hold" or "pass"`);
  }
  return data;
}

/** Unverifiable findings block only when config says hold. They are never contradictions. */
export function blockingFindings(findings, config = { unverifiable: "hold" }) {
  if (config?.unverifiable === "pass") {
    return findings.filter((finding) => finding.class !== "unverifiable" && finding.rule !== "unverifiable");
  }
  return findings;
}

export function loadFacts(root = repoRoot()) {
  const file = path.join(root, "data", "parkio-daily", "facts.json");
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (!data || !Array.isArray(data.facts)) throw new Error(`${file} is missing facts[]`);
  for (const fact of data.facts) {
    for (const key of ["id", "subject", "tier"]) {
      if (!fact[key]) throw new Error(`${file} entry is missing ${key}`);
    }
    if (!Array.isArray(fact.sources) || !fact.sources[0]?.url) {
      throw new Error(`${file} ${fact.id} needs at least one source url`);
    }
    if (!fact.startDate && !fact.endDate && !fact.status) {
      throw new Error(`${file} ${fact.id} needs a startDate, endDate, or status`);
    }
  }
  return data.facts;
}

function collect(post) {
  const fields = [];
  const items = [];
  fields.push({ where: "title", text: post.title || "", kind: "title" });
  fields.push({ where: "teaser", text: post.teaser || "", kind: "teaser" });
  (post.rightNow?.rides || []).forEach((ride, i) => {
    if (ride?.note) {
      fields.push({
        where: `rightNow.rides[${i}].note`,
        text: String(ride.note),
        kind: "rightNow",
        rideName: ride.name || "",
      });
    }
  });
  const sections = post.sections || {};
  for (const [sec, value] of Object.entries(sections)) {
    const list = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
    list.forEach((it, i) => {
      if (!it || typeof it !== "object") return;
      const where = `sections.${sec}[${i}]`;
      items.push({ where, it });
      for (const key of ["title", "body"]) {
        if (it[key]) {
          fields.push({ where: `${where}.${key}`, text: String(it[key]), kind: key, itemWhere: where });
        }
      }
      if (it.parkioInsight?.text) {
        fields.push({
          where: `${where}.parkioInsight.text`,
          text: String(it.parkioInsight.text),
          kind: "insight",
          itemWhere: where,
        });
      }
    });
  }
  (post.videos || []).forEach((video, i) => {
    if (video?.title) fields.push({ where: `videos[${i}].title`, text: String(video.title), kind: "video" });
    if (video?.summary) fields.push({ where: `videos[${i}].summary`, text: String(video.summary), kind: "video" });
  });
  return { fields, items };
}

function mentionsAttraction(sentence, attraction) {
  return attraction.compiled.some((re) => {
    re.lastIndex = 0;
    return re.test(sentence);
  });
}

function isOperatingClaim(sentence) {
  return OPERATING.test(sentence) || WAIT_TIME.test(sentence);
}

/**
 * "ride replacing DINOSAUR" and "DINOSAUR closed in February" are not
 * operating claims. "final season" / "still open" / "closing soon" are
 * never excused by a nearby "replacing".
 */
function isPastOrReplacement(sentence) {
  if (/\b(final season|still (?:open|operating|running)|closing soon|remains? open|remains? operational|operational)\b/i.test(sentence)) {
    return false;
  }
  return /\b(replac\w+|former|closed in|permanently closed)\b/i.test(sentence) || /\bold DinoLand\b/i.test(sentence);
}

function factNames(fact) {
  return [fact.subject, ...(fact.aliases || [])].filter(Boolean);
}

function mentionsFact(sentence, fact) {
  return factNames(fact).some((name) => {
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return re.test(sentence);
  });
}

function inFactWindow(iso, fact) {
  if (!iso) return false;
  if (fact.startDate && fact.endDate) return iso >= fact.startDate && iso <= fact.endDate;
  if (fact.startDate) return iso === fact.startDate;
  if (fact.endDate) return iso === fact.endDate;
  return false;
}

function hasFutureCue(sentence) {
  return FUTURE_CUE.test(sentence);
}

function isCurrentDebutClaim(sentence, kind, issueDate) {
  if (CURRENT_DEBUT.test(sentence) && !hasExplicitFutureDate(sentence, issueDate)) return true;
  if ((kind === "teaser" || kind === "rightNow") && /\bnew\b/i.test(sentence) && !hasFutureCue(sentence)) {
    if (explicitDates(sentence, issueDate).some((d) => d > issueDate)) return false;
    return true;
  }
  return false;
}

function hasExplicitFutureDate(sentence, issueDate) {
  if (!issueDate) return false;
  return explicitDates(sentence, issueDate).some((d) => d > issueDate);
}

function linkNouns(title) {
  const found = String(title || "").match(
    /\b[A-Z][a-z]+(?:\s+(?:of|the|and|&)\s+[A-Z][a-z]+|\s+[A-Z][a-z]+)+\b/g,
  ) || [];
  return found.filter((n) => !NOUN_STOP.has(n));
}

const GENERIC_NAME_TOKENS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "into", "over",
  "new", "park", "parks", "disney", "world", "kingdom", "mountain",
  "railroad", "ride", "rides", "show", "today", "open", "opens", "opened",
  "reopens", "reopened", "attraction", "attractions", "resort", "resorts",
]);

/** Distinctive name tokens. Drops "Mountain", "The", and park-name words so they cannot match alone. */
export function significantNameTokens(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !GENERIC_NAME_TOKENS.has(token));
}

/**
 * "Big Thunder" matches "Big Thunder Mountain Railroad" because both
 * distinctive tokens of the shorter name appear in the longer text.
 * A single leftover token ("Mountain", "Magic Kingdom") does not match.
 */
export function partialNameMatch(needle, haystack) {
  const left = significantNameTokens(needle);
  if (left.length < 2) return false;
  const right = new Set(significantNameTokens(haystack));
  return left.every((token) => right.has(token));
}

function claimMatchesTarget(claimText, extraName, targetText) {
  const candidates = linkNouns(claimText);
  const claimTokens = significantNameTokens(claimText);
  if (claimTokens.length >= 2 && claimTokens.length <= 3) candidates.push(claimText);
  if (extraName) candidates.push(extraName);
  return candidates.some((candidate) => partialNameMatch(candidate, targetText));
}

function evidenceMatchingName(evidence, claimText, extraName) {
  return (evidence?.items || []).filter((item) =>
    claimMatchesTarget(claimText, extraName, `${item.title || ""} ${item.link || ""}`),
  );
}

function otherWeekdayCues(text, issueDate) {
  const issueDay = issueWeekday(issueDate);
  const hits = [];
  for (const day of WEEKDAYS) {
    if (day === issueDay) continue;
    const re = new RegExp(
      `\\b(?:(?:midday|on|since|early|late|last) ${day}|${day}(?:'s)? (?:morning|afternoon|evening|night))\\b`,
      "gi",
    );
    let bad = false;
    for (const m of String(text || "").matchAll(re)) {
      const window = text.slice(Math.max(0, m.index - 24), m.index + m[0].length + 48);
      if (new RegExp(`\\b(?:through|until|thru|next)\\s+${day}\\b`, "i").test(window)) continue;
      const dates = explicitDates(window, issueDate);
      const futureNamed = dates.some((d) => d > issueDate && issueWeekday(d) === day);
      if (!futureNamed) bad = true;
    }
    if (bad) hits.push(day);
  }
  return hits;
}

function datedLoose(text, issueDate) {
  if (LOOSE_DATED.test(text)) return true;
  if (issueDate && explicitDates(text, issueDate).some((d) => d > issueDate)) return true;
  if (new RegExp(`\\b(${WEEKDAYS.join("|")})\\b`, "i").test(text)) return true;
  return false;
}

function namesWeekday(text) {
  return new RegExp(`\\b(${WEEKDAYS.join("|")})\\b`, "i").test(text || "");
}

/**
 * Undated "it's here" wording. A weekday or an explicit later date keeps
 * the claim ("debuts Monday", "debuts August 7", "premieres this week").
 * Bare "debuts" / "now meeting" / "now open" does not.
 */
function claimStatesCurrent(text, issueDate) {
  if (!DEBUT_NOW.test(text || "")) return false;
  if (namesWeekday(text)) return false;
  if (LOOSE_DATED.test(text || "")) return false;
  if (issueDate && explicitDates(text, issueDate).some((d) => d > issueDate)) return false;
  return true;
}

function isFutureHedged(text, issueDate) {
  if (/\b(soon|coming|will\b|set to|later|upcoming|next)\b/i.test(text || "")) return true;
  if (/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(text || "")) return true;
  if (namesWeekday(text)) return true;
  if (LOOSE_DATED.test(text || "")) return true;
  if (issueDate && explicitDates(text, issueDate).some((d) => d > issueDate)) return true;
  return false;
}

/**
 * d-source-date only. Requires an opening/closing verb and a multi-word
 * name (an attraction, venue, or show). "new highs" and "new props" do not.
 */
function isSourceDateOpeningClaim(text, issueDate) {
  const raw = text || "";
  if (!OPEN_CLOSE_CLAIM.test(raw)) return false;
  if (/\bopens\s+at\s+\d/i.test(raw) && !/\b(debuts?|now open|re-?opens?|opened|re-?opened)\b/i.test(raw)) {
    return false;
  }
  // "the Early Entry window opens" is a tip, not a venue opening.
  if (/\b(?:window|opportunity|opportunities)\s+opens\b/i.test(raw) || /\bopens\s+strong\b/i.test(raw)) {
    return false;
  }
  // A snack, treat, or piece of merch "debuts" is not the venue opening.
  if (
    /\b(debuts?|debuted)\b/i.test(raw) &&
    /\b(sundae|cookie|snack|treats?|merch(?:andise)?|menu|flavor|ornament|purse|costume|sweater|cardigan|popcorn|mug|pin|accessory|accessories)\b/i.test(raw) &&
    !/\b(now open|opens today|re-?opens?(?:\s+today)?)\b/i.test(raw)
  ) {
    return false;
  }
  if (isFutureHedged(raw, issueDate)) return false;
  return linkNouns(raw).length > 0;
}

function fieldChunks(field) {
  if (field.kind === "teaser" || field.kind === "rightNow") {
    return String(field.text || "").split(/[;]\s*/).map((s) => s.trim()).filter(Boolean);
  }
  return sentences(field.text);
}

function checkClosedAttractions(post, attractions, findings) {
  const issue = post.date;
  const { fields } = collect(post);
  for (const attraction of attractions) {
    if (!issue || issue < attraction.effectiveDate) continue;
    for (const field of fields) {
      for (const sentence of sentences(field.text)) {
        if (!mentionsAttraction(sentence, attraction)) continue;
        if (!isOperatingClaim(sentence)) continue;
        if (isPastOrReplacement(sentence)) continue;
        pushFinding(findings, {
          rule: "b-closed-attraction",
          where: field.where,
          text: sentence,
          evidence: `${attraction.name} (${attraction.id}) status ${attraction.status} effective ${attraction.effectiveDate}, last operating day ${attraction.lastOperatingDay || "unconfirmed"}. Source ${attraction.source.label} ${attraction.source.url} published ${attraction.source.publishedAt} (${attraction.source.tier}).`,
        });
      }
    }
  }
}

function checkFactLedger(post, facts, findings, notices) {
  const issue = post.date;
  if (!issue) return;
  const { fields } = collect(post);
  for (const fact of facts) {
    if (fact.reviewBy && issue > fact.reviewBy) {
      notices.push(
        `Ledger ${fact.id} (${fact.subject}) is past reviewBy ${fact.reviewBy}. This does not block by itself. Refresh the entry.`,
      );
    }
    for (const field of fields) {
      for (const sentence of fieldChunks(field)) {
        if (!mentionsFact(sentence, fact)) continue;
        const dates = explicitDates(sentence, issue);
        const timing = /\b(coming|debut\w*|opens?|opening|premieres?|launches?|begins?|starts?|through|until|ends?|runs?|from)\b/i.test(sentence);
        if (dates.length && timing && (fact.startDate || fact.endDate)) {
          if (dates.every((d) => !inFactWindow(d, fact))) {
            pushFinding(findings, {
              rule: "a-fact-ledger",
              where: field.where,
              text: sentence,
              evidence: `${fact.subject} ledger window ${fact.startDate || "?"}–${fact.endDate || "?"} (${fact.tier}, official confirmation ${fact.officialConfirmation || "unconfirmed"}). Cited dates ${dates.join(", ")} fall outside that window. ${fact.notes || ""}`.trim(),
            });
            continue;
          }
        }
        const current = isCurrentDebutClaim(sentence, field.kind, issue);
        const coveredByWindow = dates.some((d) => inFactWindow(d, fact));
        if (current && !coveredByWindow && fact.startDate && issue < fact.startDate) {
          pushFinding(findings, {
            rule: "a-fact-ledger",
            where: field.where,
            text: sentence,
            evidence: `${fact.subject} startDate ${fact.startDate} is after this issue (${issue}). The sentence states it as current. Tier ${fact.tier}; official confirmation ${fact.officialConfirmation || "unconfirmed"}. ${fact.notes || ""}`.trim(),
          });
        } else if (current && !coveredByWindow && fact.endDate && issue > fact.endDate) {
          pushFinding(findings, {
            rule: "a-fact-ledger",
            where: field.where,
            text: sentence,
            evidence: `${fact.subject} endDate ${fact.endDate} is before this issue (${issue}). Tier ${fact.tier}.`,
          });
        } else if (current && !fact.startDate && !fact.endDate && /^(coming|scheduled|announced)$/.test(fact.status || "")) {
          pushFinding(findings, {
            rule: "a-fact-ledger",
            where: field.where,
            text: sentence,
            evidence: `${fact.subject} is recorded as ${fact.status} with no confirmed date (${fact.tier}; official confirmation ${fact.officialConfirmation || "unconfirmed"}). The sentence states it as current. ${fact.notes || ""}`.trim(),
          });
        }
      }
    }
  }
}

function checkWeekdayBackstop(post, findings) {
  const issue = post.date;
  if (!issue) return;
  const { items } = collect(post);
  for (const { where, it } of items) {
    const title = it.title || "";
    const others = otherWeekdayCues(it.body || "", issue);
    if (others.length && SAME_DAY.test(title) && STATUS_VERB.test(title)) {
      pushFinding(findings, {
        rule: "c-weekday-mismatch",
        where: `${where}.title`,
        text: title,
        evidence: `Title uses same-day status wording, but the body dates it to ${others.join(", ")}. This issue is ${issueWeekday(issue)} ${issue}.`,
      });
    }
  }
  const teaser = post.teaser || "";
  for (const clause of teaser.split(/[;]\s*/)) {
    if (!SAME_DAY.test(clause) || !STATUS_VERB.test(clause)) continue;
    for (const { it } of items) {
      const others = otherWeekdayCues(it.body || "", issue);
      if (!others.length) continue;
      if (!claimMatchesTarget(clause, "", it.title || "")) continue;
      const hit = [it.title];
      pushFinding(findings, {
        rule: "c-teaser-sameday",
        where: "teaser",
        text: clause,
        evidence: `Teaser clause uses same-day status wording and shares ${hit.join(", ")} with an item whose body dates it to ${others.join(", ")}. This issue is ${issueWeekday(issue)} ${issue}.`,
      });
    }
  }
}

function evidenceModeOf(evidence) {
  if (!evidence || evidence.skipped) return "json-only";
  return "full";
}

function evidenceForUrl(evidence, url) {
  const needle = normalizeUrl(url);
  if (!needle) return [];
  return (evidence.items || []).filter((item) => normalizeUrl(item.link) === needle);
}

function sameDaySource(item, issue) {
  if (!item?.pubDate) return false;
  return etCalendarDate(item.pubDate) === issue;
}

function checkSourceDates(post, evidence, findings) {
  if (evidenceModeOf(evidence) !== "full") return;
  const issue = post.date;
  const { items } = collect(post);
  const consider = [];
  consider.push({ where: "title", text: post.title || "", sources: [] });
  consider.push({ where: "teaser", text: post.teaser || "", sources: [], teaser: true });
  for (const { where, it } of items) {
    const sources = evidenceForUrl(evidence, it.source?.url);
    if (it.title) consider.push({ where: `${where}.title`, text: it.title, sources, item: it });
    if (it.body) consider.push({ where: `${where}.body`, text: it.body, sources, item: it });
  }
  for (const field of consider) {
    const chunks = field.teaser ? String(field.text || "").split(/[;]\s*/) : sentences(field.text);
    for (const sentence of chunks) {
      if (!C_SOURCE_SAME_DAY.test(sentence) || !C_SOURCE_STATUS.test(sentence)) continue;
      // A post title or teaser with no named attraction/venue is a tip
      // ("plan for today"), not a status claim. An item's own title or
      // body is already about that item.
      if ((field.teaser || field.where === "title") && linkNouns(sentence).length === 0) continue;
      let sources = field.sources || [];
      if (field.teaser || field.where === "title") {
        sources = [];
        for (const { it } of items) {
          if (!claimMatchesTarget(sentence, "", it.title || "")) continue;
          sources.push(...evidenceForUrl(evidence, it.source?.url));
        }
        sources.push(...evidenceMatchingName(evidence, sentence, ""));
      }
      const ok = sources.some((item) => sameDaySource(item, issue));
      if (ok) continue;
      const cited = field.teaser || field.where === "title"
        ? items.filter((row) => claimMatchesTarget(sentence, "", row.it.title || "")).map((row) => row.it.source?.url).filter(Boolean)
        : [field.item?.source?.url].filter(Boolean);
      const seen = sources
        .map((item) => `${item.source || "source"} ${item.pubDate || item.pubDateRaw || "undated"} → ET ${etCalendarDate(item.pubDate) || "unparsed"}${item.dateMethod ? ` via ${item.dateMethod}` : ""}`)
        .join("; ");
      pushGap(findings, {
        rule: "c-source-date",
        where: field.where,
        text: sentence,
        evidenceBag: evidence,
        urls: cited,
        datedItems: sources,
        evidenceText: seen
          ? `Same-day status wording needs a cited source whose published date falls on ${issue} in America/New_York. Cited items: ${seen}.`
          : `Same-day status wording has no cited source with a published date.`,
      });
    }
  }
}

function checkDebuts(post, facts, evidence, findings) {
  const issue = post.date;
  const { fields, items } = collect(post);
  const full = evidenceModeOf(evidence) === "full";

  for (const { where, it } of items) {
    const body = it.body || "";
    const future = FUTURE.test(body);
    if (future) {
      if (claimStatesCurrent(it.title || "", issue)) {
        pushFinding(findings, {
          rule: "d-debut-tense",
          where: `${where}.title`,
          text: it.title,
          evidence: "Title states this as current, and the same item's body is future tense.",
        });
      }
      const insight = it.parkioInsight?.text || "";
      if (/\btoday\b/i.test(insight) && /\bnew\b/i.test(insight)) {
        pushFinding(findings, {
          rule: "d-debut-tense",
          where: `${where}.parkioInsight.text`,
          text: insight,
          evidence: "Insight says \"new\" and \"today\" while the item body is future tense.",
        });
      }
      for (const field of fields) {
        if (field.kind !== "teaser" && field.kind !== "rightNow") continue;
        for (const clause of String(field.text || "").split(/[;]\s*/)) {
          if (!claimMatchesTarget(clause, field.rideName || "", it.title || "")) continue;
          const bareNew = /\bnew\b/i.test(clause) && !datedLoose(clause, issue) && !explicitDates(clause, issue).some((d) => d > issue);
          if (claimStatesCurrent(clause, issue) || bareNew) {
            pushFinding(findings, {
              rule: "d-debut-tense",
              where: field.where,
              text: clause,
              evidence: `This ${field.kind} states a current opening while ${where}.body is future tense.`,
            });
          }
        }
      }
    }

    if (!full) continue;
    const currentBits = [];
    if (isSourceDateOpeningClaim(it.title || "", issue)) currentBits.push({ where: `${where}.title`, text: it.title });
    const feedNamed = evidenceMatchingName(evidence, it.title || "", "");
    const linked = [
      ...evidenceForUrl(evidence, it.source?.url),
      ...(!it.source?.url ? feedNamed : []),
    ];
    for (const bit of currentBits) {
      const supports = linked.some((item) => sourceSupportsCurrent(item, issue));
      const ledgerBlock = facts.some((fact) => mentionsFact(bit.text, fact) && fact.startDate && issue < fact.startDate);
      if (supports && !ledgerBlock) continue;
      const why = linked.length
        ? linked.map((item) => `${item.source || ""} ${item.pubDate || "undated"} “${(item.excerpt || item.title || "").slice(0, 120)}”${item.dateMethod ? ` via ${item.dateMethod}` : ""}`).join(" | ")
        : "no evidence item matches the cited URL";
      if (ledgerBlock) {
        pushFinding(findings, {
          rule: "d-source-date",
          where: bit.where,
          text: bit.text,
          evidence: `Ledger startDate is after ${issue}, so a current-tense debut is blocked even if a feed item exists. ${why}`,
        });
        continue;
      }
      if (where.startsWith("sections.spotlight") && !it.source?.url && feedNamed.length === 0) {
        pushFinding(findings, {
          rule: "unverifiable",
          where: bit.where,
          text: bit.text,
          evidence: "Spotlight opening or closing claim has no source URL and no feed title matched it. This is not a contradiction.",
        });
        continue;
      }
      pushGap(findings, {
        rule: "d-source-date",
        where: bit.where,
        text: bit.text,
        evidenceBag: evidence,
        urls: [it.source?.url].filter(Boolean),
        datedItems: linked,
        evidenceText: `A current-tense opening or closing needs a source published on or before ${issue} whose excerpt is not future tense ("coming", "will open", "set to"). ${why}`,
      });
    }
  }

  // Ledger gate for teaser / rightNow / any field that names the subject and
  // states it as current. Runs with or without feed evidence.
  for (const field of fields) {
    for (const sentence of fieldChunks(field)) {
      if (explicitDates(sentence, issue).some((d) => d > issue) && !CURRENT_DEBUT.test(sentence)) continue;
      for (const fact of facts) {
        if (!(fact.startDate && issue < fact.startDate)) continue;
        if (!mentionsFact(sentence, fact)) continue;
        if (!isCurrentDebutClaim(sentence, field.kind, issue)) continue;
        if (explicitDates(sentence, issue).some((d) => inFactWindow(d, fact))) continue;
        pushFinding(findings, {
          rule: "d-debut-tense",
          where: field.where,
          text: sentence,
          evidence: `Ledger ${fact.id} startDate ${fact.startDate} is after ${issue} (${fact.tier}; official confirmation ${fact.officialConfirmation || "unconfirmed"}).`,
        });
      }
    }
  }

  if (!full) return;
  for (const field of fields) {
    if (field.kind !== "teaser" && field.kind !== "rightNow") continue;
    for (const clause of String(field.text || "").split(/[;]\s*/)) {
      if (!isSourceDateOpeningClaim(clause, issue)) continue;
      let linked = [];
      const matchedUrls = [];
      for (const { it } of items) {
        if (!claimMatchesTarget(clause, field.rideName || "", it.title || "")) continue;
        if (it.source?.url) {
          matchedUrls.push(it.source.url);
          linked.push(...evidenceForUrl(evidence, it.source.url));
        }
      }
      linked.push(...evidenceMatchingName(evidence, clause, field.rideName || ""));
      const supports = linked.some((item) => sourceSupportsCurrent(item, issue));
      if (supports) continue;
      // The JSON-only rule already records the contradiction. Avoid a second
      // finding when there was simply no URL overlap and d-debut-tense fired.
      if (findings.some((f) => f.rule === "d-debut-tense" && f.path === field.where && f.text === clause.trim())) {
        continue;
      }
      pushGap(findings, {
        rule: "d-source-date",
        where: field.where,
        text: clause,
        evidenceBag: evidence,
        urls: matchedUrls,
        datedItems: linked,
        evidenceText: linked.length
          ? `Feed or page date does not support this opening or closing claim for ${issue}.`
          : "No dated source for this opening or closing claim was in the run evidence.",
      });
    }
  }
}

function sourceSupportsCurrent(item, issue) {
  if (!item?.pubDate) return false;
  const day = etCalendarDate(item.pubDate);
  if (!day || day > issue) return false;
  const blob = `${item.title || ""} ${item.excerpt || ""}`;
  if (FUTURE.test(blob)) return false;
  return true;
}

/**
 * @param {object} post Daily JSON
 * @param {{ attractions?: object[], facts?: object[], evidence?: object|null }} [opts]
 *   evidence omitted or `{ skipped: true }` → JSON-only backstop.
 *   evidence `{ items: [...] }` → also source-date checks.
 */
export function checkDailyPost(post, opts = {}) {
  const attractions = opts.attractions || loadAttractionStatus();
  const facts = opts.facts || loadFacts();
  const findings = [];
  const notices = [];
  checkClosedAttractions(post, attractions, findings);
  checkFactLedger(post, facts, findings, notices);
  checkWeekdayBackstop(post, findings);
  checkSourceDates(post, opts.evidence, findings);
  checkDebuts(post, facts, opts.evidence, findings);
  return { findings, notices };
}

/**
 * Ack is honored only for a release or fixed-ref run. Every current finding
 * id must be listed, and unknown ids fail (a typo must not look like a pass).
 */
export function evaluateAcknowledgements({ findings, ackIds, releaseRequested }) {
  const problems = [];
  if (!releaseRequested) {
    if (ackIds.length) {
      problems.push("ack is only accepted with release_held_run_id or fixed_ref. There is no skip switch.");
    }
    return { ok: findings.length === 0 && problems.length === 0, problems, acknowledged: [] };
  }
  const known = new Set(findings.map((f) => f.id));
  const missing = findings.filter((f) => !ackIds.includes(f.id)).map((f) => f.id);
  const unknown = ackIds.filter((id) => !known.has(id));
  if (missing.length) {
    problems.push(`These finding ids were not acknowledged: ${missing.join(", ")}`);
  }
  if (unknown.length) {
    problems.push(`These ack ids are not findings on this run: ${unknown.join(", ")}`);
  }
  if (findings.length === 0 && ackIds.length) {
    problems.push("ack listed ids but this run has no findings to acknowledge.");
  }
  return {
    ok: problems.length === 0,
    problems,
    acknowledged: findings.filter((f) => ackIds.includes(f.id)).map((f) => f.id),
  };
}

export function resolveEvidence(raw) {
  if (raw == null) {
    return { error: "Feed evidence file is missing. Refusing to publish without source dates." };
  }
  if (raw.skipped) return { mode: "json-only", evidence: raw };
  if (!Array.isArray(raw.items)) {
    return { error: "Feed evidence file has no items array." };
  }
  return { mode: "full", evidence: raw };
}

export function heldDir() {
  if (process.env.PARKIO_DAILY_HELD_DIR) return process.env.PARKIO_DAILY_HELD_DIR;
  return path.join(process.env.RUNNER_TEMP || tmpdir(), "parkio-daily-held");
}

export function evidenceFilePath() {
  if (process.env.PARKIO_DAILY_EVIDENCE_PATH) return process.env.PARKIO_DAILY_EVIDENCE_PATH;
  return path.join(process.env.RUNNER_TEMP || tmpdir(), "parkio-daily-evidence.json");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function writeSummary(lines) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  appendFileSync(file, lines.join("\n") + "\n");
}

function howToRelease(findings) {
  const ids = findings.map((f) => f.id).join(",");
  return [
    "This briefing was held. Nothing was committed and publish did not run.",
    "There is no skip switch. Pick one:",
    "",
    "1. Regenerate. Actions → Parkio Daily → Run workflow, leave the inputs blank.",
    "   A later run that passes can commit and publish on its own.",
    "",
    "2. Release these exact bytes. Run workflow with:",
    "   release_held_run_id = this run's id",
    `   ack = ${ids || "(no findings — do not use ack)"}`,
    "   Every id is required. github.actor is recorded on the commit.",
    "",
    "3. Publish a correction. Edit only content/guide/daily/<today>.json on a branch",
    "   named daily-fix/<slug>, then Run workflow with fixed_ref=daily-fix/<slug>.",
    "   Ack any finding ids that remain. Committing the JSON to main yourself",
    "   does not publish: the publish job only accepts the daily bot author.",
    "",
    "Findings:",
    ...findings.map((f) => `- ${f.id} [${f.rule}] ${f.path}: ${f.text}`),
    "",
  ].join("\n");
}

export async function runCli(opts = {}) {
  const today = process.env.PARKIO_DAILY_TODAY || etToday();
  const slug = `parkio-daily-${today}`;
  const file = path.join(repoRoot(), "content", "guide", "daily", `${slug}.json`);
  if (!existsSync(file)) {
    console.error(`::error::Expected ${file} was not produced.`);
    return 1;
  }
  const bytes = readFileSync(file);
  let post;
  try {
    post = JSON.parse(bytes.toString("utf8"));
  } catch (err) {
    console.error(`::error::${file} is not valid JSON (${err.message}).`);
    return 1;
  }
  if (post.date !== today || post.slug !== slug) {
    console.error(`::error::${file} date/slug (${post.date} / ${post.slug}) is not today in America/New_York (${today}). Refusing to check a different day.`);
    return 1;
  }

  const evidencePath = evidenceFilePath();
  let rawEvidence = null;
  if (!existsSync(evidencePath)) {
    console.error(`::error::${resolveEvidence(null).error} Looked for ${evidencePath}.`);
    return 1;
  }
  try {
    rawEvidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  } catch (err) {
    console.error(`::error::Could not parse feed evidence ${evidencePath} (${err.message}).`);
    return 1;
  }
  const resolved = resolveEvidence(rawEvidence);
  if (resolved.error) {
    console.error(`::error::${resolved.error}`);
    return 1;
  }

  const config = opts.config || loadFactcheckConfig();
  let evidence = resolved.evidence;
  let pageFetches = [];
  if (resolved.mode === "full") {
    const augmented = await augmentEvidence(post, evidence, {
      fetchPage: opts.fetchPage === null ? undefined : (opts.fetchPage || fetchCitedPage),
    });
    evidence = augmented.evidence;
    pageFetches = augmented.fetches;
  }

  const { findings, notices } = checkDailyPost(post, { evidence });
  const blocking = blockingFindings(findings, config);
  const releaseRequested = Boolean(
    String(process.env.RELEASE_HELD_RUN_ID || "").trim() || String(process.env.FIXED_REF || "").trim(),
  );
  const ackIds = parseAckList(process.env.ACK);
  const decision = evaluateAcknowledgements({ findings: blocking, ackIds, releaseRequested });
  const contradictions = findings.filter((finding) => finding.class !== "unverifiable");
  const unverifiable = findings.filter((finding) => finding.class === "unverifiable");

  const report = {
    version: 1,
    slug,
    date: today,
    sha256: sha256(bytes),
    evidence: resolved.mode,
    unverifiablePolicy: config.unverifiable,
    contradictions,
    unverifiable,
    pageFetches,
    findings,
    notices,
    releaseRequested,
    acknowledged: decision.acknowledged,
    actor: process.env.GITHUB_ACTOR || "",
  };

  const lines = [
    `# Parkio Daily fact-check (${today})`,
    "",
    `Evidence mode: ${resolved.mode}. Contradictions: ${contradictions.length}. Unverifiable: ${unverifiable.length} (${config.unverifiable}; not contradictions).`,
  ];
  if (notices.length) {
    lines.push("", "## Notices (not blocking)", ...notices.map((n) => `- ${n}`));
  }
  const table = (rows) => {
    lines.push("", "| id | rule | path | text |", "| --- | --- | --- | --- |");
    for (const f of rows) lines.push(`| \`${f.id}\` | ${f.rule} | ${f.path} | ${f.text.replace(/\|/g, "\\|")} |`);
  };
  if (contradictions.length) {
    lines.push("", "## Contradictions");
    table(contradictions);
  }
  if (unverifiable.length) {
    lines.push("", `## Unverifiable (policy: ${config.unverifiable})`);
    table(unverifiable);
  }
  if (!findings.length) lines.push("", "Passed. No findings.");
  writeSummary(lines);

  for (const notice of notices) console.log(`[parkio-daily] notice: ${notice}`);
  for (const f of contradictions) {
    console.log(`::error title=${f.id}::[${f.rule}] ${f.path}: ${f.text}`);
    console.log(`[parkio-daily] ${f.id} evidence: ${f.evidence}`);
  }
  for (const f of unverifiable) {
    const line = `[unverifiable] ${f.path}: ${f.text}`;
    if (config.unverifiable === "hold") console.log(`::error title=${f.id}::${line}`);
    else console.log(`[parkio-daily] ${line}`);
    console.log(`[parkio-daily] ${f.id} evidence: ${f.evidence}`);
  }

  if (!decision.ok) {
    const dir = heldDir();
    mkdirSync(dir, { recursive: true });
    copyFileSync(file, path.join(dir, "briefing.json"));
    writeFileSync(path.join(dir, "report.json"), JSON.stringify(report, null, 2) + "\n");
    copyFileSync(evidencePath, path.join(dir, "evidence.json"));
    writeFileSync(path.join(dir, "HOW-TO-RELEASE.txt"), howToRelease(blocking));
    console.error(`[parkio-daily] Held ${slug}. ${blocking.length} blocking finding(s) (${contradictions.length} contradictions, ${unverifiable.length} unverifiable). Bundle: ${dir}`);
    for (const problem of decision.problems) console.error(`::error::${problem}`);
    return 1;
  }

  if (releaseRequested) {
    const actor = process.env.GITHUB_ACTOR || "unknown";
    const note = [
      `Fact-check acknowledgements by ${actor}.`,
      ...(decision.acknowledged.length
        ? decision.acknowledged.map((id) => `- ${id}`)
        : ["No findings on the released briefing."]),
    ].join("\n");
    const notePath = path.join(process.env.RUNNER_TEMP || tmpdir(), "parkio-daily-release-note.txt");
    writeFileSync(notePath, note + "\n");
    console.log(`[parkio-daily] Release acknowledged by ${actor}: ${decision.acknowledged.join(", ") || "(no findings)"}`);
  }
  console.log(`[parkio-daily] Fact-check passed for ${slug} (${resolved.mode}, ${findings.length} finding(s)).`);
  return 0;
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  Promise.resolve()
    .then(() => runCli())
    .then((code) => {
      process.exit(code);
    })
    .catch((err) => {
      console.error(`::error::${err?.stack || err?.message || err}`);
      process.exit(1);
    });
}

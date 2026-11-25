/**
 * When a cited URL is missing from the saved feed evidence, fetch that
 * page and read a published date. This runs inside the fact-check step
 * of the build job, after build.mjs has written the briefing, because
 * the cited URLs do not exist until that JSON exists.
 *
 * Tests inject fetchPage. The default fetcher is not used on import.
 */

export const PAGE_FETCH_LIMIT = 24;
export const PAGE_FETCH_TIMEOUT_MS = 10_000;

/** Same agent string build.mjs uses. A desktop browser UA did not clear the 403s. */
export const PAGE_FETCH_USER_AGENT =
  "Mozilla/5.0 (compatible; ParkioBot/1.0; +https://parkio.info)";

function attr(tag, name) {
  const match = String(tag).match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, "i"),
  );
  if (!match) return null;
  return (match[1] ?? match[2] ?? match[3] ?? "").trim();
}

function metaPublishedTime(html) {
  const tags = String(html).match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const property = (attr(tag, "property") || "").toLowerCase();
    if (property !== "article:published_time") continue;
    const content = attr(tag, "content");
    if (content) return content;
  }
  return null;
}

function walkDatePublished(node) {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = walkDatePublished(item);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  if (typeof node.datePublished === "string" && node.datePublished.trim()) {
    return node.datePublished.trim();
  }
  if (node["@graph"]) {
    const hit = walkDatePublished(node["@graph"]);
    if (hit) return hit;
  }
  return null;
}

function jsonLdPublished(html) {
  const scripts = String(html).match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const type = (attr(script, "type") || "").toLowerCase();
    if (type !== "application/ld+json") continue;
    const body = script.replace(/^[\s\S]*?>/, "").replace(/<\/script>\s*$/i, "");
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      continue;
    }
    const hit = walkDatePublished(data);
    if (hit) return hit;
  }
  return null;
}

function timePublished(html) {
  const tags = String(html).match(/<time\b[^>]*>/gi) || [];
  const ranked = [];
  for (const tag of tags) {
    const datetime = attr(tag, "datetime");
    if (!datetime) continue;
    const itemprop = (attr(tag, "itemprop") || "").toLowerCase();
    const className = (attr(tag, "class") || "").toLowerCase();
    let score = 1;
    if (itemprop === "datepublished") score = 3;
    else if (itemprop.includes("publish") || className.includes("publish")) score = 2;
    ranked.push({ datetime, score, index: ranked.length });
  }
  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked[0]?.datetime || null;
}

function etCalendarDate(instant) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function rawPublishedToEt(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { etDate: value, pubDate: `${value}T17:00:00.000Z` };
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  const etDate = etCalendarDate(new Date(ms));
  if (!etDate) return null;
  return { etDate, pubDate: new Date(ms).toISOString() };
}

/**
 * First hit wins: article:published_time, then JSON-LD datePublished
 * (including @graph), then <time datetime>, preferring a published mark.
 */
export function extractPublishedDate(html) {
  const candidates = [
    ["article:published_time", metaPublishedTime(html)],
    ["json-ld:datePublished", jsonLdPublished(html)],
    ["time:datetime", timePublished(html)],
  ];
  for (const [method, raw] of candidates) {
    if (!raw) continue;
    const parsed = rawPublishedToEt(raw);
    if (!parsed) continue;
    return { method, raw, etDate: parsed.etDate, pubDate: parsed.pubDate };
  }
  return null;
}

function normalizeUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    parsed.search = "";
    let text = parsed.toString();
    if (text.endsWith("/")) text = text.slice(0, -1);
    return text.toLowerCase();
  } catch {
    return raw.replace(/\/+$/, "").toLowerCase();
  }
}

export function citedUrls(post) {
  const found = [];
  for (const value of Object.values(post?.sections || {})) {
    const list = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
    for (const item of list) {
      if (item?.source?.url) found.push(item.source.url);
    }
  }
  const seen = new Set();
  const unique = [];
  for (const url of found) {
    const key = normalizeUrl(url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(url);
  }
  return unique;
}

function alreadyInFeed(evidence, url) {
  const needle = normalizeUrl(url);
  return (evidence?.items || []).some((item) => normalizeUrl(item.link) === needle && item.pubDate);
}

function classifyFailure(result) {
  if (result?.reason === "timeout" || result?.reason === "network" || result?.reason === "fetch-cap") {
    return result.reason;
  }
  const status = result?.status ?? null;
  if (status === 403) return "403";
  if (typeof status === "number" && status >= 400 && status < 500) return "4xx";
  if (typeof status === "number" && status >= 500) return "5xx";
  if (result?.reason) return result.reason;
  return "network";
}

/**
 * Fetch cited URLs that the feed evidence does not already date.
 * Successful dates are appended as evidence items. Failures are recorded
 * and never turned into a dated contradiction by themselves.
 */
export async function augmentEvidence(post, evidence, options = {}) {
  const fetchPage = options.fetchPage;
  const limit = options.limit ?? PAGE_FETCH_LIMIT;
  const timeoutMs = options.timeoutMs ?? PAGE_FETCH_TIMEOUT_MS;
  const base = {
    ...(evidence || {}),
    version: evidence?.version || 1,
    skipped: Boolean(evidence?.skipped),
    items: Array.isArray(evidence?.items) ? [...evidence.items] : [],
  };
  const fetches = [];
  if (!fetchPage || base.skipped) {
    base.pageFetches = fetches;
    return { evidence: base, fetches };
  }
  const missing = citedUrls(post).filter((url) => !alreadyInFeed(base, url));
  let used = 0;
  for (const url of missing) {
    if (used >= limit) {
      fetches.push({ url, ok: false, reason: "fetch-cap", status: null });
      continue;
    }
    used += 1;
    let result;
    try {
      result = await fetchPage(url, { timeoutMs });
    } catch (err) {
      const message = String(err?.message || err);
      const reason = err?.name === "TimeoutError" || err?.name === "AbortError" || /timeout/i.test(message)
        ? "timeout"
        : "network";
      fetches.push({ url, ok: false, reason, status: null, error: message });
      continue;
    }
    if (!result || result.ok === false) {
      fetches.push({
        url,
        ok: false,
        reason: classifyFailure(result || {}),
        status: result?.status ?? null,
      });
      continue;
    }
    const extracted = extractPublishedDate(result.html || "");
    if (!extracted) {
      fetches.push({ url, ok: false, reason: "no-date", status: result.status ?? 200 });
      continue;
    }
    fetches.push({
      url,
      ok: true,
      reason: null,
      status: result.status ?? 200,
      method: extracted.method,
      raw: extracted.raw,
      etDate: extracted.etDate,
    });
    base.items.push({
      source: "cited-page",
      title: "",
      link: url,
      pubDate: extracted.pubDate,
      pubDateRaw: extracted.raw,
      excerpt: "",
      dateMethod: extracted.method,
      dateEt: extracted.etDate,
    });
  }
  base.pageFetches = fetches;
  return { evidence: base, fetches };
}

export async function fetchCitedPage(url, { timeoutMs = PAGE_FETCH_TIMEOUT_MS, userAgent = PAGE_FETCH_USER_AGENT } = {}) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const html = await response.text();
    if (!response.ok) return { ok: false, status: response.status, html };
    return { ok: true, status: response.status, html };
  } catch (err) {
    const message = String(err?.message || err);
    const reason = err?.name === "TimeoutError" || err?.name === "AbortError" || /timeout/i.test(message)
      ? "timeout"
      : "network";
    return { ok: false, status: null, reason, error: message };
  }
}

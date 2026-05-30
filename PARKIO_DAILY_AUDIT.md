# Parkio Daily — News Pipeline Root-Cause Audit

_Audit date: 2026-05-29. Scope: the live pipeline only (`.github/workflows/parkio-daily.yml` → `scripts/parkio-daily/build.mjs`). The old n8n workflow is retired and was not audited as a live system. No redesign — findings map to small, surgical fixes in the existing script._

---

## Executive summary

Parkio Daily is failing for **two independent reasons**, both confirmed with live data:

1. **The build has not produced a new briefing since May 11.** In this repo the automated bot (`parkio-daily-bot`) has committed exactly **one** file ever — `2026-05-11`. Every earlier daily file was committed by `tsomers13-ops` (the old n8n path). That means the GitHub Action ran once on migration day and has produced nothing for the 18 days since. Whatever the email service sends now is stale or empty.

2. **When it does run, Claude only sees ~15% of the available news — and almost none of it from the biggest sources.** Each community feed is truncated to the first **8,000 characters** of raw RSS XML before being handed to Claude. Because these are full-content WordPress feeds (50–700 KB each), 8,000 characters is consumed by the channel header plus roughly **one** article. Claude literally never sees stories #2 onward from WDWNT, Inside the Magic, or the Disney Food Blog — which is exactly where the ride closures, menu changes, and hotel announcements live.

The newsletter still "works" because YouTube is the only fully-wired source (it reliably returns 10 videos). So the product has become video-heavy and news-light: ~5 written story slots/day, trending down, with the headline news systematically cut.

**Fix #1 (re-enable the build) and Fix #2 (stop truncating feeds) together should take written coverage from ~5 thin stories/day to a full 10–13 well-grounded stories/day that actually include the major announcements.** Adding more blogs is a distant third priority — the six you already have are being wasted.

---

## Root-cause analysis (ranked)

### ROOT CAUSE #1 — The daily build stopped running on May 11 (CRITICAL)

`git log` for `content/guide/daily/` shows:

```
f33f985 parkio-daily-bot 2026-05-11 Parkio Daily — 2026-05-11      ← only bot commit
1e37ade tsomers13-ops    2026-05-10 Daily: 2026-05-10 briefing     ← old n8n / manual
8eb76f0 tsomers13-ops    2026-05-09 Daily: 2026-05-09 briefing
... (all prior days committed by tsomers13-ops)
```

The new GitHub Action committed `2026-05-11` and then nothing. Today is 2026-05-29 — **18 days with no new briefing file**. The most likely causes, in order:

- **The scheduled cron isn't firing.** GitHub silently disables `schedule:` triggers in some conditions and they can be flaky right after a workflow is first added. The Action ran once via the migration (possibly a manual `workflow_dispatch`) and the daily cron never caught.
- **The run is failing on a schema violation.** `buildPost()` (build.mjs lines ~676–718) is designed to **throw and fail the run loudly** on any schema problem — an unexpected `parkSlug`, a video missing a field, a teaser over 220 chars. A throw exits non-zero, so **no file is committed**. One bad Claude response per day would silently halt production while the website keeps showing the last good file (May 11), creating the illusion that it's "still publishing."
- Expired `ANTHROPIC_API_KEY` / `YOUTUBE_API_KEY` would *not* explain this — those route to the fallback path, which still writes a (no-news) file. We see no files at all, so it's the cron or the throw, not the keys.

> **Verify first:** open the repo's **Actions tab → "Parkio Daily"**. The run history will show immediately whether it's (a) not triggering, or (b) triggering and failing — and the failing step's log will name the exact error. _Caveat: this audit is on a local copy of the repo; if live `main` actually has bot commits after May 11, this finding is moot and the problem is purely Root Cause #2._

### ROOT CAUSE #2 — 8,000-character feed truncation discards 85% of the news (CRITICAL)

`build.mjs` line 246:

```js
xml: xml.slice(0, 8_000),   // per additional source
```

and line 142 for the Parks Blog:

```js
rssText: stringSlice(parksBlogRss, 25_000),
```

These feeds embed the **entire article HTML** in `<content:encoded>`, so each `<item>` is thousands of characters. I fetched all six feeds live, with the script's actual `ParkioBot` User-Agent, and measured how many *complete* articles survive the cap:

| Source | Feed size | Items in feed | Complete items Claude sees | Cap |
|---|---|---|---|---|
| Disney Parks Blog | 720 KB | 10 | **1** | 25,000 |
| WDWNT | 126 KB | 15 | **1** | 8,000 |
| AllEars.Net | 18 KB | 10 | 3 | 8,000 |
| Disney Food Blog | 185 KB | 10 | **0** | 8,000 |
| Disney Tourist Blog | 11 KB | 6 | 4 | 8,000 |
| Inside the Magic | 163 KB | 10 | **0** | 8,000 |

Claude receives roughly **9 of ~61 recent articles (~15%)** — and **0 from the Disney Food Blog and Inside the Magic, 1 from WDWNT**, i.e. nearly nothing from the three highest-velocity breaking-news outlets. The Parks Blog's 720 KB feed yields a single complete item even at the larger 25 KB cap.

This is the mechanism behind the user-reported symptom. The news exists in the feed; the script throws it away before Claude ever sees it. (All feeds returned HTTP 200 — **the custom bot User-Agent is _not_ being blocked**, so that common suspicion is ruled out.)

### CONTRIBUTING FACTOR #3 — The prompt actively pushes for fewer stories

Even on the ~15% it sees, the prompt tells Claude to prune hard:

- Guardrail #5: _"PREFER FEWER, HIGHER-QUALITY STORIES… better to ship 4 strong items than 10… If you can only ground 3 stories, ship 3."_
- Guardrail #3: _"If you cannot ground a claim, drop the item."_
- Guardrail #4: a no-news fallback if data looks "weak."
- Section caps total only ~10–13 slots (breaking 0–2, bignews 1–3, topstories 2–4, icymi 1–3, spotlight 1).

With starved input, a "quality over volume, drop what you can't ground" instruction is correctly interpreted as "ship very little." This compounds #2 — it's not the primary cause, but it guarantees the symptom even on days the feeds partially get through. The 14-day history confirms it: 82 written story-slots over 16 days = **5.1/day**, trending down to 1–3 on several days.

### NON-ISSUES (ruled out)

- **Bot blocking / 403s:** none — all six feeds returned 200 with the ParkioBot UA.
- **Date filters too aggressive:** there are no RSS date filters at all; raw XML is passed through. (YouTube uses a sensible 48h/7d window.)
- **Deduplication dropping stories:** YouTube dedupe (lines 337–382) is correct; the prompt's "combine duplicates" is appropriate. No over-dedup.
- **No-news fallback firing:** zero fallback/no-news days in the last 16 — Claude *is* writing real stories, just too few.

---

## Stage-by-stage findings

### Stage 1 — News sources (what's actually wired)

| Type | Source | URL | Status | Treatment |
|---|---|---|---|---|
| RSS | Disney Parks Blog | `disneyparksblog.com/feed/` | 200, active | sliced to 25 KB → ~1 article |
| RSS | WDWNT | `wdwnt.com/feed/` | 200, active | sliced to 8 KB → ~1 article |
| RSS | AllEars.Net | `allears.net/feed/` | 200, active | sliced to 8 KB → ~3 articles |
| RSS | Disney Food Blog | `disneyfoodblog.com/feed/` | 200, active | sliced to 8 KB → **0 complete** |
| RSS | Disney Tourist Blog | `disneytouristblog.com/feed/` | 200, active | sliced to 8 KB → ~4 articles |
| RSS | Inside the Magic | `insidethemagic.net/feed/` | 200, active | sliced to 8 KB → **0 complete** |
| API | themeparks.wiki destinations | `api.themeparks.wiki/v1/destinations` | active | `JSON.stringify().slice(0, 4000)` — live status only |
| API | YouTube broad search | Data API v3, 48 h, 50 results | active | fully wired |
| API | YouTube featured ×2 | PagingMrMorrow, WrightDownMainStreet, 7 d | active | fully wired, 1 slot each guaranteed |

**Are we only relying on YouTube?** For *substantive written news*, effectively yes — YouTube is the only source that survives intact, so the product is video-driven by accident. **Are RSS feeds broken?** No — they return fine; they're being truncated. **Returning old content?** No. **Limits too restrictive?** Yes — the 8 KB/25 KB byte caps are the core problem.

### Stage 2 — Source coverage matrix

| Blog | In pipeline? | Note |
|---|---|---|
| WDW News Today (WDWNT) | ✅ yes | but truncated to ~1 of 15 items |
| Disney Food Blog | ✅ yes | truncated to **0** complete items |
| Inside the Magic | ✅ yes | truncated to **0** complete items |
| AllEars | ✅ yes | ~3 items survive |
| Disney Tourist Blog | ✅ yes | ~4 items survive |
| Disney Parks Blog (official) | ✅ yes | ~1 of 10 items survive |
| The DIS | ❌ missing | candidate to add |
| BlogMickey | ❌ missing | candidate to add (strong on construction/permits) |
| MousePlanet | ❌ missing | candidate to add (Disneyland depth) |
| Laughing Place | ❌ missing | candidate to add |
| MickeyBlog | ❌ missing | candidate to add |
| TouringPlans | ❌ missing | candidate to add (crowd/wait data — fits the "Parkio Insight") |
| Universal Orlando (e.g., via WDWNT/ITM) | partial | covered indirectly; no dedicated feed |

**Important sequencing:** do **not** add sources first. The six you have already cover the major-news beat, and they're being wasted. Fix the truncation, then add 2–3 of the missing blogs for breadth.

### Stage 3 — Generation logic (record counts at each stage)

```
fetchParksBlogRss()        → 720 KB XML → sliced to 25 KB → ~1 usable article
fetchAdditionalSources()   → 5 feeds, each sliced to 8 KB → 0–4 usable each (≈8 total)
fetchThemeparksDestinations() → full JSON → sliced to 4 KB (live status only)
YouTube broad (48h,50)     → up to 50 items
YouTube featured ×2 (7d,5) → up to 5 each
mergeYouTubeIds()          → dedupe by videoId, featured-first, cap 50
fetchYouTubeStats()        → snippet+statistics for the capped IDs
rankTop10()                → exactly ≤10 (2 featured slots guaranteed)
buildPrompt()              → ~29 K input tokens (measured on 2026-05-11)
callClaudeWithRetry()      → 3 attempts / 30 s gap / 120 s timeout
buildPost()                → validate; THROWS on schema violation (halts run), else fallback
write                      → content/guide/daily/{slug}.json
```

No date filter, no empty-array crash, no timezone bug (ET handled correctly via `Intl.DateTimeFormat`). The single defect in this stage is the **byte truncation** feeding the prompt, plus the **hard-throw validation** that can silently halt the daily commit (see Root Cause #1).

### Stage 4 — Claude prompt analysis

Model: `claude-sonnet-4-5`, 6,000 max tokens. The prompt is well-engineered for *voice and structure* (original language, Parkio Insight objects, soft probabilistic phrasing, no-invention rule). Its weaknesses are all in the **volume direction**:

- _"PREFER FEWER, HIGHER-QUALITY STORIES… ship 3 if you can only ground 3"_ → with starved input, yields 1–3 stories.
- Section caps are low and bias toward the minimum.
- No instruction to **use all distinct stories present** in the feeds.

The prompt is **not** discarding news maliciously — it's behaving correctly given (a) very little input and (b) an explicit "ship fewer" directive. It is not YouTube-only by instruction; it's YouTube-only by starvation.

### Stage 5 — Last 16 generated briefings

| Date | AI? | breaking | bignews | topstories | icymi | spotlight | videos |
|---|---|---|---|---|---|---|---|
| 04-26 | – | 1 | 2 | 3 | 2 | 1 | 3 |
| 04-27 | ✅ | 1 | 2 | 3 | 1 | 1 | 10 |
| 04-28 | ✅ | 0 | 3 | 2 | 2 | 1 | 10 |
| 04-29 | ✅ | 0 | 2 | 2 | 1 | 1 | 10 |
| 04-30 | ✅ | 0 | 1 | 2 | 0 | 1 | 10 |
| 05-01 | ✅ | 0 | 2 | 1 | 0 | 1 | 10 |
| 05-02 | ✅ | 1 | 1 | 3 | 1 | 0 | 10 |
| 05-03 | ✅ | 0 | 1 | **0** | 0 | 0 | 10 |
| 05-04 | ✅ | 1 | 1 | **0** | 0 | 0 | 10 |
| 05-05 | ✅ | 0 | 1 | 3 | 0 | 1 | 10 |
| 05-06 | ✅ | 0 | 1 | 2 | 1 | 1 | 10 |
| 05-07 | ✅ | 0 | 2 | **0** | 0 | 1 | 10 |
| 05-08 | ✅ | 0 | 2 | 2 | 0 | 1 | 10 |
| 05-09 | ✅ | 0 | 1 | 1 | 0 | 1 | 10 |
| 05-10 | ✅ | 0 | 1 | 2 | 0 | 1 | 10 |
| 05-11 | ✅ | 0 | 2 | 4 | 2 | 1 | 10 |

Pattern: **breaking is almost always 0**, top stories collapse to 0 on multiple days, videos are always 10. Written story-slots average **5.1/day**. The product is structurally video-first and news-starved — consistent with Root Cause #2.

### Stage 6 — Publishing pipeline

```
build.mjs → content/guide/daily/{slug}.json → git commit/push (Actions GITHUB_TOKEN)
          → Cloudflare Pages rebuild → /guide/{slug} live + /feed.xml refreshed
          → RSS-to-Email service (Buttondown/Beehiiv per docs/AUTOMATION.md) polls /feed.xml
          → sends teaser (title + 3 bullets + CTA) on new <item>
```

The downstream chain is sound — **but it has had no new input since May 11**. `feed.xml` (`app/feed.xml/route.ts`) pulls bullets from `breaking → bignews → topstories` titles; on starved days those are nearly empty, so even when it does send, the email teaser is thin. **Nothing is being dropped *after* generation** — the loss is entirely upstream (build halted + feed truncation).

---

## Missing-news examples (real, captured 2026-05-29)

These are live feed items the current 8 KB cap **cuts before Claude sees them** — i.e. exactly the kind of stories you said are missing:

**WDWNT** (item 1 seen; 2–15 cut):
- ✗ "Major Menu Overhauls at The Artist's Palette at Walt Disney World Resort" (food)
- ✗ "Bluey's Wild World at Conservation Station Eliminating Virtual Queue" (operational)
- ✗ "More Spotlight Installations at Epic Universe For New Night Show" (entertainment)
- ✗ "More Track and Supports Installed for Fast & Furious: Hollywood Drift" (new attraction)
- ✗ "Stone Work and Roof Details Added to EPCOT's Refreshment Port" (construction)

**Inside the Magic** (item 1 seen; 2–10 cut):
- ✗ "Disney World Announces Major Operational Change to 'Bluey' Addition" (operational)
- ✗ "Walt Disney World's Massive Carousel of Progress Overhaul" (attraction)
- ✗ "Another Disney Springs Location Has Gone Dark With No Replacement" (closure)
- ✗ "Disney World Releases Warning, Sets Urgent New Rules for Guests From June" (policy)

**Disney Food Blog** (0 complete items reach Claude):
- ✗ "NEW Permit Filed For Ride Changes in Disney's Hollywood Studios" (attraction)
- ✗ "One of Disney's Oldest Rides Is Temporarily CLOSING in a Few Weeks" (closure)
- ✗ "NEW Parking Rule Hits Disney Springs" (policy)
- ✗ "Everything NEW Coming to Disney+ in June" (entertainment)

Every category you listed — ride closures/openings, food/festival, entertainment, hotel, construction, policy — is present in the feeds and being discarded by the truncation.

---

## Stage 7 — Recommended fixes (ranked by impact)

### Fix 1 — Re-enable / unblock the daily build _(impact: restores all output)_
Open **Actions → Parkio Daily**. If it isn't triggering, re-commit the workflow file and confirm Actions are enabled for the repo; if it's failing, read the failing step. To stop one bad Claude response from silently halting the day, **soften the hard throws** in `buildPost()` (lines ~676–718) to drop the offending item and continue, rather than failing the whole run. Keep the loud failure only for truly missing top-level fields.

### Fix 2 — Stop truncating the feeds _(impact: ~15% → ~90%+ of news reaches Claude)_
The byte cap is the wrong tool. Parse items and cap by **count**, and drop the heavy `<content:encoded>` body (titles + descriptions are enough for 1–2 sentence summaries). Minimal change in `fetchAdditionalSources()` / `fetchParksBlogRss()`:

```js
// Replace `xml.slice(0, 8_000)` with a lightweight item extractor:
function topItems(xml, n = 12) {
  const items = xml.split(/<item[ >]/).slice(1, n + 1);
  return items.map((it) => {
    const pick = (tag) => (it.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)) || [,""])[1]
      .replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    const title = pick("title");
    const date  = pick("pubDate");
    const desc  = pick("description").replace(/<[^>]+>/g, "").slice(0, 300); // strip HTML, short
    return `• ${title}${date ? ` (${date})` : ""}\n  ${desc}`;
  }).join("\n");
}
// then: xml: topItems(xml, 12)   // ~12 recent headlines+blurbs per source, fully intact
```

This sends Claude ~12 clean headlines+blurbs per source instead of one giant truncated article. Token cost per source actually *drops* (no full article HTML), so you can comfortably include all six feeds at full breadth.

### Fix 3 — Rebalance the prompt toward coverage _(impact: 5 → 10–13 stories/day)_
In `buildPrompt()`:
- Change guardrail #5 from "prefer fewer" to: _"Include every DISTINCT well-grounded story you find, up to the section caps. Do not pad with speculation, but do not omit a real, sourced story just to keep the list short."_
- Raise caps slightly: `topstories` 3–6, `bignews` 2–4, `icymi` 2–4.
- Keep #3 (no invention) and #4 (no-news fallback) unchanged — those are correct safety rails.

### Fix 4 — Add 2–3 missing blogs _(impact: incremental breadth, do AFTER 1–3)_
Add to the `SOURCES` array in `fetchAdditionalSources()`:
```js
{ name: "BlogMickey",  url: "https://blogmickey.com/feed/" },     // construction/permits
{ name: "Laughing Place", url: "https://www.laughingplace.com/w/feed/" },
{ name: "MousePlanet", url: "https://www.mouseplanet.com/rss" },  // Disneyland depth
```
(TouringPlans pairs especially well with the Parkio Insight crowd angle.)

### Fix 5 — Add an observability guard _(impact: prevents silent 18-day outages)_
Have the workflow fail (or send you a notification) if `content/guide/daily/{today}.json` is missing at the end of the run, and add a tiny "freshness" check on the site/feed so a stale latest-date is visible. This is what would have surfaced the May 11 halt the day it happened.

### Expected coverage increase

| Metric | Now | After Fixes 1–3 |
|---|---|---|
| Articles reaching Claude | ~9 (~15%) | ~60+ (~90%+) |
| Biggest feeds (WDWNT/ITM/DFB) | 1 / 0 / 0 items | ~12 each |
| Written stories/day | ~5 (declining) | ~10–13 |
| Major announcements captured | rarely | routinely |
| Briefings produced | 0 in 18 days | daily |

Fixes 1 and 2 are the whole ballgame; 3 sharpens it; 4–5 are polish. None require redesigning the architecture — they're edits to `build.mjs` and the workflow you already have.

_Sources: live repo `Parkio Website` (build.mjs, parkio-daily.yml, feed.xml/route.ts, docs/AUTOMATION.md, content/guide/daily/*.json, git log) and live RSS fetches of the six configured feeds on 2026-05-29._

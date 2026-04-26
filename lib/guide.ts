/**
 * Content store for Parkio Guide.
 *
 * NOT a blog. Posts are short, structured, and end in a CTA that
 * sends the reader to an actual Parkio surface (a park page, the
 * parks index, or a specific recommendation card). The shape forces
 * each post to scan in under 30 seconds — no walls of prose.
 *
 * Add posts by appending to GUIDE_POSTS. Type safety prevents shipping
 * a post without a "Do This Now" block + primary CTA.
 */

import type { ParkId } from "./types";

/* ──────────────────────── Types ──────────────────────── */

export type GuideCategory = "live" | "strategy" | "parent";

export interface GuideCta {
  /** Short verb-led label, e.g. "Open Magic Kingdom on Parkio". */
  label: string;
  /** Internal Parkio path. Should always start with "/". */
  href: string;
  /**
   * Optional — when set, the detail page can theme the CTA with the
   * park's accent color and surface the park's name in microcopy.
   */
  parkSlug?: ParkId;
}

/**
 * Body block discriminated union. Each post is a short sequence of
 * blocks (3–7 typical). Renderer in components/GuideArticle.tsx
 * handles each kind with a distinct visual treatment.
 */
export type GuideBlock =
  | { kind: "p"; body: string }
  | { kind: "h2"; text: string }
  | { kind: "list"; intro?: string; items: string[] }
  | { kind: "tip"; title: string; body: string }
  | {
      kind: "callout";
      tone?: "info" | "warn" | "success";
      body: string;
    };

export interface GuidePost {
  slug: string;
  /** Headline. Should match the user's search query when possible. */
  title: string;
  /** SEO meta description AND card preview. ~150–160 chars. */
  description: string;
  category: GuideCategory;
  parkSlug?: ParkId;
  /** ISO date — when the post first went live. */
  publishedAt: string;
  /** ISO date — when content was last edited. Populated for "live" posts. */
  updatedAt?: string;
  readMinutes: number;
  /** Body of the post, rendered top-to-bottom. */
  blocks: GuideBlock[];
  /**
   * Mandatory action block. Shown prominently at the END of every
   * post. The primaryCta is the single most important link on the
   * page — it should always send the user into the live product.
   */
  doThisNow: {
    heading: string;
    steps: string[];
    primaryCta: GuideCta;
  };
  /**
   * Optional secondary pathways into Parkio. Each is rendered as a
   * compact link card under the primary CTA so a reader who isn't
   * ready for the primary action still has somewhere relevant to go.
   */
  related?: GuideCta[];
}

/* ──────────────────────── Posts ──────────────────────── */

export const GUIDE_POSTS: GuidePost[] = [
  /* ───────────── 1. LIVE — Magic Kingdom hub ───────────── */
  {
    slug: "what-to-ride-at-magic-kingdom-right-now",
    title: "What to ride at Magic Kingdom right now",
    description:
      "The trick at Magic Kingdom isn't picking the best ride — it's picking the best ride right now. Live picks, refreshed every minute on Parkio.",
    category: "live",
    parkSlug: "magic-kingdom",
    publishedAt: "2026-04-26",
    updatedAt: "2026-04-26",
    readMinutes: 3,
    blocks: [
      {
        kind: "p",
        body:
          "Magic Kingdom's longest waits aren't always the best rides — they're just the most popular ones at the wrong moment. Use live wait data to flip that.",
      },
      {
        kind: "h2",
        text: "Start with whatever Parkio Picks is showing",
      },
      {
        kind: "p",
        body:
          "Parkio's Best Right Now card is tuned to surface headliners with sub-30-minute waits and walk-on hidden gems. Open it once you're inside the park, before you commit to a route.",
      },
      {
        kind: "tip",
        title: "Look for low-wait headliners between 9–10am",
        body:
          "Pirates of the Caribbean, Haunted Mansion, and Tiana's Bayou Adventure routinely sit at 5–15 minutes during the first park hour. After 11am, expect 30+.",
      },
      {
        kind: "h2",
        text: "Use the map to chain rides in the same land",
      },
      {
        kind: "list",
        intro:
          "Walk time is real time. Once you've ridden one Adventureland headliner, look for what's next door before crossing the park:",
        items: [
          "Pirates → Jungle Cruise → Magic Carpets of Aladdin",
          "Haunted Mansion → It's a Small World → Peter Pan's Flight",
          "Space Mountain → Peoplemover → Astro Orbiter",
        ],
      },
      {
        kind: "callout",
        tone: "info",
        body:
          "Parkio's Near You section uses your last selected ride to suggest nearby short-wait options — so you don't have to mentally walk the park yourself.",
      },
      {
        kind: "h2",
        text: "Save fireworks-time slots for short waits",
      },
      {
        kind: "p",
        body:
          "While most guests cluster on Main Street for fireworks, Tomorrowland and Frontierland headliners drop into walk-on territory. Skip the crowd, ride twice, then catch fireworks from the back.",
      },
    ],
    doThisNow: {
      heading: "Do this now",
      steps: [
        "Open the Magic Kingdom park page on Parkio",
        "Read the top of Best Right Now — that's your next ride",
        "If you've already selected one ride, scroll to Near You for a short walk",
      ],
      primaryCta: {
        label: "Open Magic Kingdom on Parkio",
        href: "/parks/magic-kingdom",
        parkSlug: "magic-kingdom",
      },
    },
    related: [
      {
        label: "All parks",
        href: "/parks",
      },
      {
        label: "How to skip the longest Disney wait times",
        href: "/guide/skip-longest-disney-wait-times",
      },
    ],
  },

  /* ───────────── 2. STRATEGY — Wait times explained ───────────── */
  {
    slug: "skip-longest-disney-wait-times",
    title: "How to skip the longest Disney wait times with Parkio Picks",
    description:
      "Disney wait times move every minute. Parkio Picks ranks the smartest ride right now using live data — here's how to read it like a pro.",
    category: "strategy",
    publishedAt: "2026-04-26",
    readMinutes: 4,
    blocks: [
      {
        kind: "p",
        body:
          "Most Disney wait-time apps just show you a list. Parkio Picks ranks rides for you — by combining wait time, ride popularity, and how close you are to it.",
      },
      {
        kind: "h2",
        text: "How the ranking actually works",
      },
      {
        kind: "list",
        intro:
          "Three tiers, in order of priority on the Best Right Now card:",
        items: [
          "Headliners (≤ 60 min wait): always rank above non-headliners with reasonable waits",
          "Walk-on gems (any non-headliner ≤ 10 min): jump up the list when waits are tiny",
          "Short-wait gems (≤ 25 min): fill remaining slots after the picks above",
        ],
      },
      {
        kind: "tip",
        title: "A mid-wait headliner beats a far-away walk-on",
        body:
          "30-minute Space Mountain still wins over a 5-minute ride on the opposite side of the park. Parkio bakes that into the score so you don't have to.",
      },
      {
        kind: "h2",
        text: "Read the badges",
      },
      {
        kind: "list",
        items: [
          'Headliner — curated top-tier ride for that park',
          'Low wait — anything ≤ 15 minutes (true walk-on territory)',
          'Color-coded wait pill — green ≤ 30, amber 31–60, rose 60+',
        ],
      },
      {
        kind: "h2",
        text: "Three ways to use it",
      },
      {
        kind: "list",
        items: [
          "First ride of the day: tap the top of Best Right Now and walk straight there",
          "Mid-park reset: when you finish a ride, scroll to Near You for the next one without opening the map",
          "Crowded afternoon: switch to Skip For Now to plan around 60+ minute lines",
        ],
      },
      {
        kind: "callout",
        tone: "success",
        body:
          "Best Right Now refreshes every minute. If a ride drops below 15 min, you'll see it within 60 seconds.",
      },
    ],
    doThisNow: {
      heading: "Do this now",
      steps: [
        "Pick the park you're in",
        "Scroll to Parkio Picks",
        "Tap the top ride — it's already the highest-scoring pick",
      ],
      primaryCta: {
        label: "Pick a park",
        href: "/parks",
      },
    },
    related: [
      {
        label: "Today at Magic Kingdom",
        href: "/guide/what-to-ride-at-magic-kingdom-right-now",
      },
      {
        label: "Best rides today at Hollywood Studios",
        href: "/guide/best-rides-hollywood-studios-today",
      },
    ],
  },

  /* ───────────── 3. PARENT — Princesses ───────────── */
  {
    slug: "princess-meet-greets-magic-kingdom-parents",
    title: "Princess meet & greets at Magic Kingdom: a parent's playbook",
    description:
      "Where to find every princess at Magic Kingdom, how long the lines run, and how to use Parkio's Happening Soon section to never miss a meet.",
    category: "parent",
    parkSlug: "magic-kingdom",
    publishedAt: "2026-04-26",
    readMinutes: 4,
    blocks: [
      {
        kind: "p",
        body:
          "Princess meets aren't queue rides — they're scheduled appearances. That means the second-best feature at Magic Kingdom (after the rides) is your daily showtimes list.",
      },
      {
        kind: "h2",
        text: "Where the princesses actually are",
      },
      {
        kind: "list",
        intro: "Three core meeting spots — each has different rotations:",
        items: [
          "Princess Fairytale Hall — Cinderella + a rotating princess (often Elena, Tiana, Rapunzel)",
          "Town Square Theater — Mickey, Tinker Bell, and special character rotations",
          "Pete's Silly Sideshow — classic characters in costume (Mickey-as-magician, Goofy, Donald, Daisy)",
        ],
      },
      {
        kind: "tip",
        title: "Lines build fast at character switchovers",
        body:
          "When one princess steps out and another steps in, queues balloon for the next 15 minutes. Arriving 10 minutes BEFORE a switchover gets you the most out of your wait.",
      },
      {
        kind: "h2",
        text: "Let Parkio tell you when the next show is",
      },
      {
        kind: "p",
        body:
          "The Happening Soon section on every park page lists shows, parades, fireworks, and character meets starting in the next 90 minutes — sorted by soonest first. A 👑 means it's a character; 🎭 means it's a show or parade.",
      },
      {
        kind: "callout",
        tone: "info",
        body:
          "Happening Soon refreshes automatically. If you're mid-ride and a princess goes on at 3:15, you'll see it the moment you check your phone.",
      },
      {
        kind: "h2",
        text: "Plan around naps, not around the parade",
      },
      {
        kind: "list",
        items: [
          "Morning: knock out 1–2 headliner rides while the princesses sleep in",
          "Late morning (10:30–noon): princess meets are short, fresh out of opening",
          "Mid-afternoon: stroller break + Happening Soon check before committing to a meet",
          "Evening: princesses often appear earlier in dinner hours — fewer kids, shorter lines",
        ],
      },
    ],
    doThisNow: {
      heading: "Do this now",
      steps: [
        "Open Magic Kingdom on Parkio",
        "Scroll to Happening Soon — anything princess-shaped will be at the top",
        "Tap the soonest meet to see when (and where) it starts",
      ],
      primaryCta: {
        label: "Open Magic Kingdom on Parkio",
        href: "/parks/magic-kingdom",
        parkSlug: "magic-kingdom",
      },
    },
    related: [
      {
        label: "What to ride at Magic Kingdom right now",
        href: "/guide/what-to-ride-at-magic-kingdom-right-now",
      },
      {
        label: "All parks",
        href: "/parks",
      },
    ],
  },

  /* ───────────── 4. STRATEGY — Hollywood Studios busy day ───────────── */
  {
    slug: "best-rides-hollywood-studios-today",
    title: "Best Disney rides right now at Hollywood Studios",
    description:
      "Hollywood Studios runs hot. Here's how to find walk-on windows on Slinky Dog Dash, Tower of Terror, and Rise of the Resistance using live wait data.",
    category: "strategy",
    parkSlug: "hollywood-studios",
    publishedAt: "2026-04-26",
    readMinutes: 4,
    blocks: [
      {
        kind: "p",
        body:
          "Hollywood Studios has fewer headliners than Magic Kingdom, which means waits are concentrated. Live data turns that into an opportunity — short windows are dramatic when they happen.",
      },
      {
        kind: "h2",
        text: "Three rides worth chasing",
      },
      {
        kind: "tip",
        title: "Slinky Dog Dash — best in the first hour",
        body:
          "Toy Story Land opens with the rest of the park. The first 60 minutes routinely sit under 30, then climb past 60 by mid-morning.",
      },
      {
        kind: "tip",
        title: "Tower of Terror — late-afternoon dip",
        body:
          "Tower drops noticeably between 4–5pm as guests migrate toward the evening shows. Parkio Picks usually surfaces it in Best Right Now during that window.",
      },
      {
        kind: "tip",
        title: "Rise of the Resistance — usually a Skip",
        body:
          "Rise lives in Skip For Now most of the day (60+ min waits). Catch it in the last hour before close — it sometimes drops to 45.",
      },
      {
        kind: "h2",
        text: "Backup picks when waits are awful",
      },
      {
        kind: "list",
        intro:
          "When everything's at 60+, Parkio's Backup picks & quick wins surface these:",
        items: [
          "Star Tours — Original headliner, often forgotten, often walk-on",
          "Toy Story Mania! — moderate wait, family-friendly, weather-proof",
          "Alien Swirling Saucers — short, low-stress, great for stroller breaks",
        ],
      },
      {
        kind: "callout",
        tone: "warn",
        body:
          "Rock 'n' Roller Coaster is currently in refurb. Parkio surfaces this on the map and removes it from picks automatically — you won't accidentally walk over.",
      },
    ],
    doThisNow: {
      heading: "Do this now",
      steps: [
        "Open Hollywood Studios on Parkio",
        "Scan the Best Right Now card — that's your first ride",
        "If everything's high, switch to Backup picks & quick wins",
      ],
      primaryCta: {
        label: "Open Hollywood Studios on Parkio",
        href: "/parks/hollywood-studios",
        parkSlug: "hollywood-studios",
      },
    },
    related: [
      {
        label: "How to skip the longest Disney wait times",
        href: "/guide/skip-longest-disney-wait-times",
      },
      {
        label: "All parks",
        href: "/parks",
      },
    ],
  },
];

/* ──────────────────────── Helpers ──────────────────────── */

export function getGuidePost(slug: string): GuidePost | undefined {
  return GUIDE_POSTS.find((p) => p.slug === slug);
}

export function listGuidePosts(): GuidePost[] {
  // Newest first; within the same publish date, by slug for stability.
  return [...GUIDE_POSTS].sort((a, b) => {
    if (a.publishedAt !== b.publishedAt) {
      return a.publishedAt < b.publishedAt ? 1 : -1;
    }
    return a.slug < b.slug ? -1 : 1;
  });
}

export function listGuideSlugs(): string[] {
  return GUIDE_POSTS.map((p) => p.slug);
}

export function categoryLabel(c: GuideCategory): string {
  switch (c) {
    case "live":
      return "Right now";
    case "strategy":
      return "Strategy";
    case "parent":
      return "For parents";
  }
}

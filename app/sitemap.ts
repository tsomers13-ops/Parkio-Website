import type { MetadataRoute } from "next";
import {
  attractionCanonicalPath,
  attractionStaticParams,
} from "@/lib/attractionRoute";
import { getIndexablePermanentDining } from "@/lib/dining";
import { diningCanonicalPath, diningParkStaticParams, parkDiningPath } from "@/lib/diningRoute";
import { DISNEY_PARKS } from "@/lib/disneyParkConfig";
import { listGuidePosts } from "@/lib/guide";
import { listDailyPosts } from "@/lib/guideDaily";

const SITE_URL = "https://parkio.info";

/**
 * Build an absolute sitemap URL with the trailing slash this app serves.
 *
 * `trailingSlash: true` in next.config.mjs means "/parks" 308-redirects to
 * "/parks/", and every page self-canonicalises with the slash. The sitemap
 * previously emitted the slash-less form, so every entry pointed at a
 * redirect and disagreed with its own page's canonical. This normalises
 * the two. The site root is already "/" and is left alone.
 *
 * One verified exception: Next excludes paths with a file extension from
 * trailing-slash normalisation. Confirmed against production —
 * "/feed.xml" serves 200 while "/feed.xml/" 308-redirects back to it —
 * so a file route must keep its bare form.
 */
const FILE_ROUTE = /\.[a-z0-9]+$/i;

function url(path: string): string {
  if (path === "/") return `${SITE_URL}/`;
  const withLeading = path.startsWith("/") ? path : `/${path}`;
  if (FILE_ROUTE.test(withLeading)) return `${SITE_URL}${withLeading}`;
  const withTrailing = withLeading.endsWith("/")
    ? withLeading
    : `${withLeading}/`;
  return `${SITE_URL}${withTrailing}`;
}

/**
 * Public sitemap. Only includes guest-facing pages.
 *
 * The /api/* routes are intentionally NOT listed — they exist for the
 * iPhone app and the website's own client code, not for search engines.
 * `app/robots.ts` also disallows /api/ to keep crawlers out.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  /**
   * Dining. Two discovery pages plus only the venue pages that clear the
   * Gate 3 content floor — the 49 below it are routable but noindex, so
   * listing them here would contradict their own robots directive. Festival
   * booths have no detail routes by policy and never appear.
   */
  const diningRoutes: MetadataRoute.Sitemap = [
    ...diningParkStaticParams().map(({ parkId }) => ({
      url: url(parkDiningPath(parkId)),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...getIndexablePermanentDining().map((venue) => ({
      url: url(diningCanonicalPath(venue.parkId, venue.slug)),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: url("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: url("/parks"), lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: url("/waits"), lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    // High-intent SEO landing pages — same data as /waits and /parks/*
    // but framed for the "today" search query. lastModified is `now`
    // so each Cloudflare rebuild bumps the freshness signal.
    { url: url("/wait-times-today"), lastModified: now, changeFrequency: "hourly", priority: 0.85 },
    { url: url("/magic-kingdom-wait-times-today"), lastModified: now, changeFrequency: "hourly", priority: 0.85 },
    { url: url("/epcot-wait-times-today"), lastModified: now, changeFrequency: "hourly", priority: 0.85 },
    { url: url("/hollywood-studios-wait-times-today"), lastModified: now, changeFrequency: "hourly", priority: 0.85 },
    { url: url("/animal-kingdom-wait-times-today"), lastModified: now, changeFrequency: "hourly", priority: 0.85 },
    { url: url("/disneyland-wait-times-today"), lastModified: now, changeFrequency: "hourly", priority: 0.85 },
    { url: url("/california-adventure-wait-times-today"), lastModified: now, changeFrequency: "hourly", priority: 0.85 },
    // "Best rides today" cluster — same data as /wait-times-today but
    // pivots to Parkio Picks (decision-focused). Targets the
    // "best rides at <park> today" search intent.
    { url: url("/best-rides-today"), lastModified: now, changeFrequency: "hourly", priority: 0.85 },
    { url: url("/magic-kingdom-best-rides-today"), lastModified: now, changeFrequency: "hourly", priority: 0.85 },
    { url: url("/epcot-best-rides-today"), lastModified: now, changeFrequency: "hourly", priority: 0.85 },
    { url: url("/hollywood-studios-best-rides-today"), lastModified: now, changeFrequency: "hourly", priority: 0.85 },
    { url: url("/animal-kingdom-best-rides-today"), lastModified: now, changeFrequency: "hourly", priority: 0.85 },
    { url: url("/disneyland-best-rides-today"), lastModified: now, changeFrequency: "hourly", priority: 0.85 },
    { url: url("/california-adventure-best-rides-today"), lastModified: now, changeFrequency: "hourly", priority: 0.85 },
    { url: url("/guide"), lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: url("/feed.xml"), lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: url("/newsletter"), lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: url("/about"), lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: url("/support"), lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: url("/privacy"), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  const parkRoutes: MetadataRoute.Sitemap = DISNEY_PARKS.map((p) => ({
    url: url(`/parks/${p.slug}`),
    lastModified: now,
    changeFrequency: "hourly",
    priority: 0.8,
  }));

  const guideRoutes: MetadataRoute.Sitemap = listGuidePosts().map((post) => ({
    url: url(`/guide/${post.slug}`),
    lastModified: post.updatedAt
      ? new Date(post.updatedAt)
      : new Date(post.publishedAt),
    changeFrequency: post.category === "live" ? "daily" : "monthly",
    priority: 0.6,
  }));

  // Daily briefings — change frequency `never` after publish (each
  // post is a snapshot of one specific day). Priority is bumped for
  // recent posts vs. older ones via the natural date-ordered sitemap.
  const dailyRoutes: MetadataRoute.Sitemap = listDailyPosts().map((post) => ({
    url: url(`/guide/${post.slug}`),
    lastModified: post.updatedAt ? new Date(post.updatedAt) : new Date(post.date),
    changeFrequency: "never",
    priority: 0.7,
  }));

  // One entry per canonical attraction, derived from the same static
  // params the route generates — never a hand-maintained list.
  const attractionRoutes: MetadataRoute.Sitemap = attractionStaticParams().map(
    (params) => ({
      url: url(attractionCanonicalPath(params.parkId, params.slug)),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    }),
  );

  return [
    ...staticRoutes,
    ...parkRoutes,
    ...attractionRoutes,
    ...diningRoutes,
    ...dailyRoutes,
    ...guideRoutes,
  ];
}

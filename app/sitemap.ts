import type { MetadataRoute } from "next";
import { DISNEY_PARKS } from "@/lib/disneyParkConfig";
import { listGuidePosts } from "@/lib/guide";
import { listDailyPosts } from "@/lib/guideDaily";

const SITE_URL = "https://parkio.info";

/**
 * Public sitemap. Only includes guest-facing pages.
 *
 * The /api/* routes are intentionally NOT listed — they exist for the
 * iPhone app and the website's own client code, not for search engines.
 * `app/robots.ts` also disallows /api/ to keep crawlers out.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/parks`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/waits`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/guide`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/newsletter`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/support`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  const parkRoutes: MetadataRoute.Sitemap = DISNEY_PARKS.map((p) => ({
    url: `${SITE_URL}/parks/${p.slug}`,
    lastModified: now,
    changeFrequency: "hourly",
    priority: 0.8,
  }));

  const guideRoutes: MetadataRoute.Sitemap = listGuidePosts().map((post) => ({
    url: `${SITE_URL}/guide/${post.slug}`,
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
    url: `${SITE_URL}/guide/${post.slug}`,
    lastModified: post.updatedAt
      ? new Date(post.updatedAt)
      : new Date(post.publishedAt),
    changeFrequency: "never",
    priority: 0.7,
  }));

  return [...staticRoutes, ...parkRoutes, ...dailyRoutes, ...guideRoutes];
}

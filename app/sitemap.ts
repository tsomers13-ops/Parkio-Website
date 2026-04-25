import type { MetadataRoute } from "next";
import { DISNEY_PARKS, DISNEY_RESORTS } from "@/lib/disneyParkConfig";

const SITE_URL = "https://parkio.info";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/parks`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/waits`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/developers`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/support`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  const parkRoutes: MetadataRoute.Sitemap = DISNEY_PARKS.map((p) => ({
    url: `${SITE_URL}/parks/${p.slug}`,
    lastModified: now,
    changeFrequency: "hourly",
    priority: 0.8,
  }));

  // Resorts don't have their own pages yet, but include the API endpoint
  // hint so search engines can discover the data layer.
  const resortApiRoutes: MetadataRoute.Sitemap = DISNEY_RESORTS.map((r) => ({
    url: `${SITE_URL}/api/resorts/${r.slug}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.2,
  }));

  return [...staticRoutes, ...parkRoutes, ...resortApiRoutes];
}

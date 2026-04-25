import type { MetadataRoute } from "next";

const SITE_URL = "https://parkio.info";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Block our internal API from being indexed — it's still
        // publicly reachable, just not useful in search results.
        disallow: ["/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

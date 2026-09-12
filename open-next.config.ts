import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

/**
 * Parkio never revalidates. Every generated route pairs `generateStaticParams`
 * with `dynamicParams = false`, so there is nothing to regenerate at runtime.
 *
 * The static-assets incremental cache is the exact match for that shape:
 * prerendered pages are read back from Workers Static Assets, which needs no
 * R2, KV or D1 bucket, and whose requests are free and unlimited. Upstream
 * documents it for applications that "do NOT want revalidation and ONLY want
 * to serve prerendered data".
 *
 * This makes `opennextjs-cloudflare populateCache` a REQUIRED build step —
 * without it every SSG route answers 404. See docs/WORKERS-MIGRATION.md.
 */
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});

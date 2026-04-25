/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // We have real API routes (app/api/*), so we need a runtime — not a
  // static export. The site still deploys to Cloudflare Pages via
  // @cloudflare/next-on-pages, or to Vercel with zero config.
  // See DEPLOY.md.
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;

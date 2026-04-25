/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export for Cloudflare Pages.
  // `npm run build` writes a fully static site into ./out
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;

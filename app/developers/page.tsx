import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";

export const metadata = {
  title: "Developer API",
  description:
    "Parkio's public JSON API: live Disney wait times, park status, and operating hours. The same API powers the Parkio website.",
  alternates: { canonical: "/developers" },
  openGraph: {
    title: "Parkio API — Live Disney park data",
    description:
      "Public JSON endpoints for park status, live attraction wait times, and operating hours.",
    type: "website",
    url: "/developers",
  },
};

interface Endpoint {
  method: "GET";
  path: string;
  purpose: string;
  ttl: string;
}

const ENDPOINTS: Endpoint[] = [
  {
    method: "GET",
    path: "/api/parks",
    purpose: "List supported parks with today's status and hours.",
    ttl: "30 min",
  },
  {
    method: "GET",
    path: "/api/parks/{parkSlug}",
    purpose: "Single park metadata + today's hours.",
    ttl: "30 min",
  },
  {
    method: "GET",
    path: "/api/parks/{parkSlug}/live",
    purpose: "Live wait times + status for every supported attraction.",
    ttl: "5 min",
  },
  {
    method: "GET",
    path: "/api/parks/{parkSlug}/hours",
    purpose: "Today's hours plus the next 14-day forecast.",
    ttl: "30 min",
  },
  {
    method: "GET",
    path: "/api/resorts/{resortSlug}",
    purpose: "Resort metadata + the parks within it.",
    ttl: "30 min",
  },
  {
    method: "GET",
    path: "/api/attractions/{attractionSlug}",
    purpose: "Single attraction with live status + wait time.",
    ttl: "5 min",
  },
];

const EXAMPLE_RESPONSE = `{
  "parkSlug": "magic-kingdom",
  "lastUpdated": "2026-04-26T14:21:08.012Z",
  "live": true,
  "attractions": [
    {
      "id": "b2260923-9315-40fd-9c6b-44dd811dbe64",
      "slug": "mk-space-mountain",
      "parkSlug": "magic-kingdom",
      "name": "Space Mountain",
      "status": "OPERATING",
      "waitMinutes": 65,
      "coordinates": { "lat": 28.4188, "lng": -81.5782 },
      "lastUpdated": "2026-04-26T14:20:43.000Z"
    }
  ]
}`;

export default function DevelopersPage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />

      <section className="relative">
        <div className="bg-aurora absolute inset-0 -z-10 opacity-70" />
        <div className="mx-auto max-w-4xl px-5 pb-16 pt-12 sm:px-8 sm:pb-24 sm:pt-16">
          <p className="text-sm font-medium uppercase tracking-widest text-accent-600">
            Parkio API
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
            The same API that powers the website.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-600">
            Parkio normalizes upstream theme-park data into clean,
            iOS-friendly JSON. Stable slugs. Real GPS. Sensible cache
            headers. No auth required for the public read endpoints.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="/api/parks"
              className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-4 py-2.5 text-sm font-medium text-white shadow-soft transition hover:bg-ink-800"
              target="_blank"
              rel="noreferrer noopener"
            >
              Try /api/parks
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
                <path
                  d="M6 3l5 5-5 5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
            <a
              href="https://github.com/tsomers13-ops/Parkio-Website/blob/main/API.md"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-4 py-2.5 text-sm font-medium text-ink-800 shadow-soft transition hover:border-ink-300 hover:bg-ink-50"
            >
              Full reference
            </a>
          </div>

          <h2 className="mt-16 text-2xl font-semibold tracking-tight text-ink-900">
            Endpoints
          </h2>
          <div className="mt-5 overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-soft">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink-100 bg-ink-50/60 text-[11px] font-semibold uppercase tracking-widest text-ink-500">
                <tr>
                  <th className="px-4 py-3 sm:px-6">Method</th>
                  <th className="px-4 py-3 sm:px-6">Path</th>
                  <th className="hidden px-4 py-3 sm:table-cell sm:px-6">
                    Purpose
                  </th>
                  <th className="px-4 py-3 sm:px-6">Cache</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {ENDPOINTS.map((ep) => (
                  <tr key={ep.path}>
                    <td className="px-4 py-3 sm:px-6">
                      <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold tracking-wider text-emerald-700 ring-1 ring-emerald-200">
                        {ep.method}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-900 sm:px-6 sm:text-sm">
                      {ep.path}
                    </td>
                    <td className="hidden px-4 py-3 text-ink-600 sm:table-cell sm:px-6">
                      {ep.purpose}
                    </td>
                    <td className="px-4 py-3 text-ink-600 sm:px-6">{ep.ttl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="mt-16 text-2xl font-semibold tracking-tight text-ink-900">
            Example response
          </h2>
          <p className="mt-2 text-sm text-ink-600">
            <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[12px] text-ink-900">
              GET /api/parks/magic-kingdom/live
            </code>
          </p>
          <pre className="mt-4 overflow-x-auto rounded-3xl bg-ink-900 p-5 text-[12px] leading-relaxed text-ink-100 shadow-soft sm:text-sm">
            <code>{EXAMPLE_RESPONSE}</code>
          </pre>

          <h2 className="mt-16 text-2xl font-semibold tracking-tight text-ink-900">
            Caching & rate limits
          </h2>
          <p className="mt-3 text-base leading-relaxed text-ink-600">
            All routes set <code className="rounded bg-ink-100 px-1 py-0.5 font-mono text-[12px]">Cache-Control: public, s-maxage=…</code>{" "}
            so the platform's edge CDN caches every response. Live wait
            times have a 5-minute TTL; park hours and resort metadata are
            cached for 30 minutes. No auth required, no per-IP rate limit
            today — please be nice.
          </p>

          <h2 className="mt-16 text-2xl font-semibold tracking-tight text-ink-900">
            Source data
          </h2>
          <p className="mt-3 text-base leading-relaxed text-ink-600">
            Parkio aggregates real-time data from{" "}
            <a
              href="https://themeparks.wiki"
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-ink-900 underline-offset-2 hover:underline"
            >
              themeparks.wiki
            </a>{" "}
            (a public theme-park API), normalizes it, and adds stable
            Parkio-friendly slugs.
          </p>

          <div className="mt-12 rounded-3xl border border-ink-100 bg-ink-50/60 p-5 text-sm text-ink-600 sm:p-6">
            Need help? Reach out to{" "}
            <Link
              href="/support"
              className="font-medium text-ink-900 underline-offset-2 hover:underline"
            >
              support
            </Link>
            .
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

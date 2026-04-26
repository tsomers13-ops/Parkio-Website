import Link from "next/link";
import { AppStoreCta } from "@/components/AppStoreCta";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { NewsletterCta } from "@/components/NewsletterCta";
import { PARKS } from "@/lib/data";
import {
  type GuideCategory,
  categoryLabel,
  listGuidePosts,
} from "@/lib/guide";
import {
  formatBriefingDate,
  listDailyPosts,
} from "@/lib/guideDaily";

export const metadata = {
  title: "Parkio Daily — Disney park briefings, every morning",
  description:
    "A daily Disney parks briefing built for app-first guests. Breaking news, big stories, and live picks for Walt Disney World and Disneyland — every morning.",
  alternates: { canonical: "/guide" },
  openGraph: {
    title: "Parkio Daily — Disney park briefings, every morning",
    description:
      "A 3-minute Disney parks briefing every morning. Breaking news, big stories, ICYMI, spotlight, and curated videos.",
    type: "website",
    url: "/guide",
  },
};

const CATEGORY_ORDER: GuideCategory[] = ["live", "strategy", "parent"];

export default function GuideIndexPage() {
  const dailyPosts = listDailyPosts();
  const today = dailyPosts[0] ?? null;
  const recent = dailyPosts.slice(1, 7); // up to 6 prior briefings

  const evergreen = listGuidePosts();
  const evergreenByCategory: Record<GuideCategory, typeof evergreen> = {
    live: [],
    strategy: [],
    parent: [],
  };
  for (const p of evergreen) evergreenByCategory[p.category].push(p);

  return (
    <main className="min-h-screen bg-white">
      <Navbar />

      {/* ── Hero ── */}
      <section className="relative">
        <div className="bg-aurora absolute inset-0 -z-10 opacity-70" />
        <div className="mx-auto max-w-5xl px-5 pb-10 pt-12 sm:px-8 sm:pb-14 sm:pt-16">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold uppercase tracking-widest text-accent-600">
              Parkio Daily
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white/70 px-2.5 py-0.5 text-[11px] font-medium text-ink-600 shadow-soft backdrop-blur">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              New every morning
            </span>
          </div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
            Today in the parks —
            <br className="hidden sm:block" />
            <span className="bg-gradient-to-br from-accent-600 to-sky-500 bg-clip-text text-transparent">
              what matters right now.
            </span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-600">
            A 3-minute Disney parks briefing every morning. Breaking
            news, big stories, ICYMI, and spotlight — written for
            app-first guests, built around Parkio's live wait-time
            engine.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/parks"
              className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-sm font-semibold text-white shadow-lift transition hover:bg-ink-800"
            >
              Open Parkio
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
                <path
                  d="M6 3l5 5-5 5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            </Link>
            <Link
              href="/waits"
              className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-5 py-3 text-sm font-medium text-ink-800 shadow-soft transition hover:border-ink-300 hover:text-ink-900"
            >
              Check live wait times
            </Link>
            <Link
              href="/newsletter"
              className="inline-flex items-center gap-2 rounded-full px-3 py-3 text-sm font-medium text-accent-700 transition hover:text-accent-900"
            >
              Subscribe to Parkio Daily →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Today's briefing — featured ── */}
      {today ? (
        <section className="mx-auto max-w-5xl px-5 pb-2 sm:px-8 sm:pb-4">
          <Link
            href={`/guide/${today.slug}`}
            className="group block overflow-hidden rounded-3xl border border-ink-100 bg-gradient-to-br from-accent-50 via-white to-emerald-50/30 p-6 shadow-soft transition hover:shadow-lift sm:p-9"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-accent-700">
                Today's briefing
              </span>
              <span className="text-[12px] font-medium text-ink-500">
                {formatBriefingDate(today.date)}
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink-900 group-hover:text-accent-800 sm:text-3xl">
              {today.title}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-ink-600 sm:text-lg">
              {today.teaser}
            </p>
            <div className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-700">
              Read today's briefing
              <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
                <path
                  d="M6 3l5 5-5 5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            </div>
          </Link>
        </section>
      ) : (
        <section className="mx-auto max-w-5xl px-5 pb-2 sm:px-8 sm:pb-4">
          <div className="rounded-3xl border border-ink-100 bg-ink-50/40 px-6 py-10 text-center sm:py-12">
            <p className="text-sm font-semibold uppercase tracking-widest text-ink-500">
              Tomorrow morning
            </p>
            <p className="mt-2 text-base text-ink-700 sm:text-lg">
              The first Parkio Daily briefing publishes soon. Subscribe
              to be first.
            </p>
            <Link
              href="/newsletter"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-800"
            >
              Subscribe — free
            </Link>
          </div>
        </section>
      )}

      {/* ── Recent briefings rail ── */}
      {recent.length > 0 && (
        <section className="mx-auto max-w-5xl px-5 pb-12 pt-8 sm:px-8 sm:pb-16">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-accent-600">
                Recent briefings
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">
                The week in Disney parks
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {recent.map((post) => (
              <Link
                key={post.slug}
                href={`/guide/${post.slug}`}
                className="group flex h-full flex-col rounded-3xl border border-ink-100 bg-white p-5 shadow-soft transition hover:border-ink-200 hover:shadow-lift sm:p-6"
              >
                <span className="text-[11px] font-medium text-ink-500">
                  {formatBriefingDate(post.date)}
                </span>
                <h3 className="mt-2 text-base font-semibold tracking-tight text-ink-900 group-hover:text-accent-700">
                  {post.title}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-600 line-clamp-3">
                  {post.teaser}
                </p>
                <div className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-accent-700">
                  Read briefing
                  <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
                    <path
                      d="M6 3l5 5-5 5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Newsletter funnel banner ── */}
      <NewsletterCta variant="banner" />

      {/* ── Park shortcut row ── */}
      <section className="border-y border-ink-100 bg-ink-50/40">
        <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-500 sm:shrink-0">
              Or jump straight in
            </p>
            <div className="flex flex-wrap gap-2">
              {PARKS.map((p) => (
                <Link
                  key={p.id}
                  href={`/parks/${p.id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-800 shadow-soft transition hover:border-ink-300 hover:text-ink-900"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      background: `linear-gradient(135deg, ${p.themeHex}, ${p.themeAccentHex})`,
                    }}
                    aria-hidden
                  />
                  {p.shortName}
                </Link>
              ))}
              <Link
                href="/parks"
                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-accent-700 transition hover:text-accent-900"
              >
                See all
                <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
                  <path
                    d="M6 3l5 5-5 5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Evergreen guides — supporting how-tos ── */}
      <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent-600">
            Strategy guides
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
            Evergreen playbooks
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-600 sm:text-base">
            How Parkio works, how to read the Picks card, and what to do
            when waits get rough. Read these once; they pay back every
            visit.
          </p>
        </div>

        {CATEGORY_ORDER.map((cat) => {
          const items = evergreenByCategory[cat];
          if (items.length === 0) return null;
          return (
            <div key={cat} className="mb-10 last:mb-0">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-500">
                {categoryLabel(cat)}
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {items.map((post) => (
                  <Link
                    key={post.slug}
                    href={`/guide/${post.slug}`}
                    className="group flex h-full flex-col rounded-3xl border border-ink-100 bg-white p-5 shadow-soft transition hover:border-ink-200 hover:shadow-lift sm:p-6"
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-accent-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-accent-700 ring-1 ring-accent-100">
                        {categoryLabel(post.category)}
                      </span>
                      <span className="text-[11px] font-medium text-ink-400">
                        {post.readMinutes} min read
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold tracking-tight text-ink-900 group-hover:text-accent-700">
                      {post.title}
                    </h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-600">
                      {post.description}
                    </p>
                    <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent-700">
                      Read guide
                      <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
                        <path
                          d="M6 3l5 5-5 5"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </svg>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {/* ── App-first reminder at the bottom ── */}
      <AppStoreCta variant="banner" />

      <Footer />
    </main>
  );
}

import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { PARKS } from "@/lib/data";
import {
  GUIDE_POSTS,
  type GuideCategory,
  categoryLabel,
  listGuidePosts,
} from "@/lib/guide";

export const metadata = {
  title: "Parkio Guide — Real-time tips for Disney parks",
  description:
    "Live picks, walk-on windows, and parent playbooks for Walt Disney World and Disneyland. Built around Parkio's real-time wait-time engine.",
  alternates: { canonical: "/guide" },
  openGraph: {
    title: "Parkio Guide — Real-time tips for Disney parks",
    description:
      "Live picks, walk-on windows, and parent playbooks for Walt Disney World and Disneyland.",
    type: "website",
    url: "/guide",
  },
};

const CATEGORY_ORDER: GuideCategory[] = ["live", "strategy", "parent"];

export default function GuideIndexPage() {
  const posts = listGuidePosts();
  const byCategory: Record<GuideCategory, typeof posts> = {
    live: [],
    strategy: [],
    parent: [],
  };
  for (const p of posts) byCategory[p.category].push(p);

  return (
    <main className="min-h-screen bg-white">
      <Navbar />

      {/* ── Hero ── */}
      <section className="relative">
        <div className="bg-aurora absolute inset-0 -z-10 opacity-70" />
        <div className="mx-auto max-w-5xl px-5 pb-12 pt-12 sm:px-8 sm:pb-16 sm:pt-16">
          <p className="text-sm font-semibold uppercase tracking-widest text-accent-600">
            Parkio Guide
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
            Real-time tips for Disney parks.
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-600">
            Short, scannable guides built around Parkio's live wait-time
            engine. Each post ends with a one-tap jump into the actual
            park page — because reading about rides isn't riding rides.
          </p>
        </div>
      </section>

      {/* ── Park shortcut row — for readers who'd rather just dive in ── */}
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

      {/* ── Posts grouped by category ── */}
      <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
        {CATEGORY_ORDER.map((cat) => {
          const items = byCategory[cat];
          if (items.length === 0) return null;
          return (
            <div key={cat} className="mb-12 last:mb-0">
              <div className="mb-5 flex items-end justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-accent-600">
                    {categoryLabel(cat)}
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
                    {categoryHeadline(cat)}
                  </h2>
                </div>
                <span className="text-xs font-medium text-ink-400">
                  {items.length} post{items.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {items.map((post) => (
                  <GuideCard key={post.slug} post={post} />
                ))}
              </div>
            </div>
          );
        })}

        {GUIDE_POSTS.length === 0 && (
          <div className="rounded-3xl border border-ink-100 bg-ink-50/40 px-6 py-16 text-center">
            <p className="text-sm text-ink-500">
              New guides coming soon. In the meantime, jump into a park.
            </p>
            <Link
              href="/parks"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-sm font-medium text-white shadow-soft transition hover:bg-ink-800"
            >
              See all parks
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
        )}
      </section>

      <Footer />
    </main>
  );
}

/* ──────────────────────── Sub-views ──────────────────────── */

function categoryHeadline(c: GuideCategory): string {
  switch (c) {
    case "live":
      return "What's working today";
    case "strategy":
      return "Smarter ways to plan a day";
    case "parent":
      return "Built for parents in the parks";
  }
}

function GuideCard({
  post,
}: {
  post: ReturnType<typeof listGuidePosts>[number];
}) {
  return (
    <Link
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
  );
}

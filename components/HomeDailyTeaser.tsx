import Link from "next/link";
import { formatBriefingDate, listDailyPosts } from "@/lib/guideDaily";

/**
 * Homepage teaser for Parkio Daily — surfaces the most recent
 * briefing and links into both the article and the newsletter signup.
 *
 * If no briefings exist yet, a graceful "subscribe to be first" empty
 * state still drives the user to /newsletter.
 */
export function HomeDailyTeaser() {
  const today = listDailyPosts()[0] ?? null;

  return (
    <section className="relative bg-white">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-accent-600">
              Parkio Daily
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              Today in the parks.
            </h2>
            <p className="mt-3 text-base text-ink-600 sm:text-lg">
              A 3-minute Disney parks briefing every morning at 6 AM
              Eastern. Breaking news, big stories, and what's worth your
              time — written for app-first guests.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/newsletter"
                className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-sm font-semibold text-white shadow-lift transition hover:bg-ink-800"
              >
                Subscribe — free
                <Chevron />
              </Link>
              <Link
                href="/guide"
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-3 text-sm font-medium text-accent-700 transition hover:text-accent-900"
              >
                See all briefings →
              </Link>
            </div>
          </div>

          <div className="lg:col-span-7">
            {today ? (
              <FeaturedBriefing
                slug={today.slug}
                title={today.title}
                date={today.date}
                teaser={today.teaser}
              />
            ) : (
              <EmptyTeaser />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturedBriefing({
  slug,
  title,
  date,
  teaser,
}: {
  slug: string;
  title: string;
  date: string;
  teaser: string;
}) {
  return (
    <Link
      href={`/guide/${slug}`}
      className="group block overflow-hidden rounded-3xl border border-ink-100 bg-gradient-to-br from-accent-50 via-white to-emerald-50/30 p-6 shadow-soft transition hover:shadow-lift sm:p-8"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-accent-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-accent-700">
          Today's briefing
        </span>
        <span className="text-[12px] font-medium text-ink-500">
          {formatBriefingDate(date)}
        </span>
      </div>
      <h3 className="mt-3 text-xl font-semibold tracking-tight text-ink-900 group-hover:text-accent-800 sm:text-2xl">
        {title}
      </h3>
      <p className="mt-3 text-base leading-relaxed text-ink-600 line-clamp-3 sm:text-lg">
        {teaser}
      </p>
      <div className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-700">
        Read today's briefing
        <Chevron />
      </div>
    </Link>
  );
}

function EmptyTeaser() {
  return (
    <div className="rounded-3xl border border-ink-100 bg-ink-50/40 p-8 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-accent-600">
        Tomorrow morning
      </p>
      <p className="mt-2 text-lg font-semibold tracking-tight text-ink-900">
        The first briefing publishes soon.
      </p>
      <p className="mt-1 text-sm text-ink-500">Subscribe to be first.</p>
      <Link
        href="/newsletter"
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-800"
      >
        Subscribe — free
      </Link>
    </div>
  );
}

function Chevron() {
  return (
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
  );
}

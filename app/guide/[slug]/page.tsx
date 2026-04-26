import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AppStoreCta } from "@/components/AppStoreCta";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { NewsletterCta } from "@/components/NewsletterCta";
import { getPark } from "@/lib/data";
import {
  type GuideBlock,
  type GuideCta,
  type GuidePost,
  categoryLabel,
  getGuidePost,
  listGuideSlugs,
} from "@/lib/guide";
import {
  type DailyNewsItem,
  type DailyPost,
  type DailySection,
  type DailySpotlightItem,
  type DailyVideoItem,
  formatBriefingDate,
  getDailyPost,
  listDailySlugs,
  sectionEyebrow,
  sectionTitle,
} from "@/lib/guideDaily";

interface GuideDetailProps {
  params: { slug: string };
}

export const dynamicParams = false;

export function generateStaticParams() {
  // Both kinds share the /guide/{slug} URL space.
  const slugs = new Set<string>();
  for (const s of listDailySlugs()) slugs.add(s);
  for (const s of listGuideSlugs()) slugs.add(s);
  return Array.from(slugs).map((slug) => ({ slug }));
}

export function generateMetadata({ params }: GuideDetailProps): Metadata {
  const daily = getDailyPost(params.slug);
  if (daily) return dailyMetadata(daily);

  const evergreen = getGuidePost(params.slug);
  if (evergreen) return evergreenMetadata(evergreen);

  return { title: "Guide" };
}

export default function GuideDetailPage({ params }: GuideDetailProps) {
  const daily = getDailyPost(params.slug);
  if (daily) return <DailyBriefing post={daily} />;

  const evergreen = getGuidePost(params.slug);
  if (evergreen) return <EvergreenGuide post={evergreen} />;

  notFound();
}

/* ════════════════════════════════════════════════════════════════
   Daily briefing renderer
   ════════════════════════════════════════════════════════════════ */

function dailyMetadata(post: DailyPost): Metadata {
  const canonical = `/guide/${post.slug}`;
  return {
    title: `${post.title} · Parkio Daily`,
    description: post.summary,
    alternates: { canonical },
    openGraph: {
      title: post.title,
      description: post.summary,
      type: "article",
      url: canonical,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt ?? post.publishedAt,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.summary,
    },
  };
}

function DailyBriefing({ post }: { post: DailyPost }) {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />

      <article>
        {/* Header */}
        <header className="relative">
          <div className="bg-aurora absolute inset-0 -z-10 opacity-60" />
          <div className="mx-auto max-w-3xl px-5 pb-8 pt-10 sm:px-8 sm:pb-12 sm:pt-14">
            <nav className="text-sm">
              <Link
                href="/guide"
                className="inline-flex items-center gap-1 text-ink-500 transition hover:text-ink-800"
              >
                <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden>
                  <path
                    d="M10 3L5 8l5 5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Parkio Daily
              </Link>
            </nav>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-accent-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-widest text-accent-700">
                Daily briefing
              </span>
              <span className="text-[12px] font-medium text-ink-500">
                {formatBriefingDate(post.publishedAt)}
              </span>
            </div>

            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              {post.title}
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-ink-600">
              {post.summary}
            </p>
          </div>
        </header>

        {/* Top-of-article CTA cluster — three doors into the product */}
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <TopCtaCluster />
        </div>

        {/* Body sections */}
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          {post.sections.map((section, i) => (
            <SectionRenderer key={i} section={section} />
          ))}
        </div>

        {/* Mid-article newsletter CTA */}
        <div className="mx-auto max-w-3xl px-5 pt-10 sm:px-8">
          <NewsletterCta />
        </div>

        {/* End-of-article: read more briefings + open Parkio */}
        <div className="mx-auto max-w-3xl px-5 pb-16 pt-12 sm:px-8 sm:pb-24 sm:pt-16">
          <div className="rounded-3xl bg-ink-900 p-6 text-center text-white shadow-lift sm:p-10">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/60">
              Now go ride
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Open Parkio and let the picks decide.
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-white/70 sm:text-base">
              Live wait times, smart picks, and walk-time hints — same
              data this briefing was built on.
            </p>
            <Link
              href="/parks"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink-900 shadow-lift transition hover:bg-ink-100"
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
          </div>
        </div>
      </article>

      <AppStoreCta variant="banner" />
      <Footer />
    </main>
  );
}

/* ─────────────── Three CTAs at the top of every briefing ─────────────── */

function TopCtaCluster() {
  return (
    <div className="grid grid-cols-1 gap-3 pb-2 sm:grid-cols-3">
      <CtaPill
        href="/parks"
        label="Open Parkio"
        sublabel="Live picks now"
        tone="dark"
      />
      <CtaPill
        href="/waits"
        label="Check live park data"
        sublabel="All 6 parks"
        tone="light"
      />
      <CtaPill
        href="/newsletter"
        label="Get this in your inbox"
        sublabel="Daily, free"
        tone="accent"
      />
    </div>
  );
}

function CtaPill({
  href,
  label,
  sublabel,
  tone,
}: {
  href: string;
  label: string;
  sublabel: string;
  tone: "dark" | "light" | "accent";
}) {
  const styles =
    tone === "dark"
      ? "bg-ink-900 text-white hover:bg-ink-800"
      : tone === "accent"
        ? "bg-accent-50 text-accent-900 ring-1 ring-accent-100 hover:bg-accent-100"
        : "bg-white text-ink-900 ring-1 ring-ink-200 hover:border-ink-300";
  return (
    <Link
      href={href}
      className={`group flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-semibold shadow-soft transition ${styles}`}
    >
      <span className="flex flex-col">
        <span>{label}</span>
        <span
          className={`text-[11px] font-medium ${
            tone === "dark" ? "text-white/60" : "text-ink-500"
          }`}
        >
          {sublabel}
        </span>
      </span>
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" aria-hidden>
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
  );
}

/* ─────────────── Section renderers ─────────────── */

function SectionRenderer({ section }: { section: DailySection }) {
  return (
    <section className="mt-10 first:mt-2">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-accent-600">
        {sectionEyebrow(section.kind)}
      </p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900 sm:text-[26px]">
        {sectionTitle(section.kind)}
      </h2>
      <div className="mt-4 space-y-4">
        {section.kind === "videos"
          ? null /* videos render in a horizontal grid below */
          : section.items.map((item, i) =>
              section.kind === "spotlight" ? (
                <SpotlightItem
                  key={i}
                  item={item as DailySpotlightItem}
                />
              ) : (
                <NewsItemRow
                  key={i}
                  item={item as DailyNewsItem}
                  emphasized={section.kind === "breaking-news"}
                />
              ),
            )}
        {section.kind === "videos" && (
          <VideoRail items={section.items as DailyVideoItem[]} />
        )}
      </div>
    </section>
  );
}

function NewsItemRow({
  item,
  emphasized = false,
}: {
  item: DailyNewsItem;
  emphasized?: boolean;
}) {
  return (
    <article
      className={`rounded-2xl px-4 py-4 sm:px-5 sm:py-5 ${
        emphasized
          ? "bg-rose-50/60 ring-1 ring-rose-100"
          : "bg-white ring-1 ring-ink-100"
      }`}
    >
      <h3 className="text-base font-semibold tracking-tight text-ink-900 sm:text-lg">
        {item.title}
      </h3>
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink-700">
        {item.body}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
        {item.parkSlug && (
          <Link
            href={`/parks/${item.parkSlug}`}
            className="inline-flex items-center gap-1 font-semibold text-accent-700 transition hover:text-accent-900"
          >
            Check live data
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
          </Link>
        )}
        {item.source && (
          <a
            href={item.source.url}
            target="_blank"
            rel="noopener nofollow"
            className="text-ink-500 transition hover:text-ink-800"
          >
            Source: {item.source.label} ↗
          </a>
        )}
      </div>
    </article>
  );
}

function SpotlightItem({ item }: { item: DailySpotlightItem }) {
  const park = item.ctaParkSlug ? getPark(item.ctaParkSlug) : null;
  return (
    <article className="rounded-3xl border border-ink-100 bg-gradient-to-br from-accent-50/60 via-white to-ink-50/30 p-5 sm:p-7">
      <h3 className="text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">
        {item.title}
      </h3>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-700 sm:text-base">
        {item.body}
      </p>
      {item.ctaParkSlug && (
        <Link
          href={`/parks/${item.ctaParkSlug}`}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-ink-800"
          style={
            park
              ? {
                  background: `linear-gradient(135deg, ${park.themeHex}, #4f46e5)`,
                }
              : undefined
          }
        >
          {item.ctaLabel ?? `Open ${park?.shortName ?? "Parkio"}`}
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
      )}
    </article>
  );
}

function VideoRail({ items }: { items: DailyVideoItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((v, i) => (
        <a
          key={i}
          href={v.url}
          target="_blank"
          rel="noopener nofollow"
          className="group block overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-soft transition hover:shadow-lift"
        >
          <div
            className="relative aspect-video bg-ink-100"
            style={
              v.thumbnailUrl
                ? {
                    backgroundImage: `url(${v.thumbnailUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : undefined
            }
            aria-hidden
          >
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ink-900/0 transition group-hover:bg-ink-900/15">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-ink-900 shadow-soft transition group-hover:bg-white">
                <svg viewBox="0 0 16 16" className="h-5 w-5" aria-hidden>
                  <path d="M5 3l8 5-8 5z" fill="currentColor" />
                </svg>
              </span>
            </span>
          </div>
          <div className="p-3 sm:p-4">
            <p className="line-clamp-2 text-sm font-semibold tracking-tight text-ink-900 group-hover:text-accent-700">
              {v.title}
            </p>
            <p className="mt-1 text-[12px] font-medium text-ink-500">
              {v.channel}
            </p>
          </div>
        </a>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Evergreen guide renderer (preserved from existing system)
   ════════════════════════════════════════════════════════════════ */

function evergreenMetadata(post: GuidePost): Metadata {
  const canonical = `/guide/${post.slug}`;
  return {
    title: `${post.title} · Parkio Guide`,
    description: post.description,
    alternates: { canonical },
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      url: canonical,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt ?? post.publishedAt,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
    },
  };
}

function EvergreenGuide({ post }: { post: GuidePost }) {
  const park = post.parkSlug ? getPark(post.parkSlug) : null;
  return (
    <main className="min-h-screen bg-white">
      <Navbar />

      <article>
        <header className="relative">
          <div className="bg-aurora absolute inset-0 -z-10 opacity-60" />
          <div className="mx-auto max-w-3xl px-5 pb-8 pt-10 sm:px-8 sm:pb-12 sm:pt-14">
            <nav className="text-sm">
              <Link
                href="/guide"
                className="inline-flex items-center gap-1 text-ink-500 transition hover:text-ink-800"
              >
                <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden>
                  <path
                    d="M10 3L5 8l5 5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Parkio Guide
              </Link>
            </nav>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-accent-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-widest text-accent-700 ring-1 ring-accent-100">
                {categoryLabel(post.category)}
              </span>
              <span className="text-[12px] font-medium text-ink-500">
                {post.readMinutes} min read
              </span>
            </div>

            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              {post.title}
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-ink-600">
              {post.description}
            </p>
          </div>
        </header>

        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <div className="space-y-6 pb-4">
            {post.blocks.map((block, i) => (
              <BlockRenderer key={i} block={block} />
            ))}
          </div>

          <DoThisNow post={post} parkColor={park?.themeHex} />

          {post.related && post.related.length > 0 && (
            <RelatedLinks links={post.related} />
          )}
        </div>

        <div className="mx-auto max-w-3xl px-5 pb-16 pt-10 sm:px-8 sm:pb-24 sm:pt-12">
          <BottomFunnel post={post} />
        </div>
      </article>

      <Footer />
    </main>
  );
}

function BlockRenderer({ block }: { block: GuideBlock }) {
  switch (block.kind) {
    case "p":
      return (
        <p className="text-base leading-relaxed text-ink-700">{block.body}</p>
      );
    case "h2":
      return (
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900 sm:text-[26px]">
          {block.text}
        </h2>
      );
    case "list":
      return (
        <div>
          {block.intro && (
            <p className="mb-2 text-base leading-relaxed text-ink-700">
              {block.intro}
            </p>
          )}
          <ul className="space-y-2">
            {block.items.map((item, i) => (
              <li
                key={i}
                className="flex gap-3 text-base leading-relaxed text-ink-700"
              >
                <span
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500"
                  aria-hidden
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "tip":
      return (
        <div className="rounded-2xl border border-ink-100 bg-ink-50/40 p-4 sm:p-5">
          <p className="text-sm font-semibold uppercase tracking-widest text-accent-600">
            Tip
          </p>
          <p className="mt-1 text-base font-semibold tracking-tight text-ink-900">
            {block.title}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-600">
            {block.body}
          </p>
        </div>
      );
    case "callout": {
      const tone = block.tone ?? "info";
      const styles =
        tone === "success"
          ? "bg-emerald-50/60 ring-emerald-100 text-emerald-900"
          : tone === "warn"
            ? "bg-amber-50/60 ring-amber-100 text-amber-900"
            : "bg-accent-50/60 ring-accent-100 text-accent-900";
      return (
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ring-1 sm:px-5 sm:py-4 ${styles}`}
        >
          {block.body}
        </div>
      );
    }
  }
}

function DoThisNow({
  post,
  parkColor,
}: {
  post: GuidePost;
  parkColor?: string;
}) {
  return (
    <section
      className="mt-10 rounded-3xl border border-ink-100 bg-gradient-to-br from-accent-50/60 via-white to-ink-50/30 p-5 shadow-soft sm:p-7"
      aria-labelledby="do-this-now"
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-accent-600">
        Action
      </p>
      <h2
        id="do-this-now"
        className="mt-1 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl"
      >
        {post.doThisNow.heading}
      </h2>
      <ol className="mt-4 space-y-2">
        {post.doThisNow.steps.map((step, i) => (
          <li
            key={i}
            className="flex items-start gap-3 text-base leading-relaxed text-ink-800"
          >
            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-500 text-xs font-semibold text-white">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <Link
        href={post.doThisNow.primaryCta.href}
        className="group mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-ink-800"
        style={
          parkColor
            ? {
                background: `linear-gradient(135deg, ${parkColor}, #4f46e5)`,
              }
            : undefined
        }
      >
        {post.doThisNow.primaryCta.label}
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
    </section>
  );
}

function RelatedLinks({ links }: { links: GuideCta[] }) {
  return (
    <section className="mt-10" aria-label="Related">
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-500">
        Keep going
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {links.map((link, i) => (
          <Link
            key={i}
            href={link.href}
            className="group flex items-center justify-between gap-3 rounded-2xl border border-ink-100 bg-white px-4 py-3 text-sm font-medium text-ink-800 shadow-soft transition hover:border-ink-200 hover:text-ink-900"
          >
            <span>{link.label}</span>
            <svg
              viewBox="0 0 16 16"
              className="h-3 w-3 text-ink-400 transition group-hover:translate-x-0.5 group-hover:text-ink-700"
              aria-hidden
            >
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
        ))}
      </div>
    </section>
  );
}

function BottomFunnel({ post }: { post: GuidePost }) {
  return (
    <div className="rounded-3xl border border-ink-100 bg-white px-6 py-8 text-center shadow-soft sm:px-8 sm:py-10">
      <p className="text-sm font-semibold uppercase tracking-widest text-accent-600">
        Ready to ride?
      </p>
      <p className="mt-2 text-lg font-semibold tracking-tight text-ink-900">
        {post.parkSlug
          ? "Parkio's live picks for this park are one tap away."
          : "Pick a park and Parkio Picks will rank the best moves right now."}
      </p>
      <Link
        href={post.doThisNow.primaryCta.href}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-ink-800"
      >
        {post.doThisNow.primaryCta.label}
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
    </div>
  );
}

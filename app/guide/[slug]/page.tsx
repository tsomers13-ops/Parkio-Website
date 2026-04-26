import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { getPark } from "@/lib/data";
import {
  type GuideBlock,
  type GuideCta,
  type GuidePost,
  categoryLabel,
  getGuidePost,
  listGuideSlugs,
} from "@/lib/guide";

interface GuideDetailProps {
  params: { slug: string };
}

export const dynamicParams = false;

export function generateStaticParams() {
  return listGuideSlugs().map((slug) => ({ slug }));
}

export function generateMetadata({ params }: GuideDetailProps): Metadata {
  const post = getGuidePost(params.slug);
  if (!post) return { title: "Guide" };
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

export default function GuideDetailPage({ params }: GuideDetailProps) {
  const post = getGuidePost(params.slug);
  if (!post) notFound();

  const park = post.parkSlug ? getPark(post.parkSlug) : null;

  return (
    <main className="min-h-screen bg-white">
      <Navbar />

      {/* ── Header ── */}
      <article>
        <header className="relative">
          <div className="bg-aurora absolute inset-0 -z-10 opacity-60" />
          <div className="mx-auto max-w-3xl px-5 pb-8 pt-10 sm:px-8 sm:pb-12 sm:pt-14">
            <nav className="text-sm">
              <Link
                href="/guide"
                className="inline-flex items-center gap-1 text-ink-500 transition hover:text-ink-800"
              >
                <svg
                  viewBox="0 0 16 16"
                  className="h-3 w-3"
                  fill="none"
                  aria-hidden
                >
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
              {post.updatedAt && (
                <span className="text-[12px] font-medium text-ink-400">
                  · Updated {formatDate(post.updatedAt)}
                </span>
              )}
            </div>

            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              {post.title}
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-ink-600">
              {post.description}
            </p>
          </div>
        </header>

        {/* ── Body ── */}
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <div className="space-y-6 pb-4">
            {post.blocks.map((block, i) => (
              <BlockRenderer key={i} block={block} />
            ))}
          </div>

          {/* ── Do This Now (the funnel block) ── */}
          <DoThisNow post={post} parkColor={park?.themeHex} />

          {/* ── Related pathways ── */}
          {post.related && post.related.length > 0 && (
            <RelatedLinks links={post.related} />
          )}
        </div>

        {/* ── Bottom park CTA — last chance to send the reader in ── */}
        <div className="mx-auto max-w-3xl px-5 pb-16 pt-10 sm:px-8 sm:pb-24 sm:pt-12">
          <BottomFunnel post={post} />
        </div>
      </article>

      <Footer />
    </main>
  );
}

/* ──────────────────────── Block renderer ──────────────────────── */

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

/* ──────────────────────── Funnel blocks ──────────────────────── */

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
  // Last call: a quieter park-page CTA below the action block, for
  // readers who scrolled past the primary block looking for "what now".
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

/* ──────────────────────── Helpers ──────────────────────── */

function formatDate(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "";
  return new Date(ts).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

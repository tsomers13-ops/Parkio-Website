import Link from "next/link";
import { AppStoreCta } from "@/components/AppStoreCta";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";

export const metadata = {
  title: "Parkio Daily — Daily Disney park briefing in your inbox",
  description:
    "Subscribe to Parkio Daily: a 3-minute Disney parks briefing every morning. Breaking news, big stories, and live picks. Free.",
  alternates: { canonical: "/newsletter" },
  openGraph: {
    title: "Parkio Daily — Daily Disney park briefing in your inbox",
    description:
      "A 3-minute Disney parks briefing every morning. Breaking news, big stories, and live picks. Free.",
    type: "website",
    url: "/newsletter",
  },
};

/**
 * Beehiiv signup configuration — three-tier ladder.
 *
 * Tier 1 — Inline iframe embed (best UX):
 *   NEXT_PUBLIC_BEEHIIV_EMBED_URL = https://embeds.beehiiv.com/{form-id}
 *   (the `src` from Beehiiv's iframe snippet; optional `?slim=true`)
 *
 * Tier 2 — Link out to Beehiiv's hosted subscribe page (interim):
 *   NEXT_PUBLIC_BEEHIIV_SUBSCRIBE_URL = https://parkio.beehiiv.com/subscribe
 *
 * Tier 3 — Neither set: render the "Parkio Daily coming soon." card.
 *
 * The page never POSTs to a Parkio API route — submission is always
 * handled by Beehiiv directly (in the iframe or on their hosted page).
 */
const BEEHIIV_EMBED_URL = process.env.NEXT_PUBLIC_BEEHIIV_EMBED_URL ?? "";
const BEEHIIV_SUBSCRIBE_URL =
  process.env.NEXT_PUBLIC_BEEHIIV_SUBSCRIBE_URL ?? "";

export default function NewsletterPage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />

      <section className="relative">
        <div className="bg-aurora absolute inset-0 -z-10 opacity-70" />
        <div className="mx-auto max-w-3xl px-5 pb-12 pt-12 sm:px-8 sm:pb-16 sm:pt-16">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold uppercase tracking-widest text-accent-600">
              Parkio Daily
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white/70 px-2.5 py-0.5 text-[11px] font-medium text-ink-600 shadow-soft backdrop-blur">
              Free · No spam · Unsubscribe anytime
            </span>
          </div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
            A smarter way to plan
            <br className="hidden sm:block" />
            your park day.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-600">
            Get a daily Disney park briefing every morning at 6 AM.
            Breaking news, big stories, ICYMI, and the most-watched
            Disney videos of the day — written for app-first guests and
            built around Parkio's live data engine.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/parks"
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-800 shadow-soft transition hover:border-ink-300 hover:text-ink-900"
            >
              Use Parkio live in the park →
            </Link>
          </div>
        </div>
      </section>

      {/* Signup card */}
      <section className="mx-auto max-w-3xl px-5 pb-12 sm:px-8 sm:pb-16">
        <div className="overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-lift">
          <div className="bg-gradient-to-br from-accent-50 via-white to-emerald-50/30 px-6 py-8 sm:px-10 sm:py-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-accent-700">
              Subscribe
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
              Get tomorrow's briefing.
            </h2>
            <p className="mt-2 text-sm text-ink-600 sm:text-base">
              Drop your email. The next morning brief lands at 6 AM
              Eastern, with a teaser and a one-tap link to the full post
              on Parkio.
            </p>

            {BEEHIIV_EMBED_URL ? (
              <div className="mt-6 overflow-hidden rounded-2xl border border-ink-100 bg-white">
                {/*
                  Beehiiv's recommended embed: transparent background,
                  no frame border, no internal scroll. Height is set
                  conservatively so the form has room to render before
                  Beehiiv reports its true height — 480px fits both the
                  default and `?slim=true` variants without clipping.
                */}
                <iframe
                  src={BEEHIIV_EMBED_URL}
                  title="Subscribe to Parkio Daily"
                  className="h-[480px] w-full"
                  loading="lazy"
                  scrolling="no"
                  frameBorder={0}
                  style={{ background: "transparent" }}
                />
              </div>
            ) : BEEHIIV_SUBSCRIBE_URL ? (
              <BeehiivHostedCta href={BEEHIIV_SUBSCRIBE_URL} />
            ) : (
              <BeehiivPlaceholder />
            )}
          </div>

          <div className="border-t border-ink-100 bg-ink-50/40 px-6 py-5 text-sm text-ink-600 sm:px-10">
            <p>
              Already a subscriber?{" "}
              <Link
                href="/guide"
                className="font-semibold text-accent-700 hover:text-accent-900"
              >
                Read today's briefing →
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* What's in it */}
      <section className="mx-auto max-w-3xl px-5 pb-16 sm:px-8 sm:pb-20">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent-600">
          What's in each issue
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
          The whole park, in three minutes.
        </h2>

        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PerkItem
            n="01"
            title="Breaking news"
            body="Reopenings, refurb starts, and same-day operational changes."
          />
          <PerkItem
            n="02"
            title="Big news"
            body="Festival entries, event launches, ride milestones."
          />
          <PerkItem
            n="03"
            title="Top stories"
            body="The 3–5 most important things to know across all six parks."
          />
          <PerkItem
            n="04"
            title="ICYMI"
            body="Quiet updates that didn't make headlines but matter for your day."
          />
          <PerkItem
            n="05"
            title="Spotlight"
            body="A featured park, a feature explainer, or a deep dive — with a one-tap path into Parkio."
          />
          <PerkItem
            n="06"
            title="Most watched videos"
            body="Curated YouTube picks — walkthroughs, ride POVs, and overlay reveals."
          />
        </ul>
      </section>

      {/* Reciprocal funnel back into the live product */}
      <AppStoreCta variant="banner" />

      <Footer />
    </main>
  );
}

/**
 * Tier 2 — hosted Beehiiv subscribe page link-out. Used when the
 * iframe embed URL isn't configured but the publication's hosted
 * subscribe URL is. Opens in a new tab so the visitor doesn't lose
 * Parkio context. Submission happens entirely on Beehiiv — no Parkio
 * API route is involved.
 */
function BeehiivHostedCta({ href }: { href: string }) {
  return (
    <div className="mt-6 rounded-2xl border border-ink-100 bg-white p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-accent-700">
        Subscribe via Beehiiv
      </p>
      <p className="mt-2 text-lg font-semibold tracking-tight text-ink-900 sm:text-xl">
        One quick page, then you're done.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink-600 sm:text-base">
        We host the form on Beehiiv directly — drop your email there and
        the next morning's briefing lands at 6 AM Eastern.
      </p>
      <a
        href={href}
        target="_blank"
        rel="noopener"
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-sm font-semibold text-white shadow-lift transition hover:bg-ink-800"
      >
        Subscribe on Beehiiv
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
          {/* External-link arrow — signals the new-tab behavior */}
          <path
            d="M5 11l6-6M7 5h4v4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </a>
      <p className="mt-3 text-xs text-ink-500">
        Opens parkio.beehiiv.com in a new tab. Free · No spam · Unsubscribe
        anytime.
      </p>
    </div>
  );
}

function BeehiivPlaceholder() {
  // Shown only when NEXT_PUBLIC_BEEHIIV_EMBED_URL is missing in the
  // environment. Deliberately renders NO form — there's no API route
  // to accept submissions, so the safest fallback is a static card
  // that funnels visitors into the live product instead.
  return (
    <div className="mt-6 rounded-2xl border border-ink-100 bg-white p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-accent-700">
        Coming soon
      </p>
      <p className="mt-2 text-lg font-semibold tracking-tight text-ink-900 sm:text-xl">
        Parkio Daily coming soon.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink-600 sm:text-base">
        Email signup is being wired up. In the meantime, every briefing
        publishes here at 6 AM Eastern — bookmark{" "}
        <Link
          href="/guide"
          className="font-semibold text-accent-700 hover:text-accent-900"
        >
          /guide
        </Link>{" "}
        to read today's.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link
          href="/guide"
          className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ink-800"
        >
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
        </Link>
        <Link
          href="/parks"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-2.5 text-sm font-medium text-accent-700 transition hover:text-accent-900"
        >
          Or open Parkio →
        </Link>
      </div>
    </div>
  );
}

function PerkItem({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  return (
    <li className="rounded-2xl border border-ink-100 bg-white p-5 shadow-soft">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-accent-600">
        {n}
      </p>
      <p className="mt-1 text-base font-semibold tracking-tight text-ink-900">
        {title}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-ink-600">{body}</p>
    </li>
  );
}

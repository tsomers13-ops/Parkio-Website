import Link from "next/link";

/**
 * Parent-focused section. The pain point: missing the 3:15 PM
 * Cinderella appearance because you were watching wait times. Parkio's
 * Happening Soon section solves exactly that — surfaced here as a
 * concrete, one-screen answer.
 */
export function HomeParents() {
  return (
    <section className="relative overflow-hidden bg-white">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-12">
          {/* Copy column */}
          <div className="lg:col-span-7">
            <p className="text-xs font-semibold uppercase tracking-widest text-rose-600">
              For parents
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              Don't miss a princess.
              <br />
              <span className="bg-gradient-to-br from-rose-500 to-amber-500 bg-clip-text text-transparent">
                Don't miss a parade.
              </span>
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-600 sm:text-lg">
              Princess meets aren't queue rides — they're scheduled
              appearances. Parkio's Happening Soon surfaces shows,
              parades, and character meets starting in the next 90
              minutes, sorted by soonest first.
            </p>

            <ul className="mt-6 space-y-3">
              <FeatureRow
                emoji="👑"
                title="Character meets"
                body="Cinderella, Mickey, Tiana, Belle — see who's on next, not who was on yesterday."
              />
              <FeatureRow
                emoji="🎭"
                title="Shows + parades"
                body="Festival of Fantasy, Happily Ever After — scheduled in the right order."
              />
              <FeatureRow
                emoji="⏱"
                title="Next 90 minutes only"
                body="Not a calendar. The page shows what's starting now-ish, with a clock — so you can pick something realistic."
              />
            </ul>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/parks/magic-kingdom"
                className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-sm font-semibold text-white shadow-lift transition hover:bg-ink-800"
              >
                Open Magic Kingdom
                <Chevron />
              </Link>
              <Link
                href="/guide/princess-meet-greets-magic-kingdom-parents"
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-3 text-sm font-medium text-accent-700 transition hover:text-accent-900"
              >
                Read the parent's playbook →
              </Link>
            </div>
          </div>

          {/* Mock card — Happening Soon preview */}
          <div className="lg:col-span-5">
            <HappeningSoonMock />
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureRow({
  emoji,
  title,
  body,
}: {
  emoji: string;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-3">
      <span
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-50 text-base ring-1 ring-rose-100"
        aria-hidden
      >
        {emoji}
      </span>
      <div>
        <p className="text-base font-semibold tracking-tight text-ink-900">
          {title}
        </p>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-600">{body}</p>
      </div>
    </li>
  );
}

function HappeningSoonMock() {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 translate-y-3 rounded-[2.5rem] bg-gradient-to-br from-rose-300/30 via-amber-300/20 to-pink-300/20 blur-2xl"
      />
      <div className="rounded-3xl border border-ink-100 bg-white p-5 shadow-lift sm:p-7">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-rose-600">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
          </span>
          Happening soon
        </div>
        <p className="mt-2 text-base font-semibold tracking-tight text-ink-900">
          Don't miss the next show
        </p>
        <p className="mt-1 text-xs text-ink-500">
          Magic Kingdom · next 90 minutes
        </p>

        <ul className="mt-4 space-y-3">
          <SoonRow
            tone="rose"
            emoji="👑"
            name="Meet Cinderella"
            time="Starts in 12 min · 3:15 PM"
          />
          <SoonRow
            tone="accent"
            emoji="🎭"
            name="Festival of Fantasy Parade"
            time="Starts in 25 min · 3:30 PM"
          />
          <SoonRow
            tone="accent"
            emoji="🎭"
            name="Mickey's Magical Friendship Faire"
            time="Starts in 47 min · 3:45 PM"
          />
        </ul>
      </div>
    </div>
  );
}

function SoonRow({
  tone,
  emoji,
  name,
  time,
}: {
  tone: "rose" | "accent";
  emoji: string;
  name: string;
  time: string;
}) {
  const badge =
    tone === "rose"
      ? "bg-rose-50 text-rose-600 ring-rose-100"
      : "bg-accent-50 text-accent-700 ring-accent-100";
  return (
    <li className="flex items-center gap-3">
      <span
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ring-1 ${badge}`}
        aria-hidden
      >
        {emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold tracking-tight text-ink-900">
          {name}
        </p>
        <p className="text-[12px] text-ink-500 tabular-nums">{time}</p>
      </div>
    </li>
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

"use client";

import { useState } from "react";

interface QA {
  q: string;
  a: React.ReactNode;
}

const FAQS: QA[] = [
  {
    q: "Which parks does Parkio cover?",
    a: (
      <>
        All six U.S. Disney parks: Magic Kingdom, EPCOT, Hollywood Studios,
        and Animal Kingdom at Walt Disney World, plus Disneyland Park and
        Disney California Adventure at Disneyland Resort.
      </>
    ),
  },
  {
    q: "Where do the wait times come from?",
    a: (
      <>
        Parkio aggregates real-time data from a public theme-park data
        source (themeparks.wiki) through our own API. Numbers are
        normalized, cached for ~5 minutes at the edge, and update
        automatically on the live map.
      </>
    ),
  },
  {
    q: "Is Parkio affiliated with Disney?",
    a: (
      <>
        No. Parkio is an independent app and is not affiliated with or
        endorsed by Disney. All ride and park names belong to The Walt
        Disney Company.
      </>
    ),
  },
  {
    q: "Why is one of the rides showing “Down” or “Refurb”?",
    a: (
      <>
        That status comes from the upstream feed when an attraction is
        temporarily closed for an outage or scheduled refurbishment. As
        soon as the ride re-opens, Parkio picks it back up — usually
        within a few minutes.
      </>
    ),
  },
  {
    q: "Why does a ride show “—” instead of a wait time?",
    a: (
      <>
        That means the ride is operating but didn't report a standby wait
        in the most recent data pull. This commonly happens with
        virtual-queue-only attractions or right at park open.
      </>
    ),
  },
  {
    q: "Is there a Parkio iPhone app?",
    a: (
      <>
        Coming soon. Parkio's website and iPhone app share the same
        Parkio API, so launches stay in sync.
      </>
    ),
  },
];

export function FAQ() {
  return (
    <section
      id="faq"
      className="relative border-t border-ink-100 bg-ink-50/50 py-20 sm:py-28"
    >
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-accent-600">
            FAQ
          </p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
            Questions, answered.
          </h2>
        </div>

        <div className="mt-12 divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-soft">
          {FAQS.map((item, i) => (
            <FAQItem key={i} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQItem({ item }: { item: QA }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-6 px-5 py-5 text-left transition hover:bg-ink-50/60 sm:px-7"
        aria-expanded={open}
      >
        <span className="text-base font-semibold tracking-tight text-ink-900">
          {item.q}
        </span>
        <span
          className={`mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-700 transition-transform ${
            open ? "rotate-45" : ""
          }`}
          aria-hidden
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
            <path
              d="M8 3v10M3 8h10"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </button>
      <div
        className={`grid transition-all duration-300 ease-out ${
          open
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-6 text-sm leading-relaxed text-ink-600 sm:px-7">
            {item.a}
          </div>
        </div>
      </div>
    </div>
  );
}

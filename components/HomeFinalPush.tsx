import Link from "next/link";

import {
  APP_DOWNLOAD_CTA_ATTR,
  APP_STORE_LIVE,
  APP_STORE_URL,
} from "@/lib/appStore";
import { AppleGlyph } from "@/components/icons";

const APP_LIVE = APP_STORE_LIVE;

/**
 * Last-call homepage CTA. Dark, dominant, App Store as the headline
 * action. Falls back to "Open Parkio" until the App Store URL is set.
 *
 * Design: full-bleed dark surface, big typography, single primary
 * action. Secondary "open on the web" link is intentionally quieter
 * — the goal of THIS section is the download.
 */
export function HomeFinalPush() {
  return (
    <section className="relative overflow-hidden bg-ink-950">
      {/* Aurora glow */}
      <div
        aria-hidden
        className="absolute inset-0 -z-0 opacity-80"
        style={{
          backgroundImage:
            "radial-gradient(50% 50% at 20% 30%, rgba(99,102,241,0.45) 0%, transparent 60%), radial-gradient(50% 50% at 80% 70%, rgba(56,189,248,0.40) 0%, transparent 60%), radial-gradient(40% 40% at 50% 100%, rgba(244,114,182,0.30) 0%, transparent 60%)",
        }}
      />

      <div className="relative mx-auto max-w-5xl px-5 py-20 text-center sm:px-8 sm:py-28">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/60">
          Your day, simpler
        </p>
        <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
          Plan less.
          <br />
          <span className="bg-gradient-to-br from-accent-400 to-sky-300 bg-clip-text text-transparent">
            Ride more.
          </span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-base text-white/70 sm:text-lg">
          Live wait times, smart picks, and a clean park map — designed
          for one-handed use. Free. Built for iPhone.
        </p>

        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <PrimaryAction />
          <Link
            href="/parks"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-3.5 text-sm font-medium text-white/90 backdrop-blur transition hover:bg-white/10"
          >
            Open in app
          </Link>
        </div>

        <p className="mt-5 text-xs text-white/40">
          {APP_LIVE
            ? "Available on iPhone · Free · No account required to use"
            : "Coming to the App Store · Open the web app today, free"}
        </p>
      </div>
    </section>
  );
}

function PrimaryAction() {
  if (APP_LIVE) {
    return (
      <Link
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener"
        data-cta={APP_DOWNLOAD_CTA_ATTR}
        className="group inline-flex items-center justify-center gap-2.5 rounded-full bg-white px-7 py-4 text-base font-semibold text-ink-900 shadow-lift transition hover:bg-ink-100 active:scale-[0.98]"
      >
        <AppleGlyph />
        Download Parkio
      </Link>
    );
  }
  return (
    <Link
      href="/parks"
      data-cta={APP_DOWNLOAD_CTA_ATTR}
      className="group inline-flex items-center justify-center gap-2.5 rounded-full bg-white px-7 py-4 text-base font-semibold text-ink-900 shadow-lift transition hover:bg-ink-100 active:scale-[0.98]"
    >
      Download Parkio
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
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

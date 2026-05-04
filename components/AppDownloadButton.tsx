import Link from "next/link";

import {
  APP_DOWNLOAD_CTA_ATTR,
  APP_STORE_LIVE,
  APP_STORE_URL,
} from "@/lib/appStore";

type Tone = "dark" | "light" | "ghost";
type Size = "md" | "lg";

interface AppDownloadButtonProps {
  /**
   * "dark"  — dark pill on light surfaces (default)
   * "light" — white pill on dark surfaces (for hero/banner contexts)
   * "ghost" — quiet outlined pill for tight inline strips
   */
  tone?: Tone;
  /** "md" for in-flow inline buttons, "lg" for hero / final-push moments. */
  size?: Size;
  /** Optional label override. Defaults to "Download Parkio". */
  label?: string;
  /** Adds an extra wrapper className for one-off layout tweaks. */
  className?: string;
  /** Optional aria-label override (e.g., for icon-only contexts). */
  ariaLabel?: string;
}

/**
 * Single primary CTA for App Store conversion.
 *
 * One button, one source of truth (`lib/appStore`), one tracking
 * attribute (`data-cta="app-download"`). Used in hero rows, inline
 * strips, and conversion stacks across the site so analytics and
 * label changes only ever happen in one place.
 *
 * - Always opens the App Store URL in a new tab when live.
 * - Applies `noopener` for safety on external nav.
 * - Mobile-friendly tap target (44px+) at every size.
 *
 * Note: this is a button primitive, not a layout primitive — it
 * intentionally does not introduce new card/section visuals.
 */
export function AppDownloadButton({
  tone = "dark",
  size = "md",
  label = "Download Parkio",
  className,
  ariaLabel,
}: AppDownloadButtonProps) {
  const sizeClasses =
    size === "lg"
      ? "px-6 py-3.5 text-base gap-2.5"
      : "px-5 py-3 text-sm gap-2";

  const toneClasses =
    tone === "light"
      ? "bg-white text-ink-900 hover:bg-ink-100 shadow-lift"
      : tone === "ghost"
        ? "bg-white/5 text-white/90 ring-1 ring-white/15 backdrop-blur hover:bg-white/10"
        : "bg-ink-900 text-white hover:bg-ink-800 shadow-lift";

  const externalProps = APP_STORE_LIVE
    ? { target: "_blank" as const, rel: "noopener" as const }
    : {};

  return (
    <Link
      href={APP_STORE_URL}
      data-cta={APP_DOWNLOAD_CTA_ATTR}
      aria-label={ariaLabel ?? label}
      className={`inline-flex items-center justify-center rounded-full font-semibold transition active:scale-[0.98] ${sizeClasses} ${toneClasses} ${className ?? ""}`}
      {...externalProps}
    >
      {APP_STORE_LIVE && <AppleGlyph size={size} />}
      <span>{label}</span>
    </Link>
  );
}

function AppleGlyph({ size }: { size: Size }) {
  const cls = size === "lg" ? "h-5 w-5" : "h-4 w-4";
  return (
    <svg viewBox="0 0 24 24" className={cls} fill="currentColor" aria-hidden>
      <path d="M16.5 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.9-3.1-.9-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.7 2.5 3 2.5 1.2 0 1.7-.8 3.2-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.5-1-2.5-3.7zM14.3 5.6c.7-.8 1.2-2 1.1-3.2-1 0-2.3.7-3 1.5-.6.7-1.2 1.9-1.1 3.1 1.1.1 2.3-.6 3-1.4z" />
    </svg>
  );
}

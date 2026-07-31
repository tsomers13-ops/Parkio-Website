import Link from "next/link";

import {
  APP_DOWNLOAD_CTA_ATTR,
  APP_STORE_LIVE,
  APP_STORE_URL,
} from "@/lib/appStore";
import { AppleGlyph } from "@/components/icons";

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
      {APP_STORE_LIVE && (
        <AppleGlyph className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} />
      )}
      <span>{label}</span>
    </Link>
  );
}

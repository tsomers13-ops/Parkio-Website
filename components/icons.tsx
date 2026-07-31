/**
 * Shared inline SVG glyphs.
 *
 * These used to be re-declared (identically) inside a dozen different
 * components. Keeping one copy means a path tweak lands everywhere at
 * once; per-call-site sizing/colour still happens through `className`.
 */

export interface IconProps {
  className?: string;
}

/** Right-pointing chevron used on links, cards and list rows. */
export function Chevron({
  className = "h-3.5 w-3.5",
  strokeWidth = 1.8,
}: IconProps & { strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path
        d="M6 3l5 5-5 5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Apple logo used on every App Store call-to-action. */
export function AppleGlyph({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M16.5 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.9-3.1-.9-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.7 2.5 3 2.5 1.2 0 1.7-.8 3.2-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.5-1-2.5-3.7zM14.3 5.6c.7-.8 1.2-2 1.1-3.2-1 0-2.3.7-3 1.5-.6.7-1.2 1.9-1.1 3.1 1.1.1 2.3-.6 3-1.4z" />
    </svg>
  );
}

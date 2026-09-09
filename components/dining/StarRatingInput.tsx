"use client";

/**
 * Whole-star input, 1–5.
 *
 * Built on real radio inputs rather than clickable SVGs: that gives keyboard
 * arrow-key navigation, screen-reader announcement and focus handling from the
 * platform instead of reimplementing them badly. The stars are the labels.
 */

const STARS = [1, 2, 3, 4, 5] as const;

interface Props {
  name: string;
  /** Visible label, e.g. "Overall". */
  label: string;
  value: number | null;
  onChange: (value: number) => void;
  /** Optional dimensions say so, so nobody invents an opinion to proceed. */
  optional?: boolean;
}

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={`h-8 w-8 transition ${filled ? "text-amber-500" : "text-ink-200"}`}
      fill="currentColor"
    >
      <path d="M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.2l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.6z" />
    </svg>
  );
}

export function StarRatingInput({ name, label, value, onChange, optional }: Props) {
  return (
    <fieldset className="border-0 p-0">
      <legend className="flex items-baseline gap-2 text-sm font-medium text-ink-900">
        {label}
        {optional && <span className="text-xs font-normal text-ink-500">Optional</span>}
      </legend>

      <div className="mt-1.5 flex items-center gap-1">
        {STARS.map((star) => {
          const id = `${name}-${star}`;
          const selected = value === star;
          return (
            <span key={star} className="relative">
              {/* Visually hidden but focusable and announced. */}
              <input
                type="radio"
                id={id}
                name={name}
                value={star}
                checked={selected}
                onChange={() => onChange(star)}
                className="peer absolute h-px w-px overflow-hidden opacity-0"
              />
              <label
                htmlFor={id}
                // 44px tap target on phones even though the star art is 32px.
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-600"
              >
                <span className="sr-only">{`${label} rating: ${star} out of 5`}</span>
                <Star filled={value !== null && star <= value} />
              </label>
            </span>
          );
        })}

        {/* Text, not colour alone, communicates the current selection. */}
        <span className="ml-2 text-sm text-ink-600" aria-hidden="true">
          {value === null ? "Not rated" : `${value}/5`}
        </span>
      </div>
    </fieldset>
  );
}

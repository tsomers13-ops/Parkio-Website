import type { Park } from "@/lib/types";

/**
 * Two-way orientation at the top of the park page.
 *
 * Ordinary in-page anchors, not tabs — the planning content is already
 * on the page, and "#in-park" is the live section's disclosure.
 */
export function ParkJumpActions({ park }: { park: Park }) {
  return (
    <nav
      aria-label={`${park.name} sections`}
      className="mx-auto max-w-5xl px-5 pb-2 sm:px-8"
    >
      <ul className="flex flex-wrap gap-3">
        <li>
          <a
            href="#plan"
            className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-white shadow-soft transition hover:bg-ink-800 active:scale-[0.98]"
          >
            Plan your visit
          </a>
        </li>
        <li>
          <a
            href="#in-park"
            className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-5 py-3 text-sm font-medium text-ink-800 shadow-soft transition hover:border-ink-300 hover:bg-ink-50"
          >
            In the park now
          </a>
        </li>
      </ul>
    </nav>
  );
}

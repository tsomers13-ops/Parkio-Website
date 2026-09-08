import Link from "next/link";
import type { Park, Ride } from "@/lib/types";

/**
 * Parks › {Park} › {Attraction}
 *
 * Server-safe. The current attraction is the page itself, so it is plain
 * text with aria-current rather than a self-link. Visible UX only —
 * BreadcrumbList structured data lands in a later slice.
 */
export function AttractionBreadcrumb({
  park,
  ride,
}: {
  park: Park;
  ride: Ride;
}) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-500">
        <li>
          <Link
            href="/parks"
            className="rounded font-medium text-ink-600 underline-offset-4 transition hover:text-ink-900 hover:underline"
          >
            Parks
          </Link>
        </li>
        <li aria-hidden className="text-ink-300">
          ›
        </li>
        <li>
          <Link
            href={`/parks/${park.id}`}
            className="rounded font-medium text-ink-600 underline-offset-4 transition hover:text-ink-900 hover:underline"
          >
            {park.name}
          </Link>
        </li>
        <li aria-hidden className="text-ink-300">
          ›
        </li>
        <li aria-current="page" className="font-medium text-ink-900">
          {ride.name}
        </li>
      </ol>
    </nav>
  );
}

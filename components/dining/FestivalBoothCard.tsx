import { Chip } from "@/components/dining/DiningFacts";
import type { FestivalBooth, PermanentDiningVenue } from "@/lib/diningTypes";
import { menuItemKindLabel } from "@/lib/diningTypes";

export interface BoothView {
  booth: FestivalBooth;
  /** "active" | "upcoming" — expired booths are not passed in. */
  status: "active" | "upcoming";
  opensOn: string | null;
  host: PermanentDiningVenue | null;
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

export function formatOpeningDate(isoDate: string): string {
  return DATE_FMT.format(new Date(`${isoDate}T00:00:00Z`));
}

/**
 * One festival marketplace, with its menu behind a native <details>
 * disclosure — keyboard accessible with no JavaScript, which matters when 45
 * of these sit on one page.
 *
 * Disney's item names and price strings are printed verbatim. A price range
 * stays a range.
 */
export function FestivalBoothCard({ view }: { view: BoothView }) {
  const { booth, status, opensOn, host } = view;
  const items = booth.menu;

  return (
    <li className="rounded-2xl border border-ink-100 bg-white shadow-soft">
      <div className="px-4 pt-4">
        <span className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
            Festival
          </span>
          {status === "upcoming" && opensOn && (
            <span className="rounded-full border border-ink-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-600">
              Opens {formatOpeningDate(opensOn)}
            </span>
          )}
        </span>

        <h4 className="mt-2 text-base font-semibold text-ink-900">{booth.name}</h4>
        <p className="mt-0.5 text-sm text-ink-600">{booth.locationText}</p>

        {host && (
          <p className="mt-2 text-sm text-ink-600">
            Festival offerings at{" "}
            <span className="font-medium text-ink-900">{host.name}</span>, a
            year-round location.
          </p>
        )}
      </div>

      <details className="group mt-3 border-t border-ink-100">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-accent-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600">
          <span>
            {items.length} {items.length === 1 ? "item" : "items"}
          </span>
          <span aria-hidden="true" className="text-ink-500 transition group-open:rotate-180">
            ▾
          </span>
        </summary>

        <ul className="space-y-2 px-4 pb-4">
          {items.map((item) => {
            const kind = menuItemKindLabel(item.itemKind);
            return (
              <li
                key={item.id}
                className="flex items-baseline justify-between gap-4 border-t border-ink-50 pt-2 first:border-t-0 first:pt-0"
              >
                <span className="min-w-0">
                  <span className="block text-sm text-ink-900">{item.name}</span>
                  <span className="mt-0.5 flex flex-wrap gap-x-2 gap-y-1">
                    {kind && <Chip>{kind}</Chip>}
                    {item.plantBased && <Chip>Plant-based</Chip>}
                  </span>
                </span>
                {item.price && (
                  <span className="shrink-0 whitespace-nowrap text-sm font-medium tabular-nums text-ink-700">
                    {item.price.display}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </details>
    </li>
  );
}

import { AppDownloadButton } from "@/components/AppDownloadButton";

/**
 * Subtle inline App Store CTA for the bottom of /parks/[parkId].
 *
 * Two-line strip — eyebrow + headline + button — designed to slot
 * between ParkInsights and the Footer without competing with the
 * map. Inline (not sticky) so it never obstructs the live park map
 * which is the core of the page experience.
 *
 * Copy is fixed: "Get live recommendations → Download Parkio" per the
 * conversion brief. Uses the shared AppDownloadButton so URL and
 * tracking stay in sync with every other download CTA.
 */
export function ParkPageAppCta() {
  return (
    <section className="mx-auto max-w-7xl px-5 pb-10 pt-6 sm:px-8 sm:pb-12 sm:pt-8">
      <div className="flex flex-col items-start justify-between gap-4 rounded-3xl border border-ink-100 bg-white p-5 shadow-soft sm:flex-row sm:items-center sm:p-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent-700">
            Get live recommendations
          </p>
          <p className="mt-1 text-base font-semibold tracking-tight text-ink-900 sm:text-lg">
            Parkio for iPhone — best ride next, in your pocket.
          </p>
        </div>
        <AppDownloadButton tone="dark" size="md" />
      </div>
    </section>
  );
}

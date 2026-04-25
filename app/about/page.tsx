import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";

export const metadata = {
  title: "About — Parkio",
  description:
    "Parkio is an independent live-data app for U.S. Disney parks. We make it dramatically easier to plan your day at the parks.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About Parkio",
    description: "An independent live-data app for U.S. Disney parks.",
    type: "website",
    url: "/about",
  },
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />

      <section className="relative">
        <div className="bg-aurora absolute inset-0 -z-10 opacity-70" />
        <div className="mx-auto max-w-3xl px-5 pb-20 pt-12 sm:px-8 sm:pb-28 sm:pt-16">
          <p className="text-sm font-medium uppercase tracking-widest text-accent-600">
            About
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
            A faster way to do a day at Disney.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-ink-600">
            Parkio is an independent app for live wait times at the six
            U.S. Disney parks. We make it dramatically easier to figure
            out what to ride next without overthinking it — real-time
            data, a clean map, and almost no taps to value.
          </p>

          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            <Section title="What Parkio does">
              <p>
                Aggregates and normalizes live wait times from public
                theme-park data so you can scan the whole park in
                seconds. Includes ride status (Down / Refurb / Closed),
                today's hours, and a glanceable map.
              </p>
            </Section>
            <Section title="What Parkio doesn't do">
              <p>
                We don't sell tickets, sell data, run ads, or require an
                account. There's no upsell flow. We're not affiliated
                with Disney.
              </p>
            </Section>
            <Section title="Built by">
              <p>
                A tiny independent team of Disney park fans who got
                tired of fighting the official app on a hot afternoon.
              </p>
            </Section>
            <Section title="Coming next">
              <p>
                A native iPhone app that consumes the same Parkio API
                you can browse on{" "}
                <Link
                  href="/developers"
                  className="font-medium text-ink-900 underline-offset-2 hover:underline"
                >
                  /developers
                </Link>
                . Push notifications for ride drops are on the
                wishlist after that.
              </p>
            </Section>
          </div>

          <div className="mt-14 rounded-3xl border border-ink-100 bg-white p-6 shadow-soft sm:p-8">
            <h2 className="text-base font-semibold tracking-tight text-ink-900">
              Disclaimer
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">
              Parkio is an independent app and is not affiliated with
              or endorsed by Disney. All ride and park names belong to
              The Walt Disney Company. Wait time data is provided
              by{" "}
              <a
                href="https://themeparks.wiki"
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-ink-900 underline-offset-2 hover:underline"
              >
                themeparks.wiki
              </a>
              .
            </p>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/parks"
              className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-4 py-2.5 text-sm font-medium text-white shadow-soft transition hover:bg-ink-800"
            >
              Open Parkio
              <svg
                viewBox="0 0 16 16"
                fill="none"
                className="h-3.5 w-3.5"
                aria-hidden
              >
                <path
                  d="M6 3l5 5-5 5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <Link
              href="/support"
              className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-4 py-2.5 text-sm font-medium text-ink-800 shadow-soft transition hover:border-ink-300 hover:bg-ink-50"
            >
              Contact support
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-base font-semibold tracking-tight text-ink-900">
        {title}
      </h2>
      <div className="mt-2 text-sm leading-relaxed text-ink-600">
        {children}
      </div>
    </section>
  );
}

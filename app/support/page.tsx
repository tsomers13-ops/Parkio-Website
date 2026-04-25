import Link from "next/link";
import { Footer } from "@/components/Footer";
import { LegalLayout, LegalSection } from "@/components/LegalLayout";
import { Navbar } from "@/components/Navbar";

const SUPPORT_EMAIL = "parkio.support@gmail.com";

export const metadata = {
  title: "Support",
  description:
    "Need help, have feedback, or found a bug in Parkio? Reach the team here.",
  alternates: { canonical: "/support" },
};

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <LegalLayout
        eyebrow="Support"
        title="We're here to help."
        intro="If you need help, have feedback, or found a bug, reach out — we read every message."
      >
        <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-soft sm:p-8">
          <div className="text-[11px] font-medium uppercase tracking-widest text-ink-500">
            Contact
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-2xl font-semibold tracking-tight text-ink-900 hover:text-accent-600"
            >
              {SUPPORT_EMAIL}
            </a>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-4 py-2.5 text-sm font-medium text-white shadow-soft transition hover:bg-ink-800 active:scale-[0.98]"
            >
              Send email
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
            </a>
          </div>
          <p className="mt-3 text-sm text-ink-500">
            Typical response: within 1–2 business days.
          </p>
        </div>

        <LegalSection title="About the app">
          <p>
            Parkio helps you plan your day at the parks with smart
            recommendations, real-time wait times, and a personalized ride
            plan.
          </p>
        </LegalSection>

        <LegalSection title="Common questions">
          <div>
            <h3 className="font-semibold text-ink-900">
              Is this affiliated with Disney?
            </h3>
            <p className="mt-1">
              No. Parkio is an independent app and is not affiliated with or
              endorsed by Disney.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-ink-900">
              My wait times look wrong
            </h3>
            <p className="mt-1">
              Wait times are pulled from third-party data sources and may vary
              slightly from in-park displays. We update as often as the source
              allows, but reality is messy — please cross-check with the
              official park signage when it matters.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-ink-900">
              Which parks are supported?
            </h3>
            <p className="mt-1">
              All four Walt Disney World parks (Magic Kingdom, EPCOT, Hollywood
              Studios, Animal Kingdom) and both Disneyland Resort parks
              (Disneyland Park, Disney California Adventure).
            </p>
          </div>
        </LegalSection>

        <LegalSection title="Feedback">
          <p>
            Have an idea or a feature request? We'd love to hear it.{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-medium text-accent-600 underline-offset-2 hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
        </LegalSection>

        <div className="rounded-2xl border border-ink-100 bg-ink-50/60 px-5 py-4 text-sm text-ink-600">
          Looking for our{" "}
          <Link
            href="/privacy"
            className="font-medium text-ink-900 underline-offset-2 hover:underline"
          >
            Privacy Policy
          </Link>
          ?
        </div>
      </LegalLayout>
      <Footer />
    </main>
  );
}

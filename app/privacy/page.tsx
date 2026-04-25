import Link from "next/link";
import { Footer } from "@/components/Footer";
import { LegalLayout, LegalSection } from "@/components/LegalLayout";
import { Navbar } from "@/components/Navbar";

const SUPPORT_EMAIL = "parkio.support@gmail.com";

export const metadata = {
  title: "Privacy Policy · Parkio",
  description:
    "How Parkio handles your information. Short version: we don't collect personal data.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <LegalLayout
        eyebrow="Legal"
        title="Privacy Policy"
        intro={`This Privacy Policy describes how Parkio ("we", "our", or "us") handles your information.`}
        updated="April 24, 2026"
      >
        <LegalSection title="Information we collect">
          <p>
            We do not collect personal information such as your name, email,
            or account details.
          </p>
          <p>The app may process limited data locally on your device, such as:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li>Ride selections</li>
            <li>App usage preferences</li>
          </ul>
          <p>
            If location services are used, your location is only used on-device
            to provide features such as distance-based recommendations. We do
            not store or transmit your location data.
          </p>
        </LegalSection>

        <LegalSection title="How we use information">
          <p>Any data used by the app is used solely to:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li>Provide ride recommendations</li>
            <li>Improve your in-app experience</li>
          </ul>
        </LegalSection>

        <LegalSection title="Data sharing">
          <p>
            We do not sell, trade, or share your personal information with
            third parties.
          </p>
        </LegalSection>

        <LegalSection title="Third-party services">
          <p>
            The app may use third-party data sources to retrieve ride wait
            times. These services may have their own privacy policies.
          </p>
        </LegalSection>

        <LegalSection title="Data security">
          <p>
            We take reasonable measures to protect your information. However,
            no method of transmission or storage is 100% secure.
          </p>
        </LegalSection>

        <LegalSection title="Children's privacy">
          <p>
            This app does not knowingly collect personal data from children.
          </p>
        </LegalSection>

        <LegalSection title="Changes to this policy">
          <p>We may update this Privacy Policy from time to time.</p>
        </LegalSection>

        <LegalSection title="Contact us">
          <p>
            If you have questions, contact us at:{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-medium text-accent-600 underline-offset-2 hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
        </LegalSection>

        <div className="rounded-2xl border border-ink-100 bg-ink-50/60 px-5 py-4 text-sm text-ink-600">
          Looking for{" "}
          <Link
            href="/support"
            className="font-medium text-ink-900 underline-offset-2 hover:underline"
          >
            Support
          </Link>
          ?
        </div>
      </LegalLayout>
      <Footer />
    </main>
  );
}

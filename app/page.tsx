import { Footer } from "@/components/Footer";
import { HomeDailyTeaser } from "@/components/HomeDailyTeaser";
import { HomeFinalPush } from "@/components/HomeFinalPush";
import { HomeHero } from "@/components/HomeHero";
import { HomeOutcomes } from "@/components/HomeOutcomes";
import { HomeParents } from "@/components/HomeParents";
import { HomeRightNow } from "@/components/HomeRightNow";
import { HomeSteps } from "@/components/HomeSteps";
import { Navbar } from "@/components/Navbar";

/**
 * Homepage = conversion landing page. Reading order is intentional:
 *
 *   1. Hero               value prop + 2 CTAs (App Store + open a park)
 *   2. Right now preview  3 ride cards — proves the product works
 *   3. How it works       3 steps — "no learning curve"
 *   4. Outcomes (features) what guests actually get + per-card CTAs
 *   5. Parents            specific high-value use case
 *   6. Parkio Daily       SEO + email funnel + recurring traffic
 *   7. Final push         dominant App Store CTA
 *
 * Every section ends in a link or button that moves the visitor
 * forward — either deeper into the live product or toward the App
 * Store. Nothing dead-ends.
 */
export const metadata = {
  title: "Parkio — Plan less. Ride more.",
  description:
    "Live Disney park wait times, smart ride picks, and a clean park map for iPhone. All six U.S. Disney parks. Built for the way you actually visit.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Parkio — Plan less. Ride more.",
    description:
      "Live Disney park wait times, smart picks, and a clean map. iPhone-first.",
    type: "website",
    url: "/",
  },
};

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <HomeHero />
      <HomeRightNow />
      <HomeSteps />
      <HomeOutcomes />
      <HomeParents />
      <HomeDailyTeaser />
      <HomeFinalPush />
      <Footer />
    </main>
  );
}

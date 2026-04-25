import { AppPreview } from "@/components/AppPreview";
import { CTASection } from "@/components/CTASection";
import { FAQ } from "@/components/FAQ";
import { Features } from "@/components/Features";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { LiveRightNow } from "@/components/LiveRightNow";
import { Navbar } from "@/components/Navbar";
import { ResortCards } from "@/components/ResortCards";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <Hero />
      <ResortCards />
      <Features />
      <HowItWorks />
      <LiveRightNow />
      <AppPreview />
      <FAQ />
      <CTASection />
      <Footer />
    </main>
  );
}

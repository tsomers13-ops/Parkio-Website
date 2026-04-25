import { AppPreview } from "@/components/AppPreview";
import { CTASection } from "@/components/CTASection";
import { Features } from "@/components/Features";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { Navbar } from "@/components/Navbar";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <Hero />
      <Features />
      <AppPreview />
      <CTASection />
      <Footer />
    </main>
  );
}

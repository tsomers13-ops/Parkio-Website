import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { ParksTodayOverview } from "@/components/ParksTodayOverview";
import { WaitsAllParks } from "@/components/WaitsAllParks";

export const metadata = {
  title: "Live wait times",
  description:
    "Real-time wait times for every attraction at all six U.S. Disney parks. Updated every minute. Walt Disney World and Disneyland Resort.",
  alternates: { canonical: "/waits" },
  openGraph: {
    title: "Parkio — Live Disney wait times across all six U.S. parks",
    description:
      "Real-time waits for Magic Kingdom, EPCOT, Hollywood Studios, Animal Kingdom, Disneyland Park, and Disney California Adventure.",
    type: "website",
    url: "/waits",
  },
};

export default function WaitsPage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />

      <section className="relative">
        <div className="bg-aurora absolute inset-0 -z-10 opacity-70" />
        <div className="mx-auto max-w-7xl px-5 pb-12 pt-12 sm:px-8 sm:pb-16 sm:pt-16">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-widest text-accent-600">
              Wait times
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
              Live across all six parks.
            </h1>
            <p className="mt-4 text-lg text-ink-600">
              Every U.S. Disney park, every operating ride, refreshed every
              minute. Tap a park to open its full live map.
            </p>
          </div>

          <ParksTodayOverview />
        </div>
      </section>

      <WaitsAllParks />

      <Footer />
    </main>
  );
}

import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { ParkCardLive } from "@/components/ParkCardLive";
import { ParksTodayOverview } from "@/components/ParksTodayOverview";
import { PARKS } from "@/lib/data";

export const metadata = {
  title: "Parks",
  description: "Pick your park. Real-time crowds and hours at a glance.",
  alternates: { canonical: "/parks" },
};

export default function ParksPage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />

      <section className="relative">
        <div className="bg-aurora absolute inset-0 -z-10 opacity-70" />
        <div className="mx-auto max-w-7xl px-5 pb-16 pt-12 sm:px-8 sm:pb-24 sm:pt-16">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-widest text-accent-600">
              Choose a park
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
              Where to today?
            </h1>
            <p className="mt-4 text-lg text-ink-600">
              Tap a park to open the live map. Park status and hours
              update in real time.
            </p>
          </div>

          <ParksTodayOverview />

          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-2">
            {PARKS.map((park) => (
              <ParkCardLive key={park.id} park={park} />
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

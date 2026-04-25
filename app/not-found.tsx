import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";

export const metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />

      <section className="relative">
        <div className="bg-aurora absolute inset-0 -z-10 opacity-70" />
        <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-5 py-20 text-center sm:px-8 sm:py-28">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white/70 px-3 py-1 text-xs font-medium text-ink-600 shadow-soft backdrop-blur">
            404 · Page not found
          </span>
          <h1 className="mt-6 text-5xl font-semibold tracking-tight text-ink-900 sm:text-6xl">
            That ride doesn't exist.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ink-600">
            The page you tried to open isn't on the Parkio map. Try one of
            the rides below — or jump straight to a park.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/parks"
              className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-white shadow-soft transition hover:bg-ink-800 active:scale-[0.98]"
            >
              Pick a park
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
              href="/waits"
              className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-5 py-3 text-sm font-medium text-ink-800 shadow-soft transition hover:border-ink-300 hover:bg-ink-50"
            >
              Live wait times
            </Link>
          </div>

          <div className="mt-10 grid w-full max-w-md grid-cols-2 gap-2 text-left">
            <Suggest href="/" label="Home" />
            <Suggest href="/parks" label="All parks" />
            <Suggest href="/waits" label="Wait times" />
            <Suggest href="/developers" label="API" />
            <Suggest href="/about" label="About" />
            <Suggest href="/support" label="Support" />
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

function Suggest({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-ink-100 bg-white px-4 py-3 text-sm font-semibold text-ink-800 shadow-soft transition hover:border-ink-200 hover:bg-ink-50"
    >
      {label}
    </Link>
  );
}

import Link from "next/link";

interface LegalLayoutProps {
  eyebrow?: string;
  title: string;
  intro?: string;
  updated?: string;
  children: React.ReactNode;
}

export function LegalLayout({
  eyebrow,
  title,
  intro,
  updated,
  children,
}: LegalLayoutProps) {
  return (
    <section className="relative">
      <div className="bg-aurora absolute inset-0 -z-10 opacity-60" />
      <div className="mx-auto max-w-3xl px-5 pb-20 pt-12 sm:px-8 sm:pb-28 sm:pt-16">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition hover:text-ink-900"
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            className="h-3.5 w-3.5"
            aria-hidden
          >
            <path
              d="M10 3L5 8l5 5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back to Parkio
        </Link>

        {eyebrow && (
          <p className="mt-8 text-sm font-medium uppercase tracking-widest text-accent-600">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
          {title}
        </h1>
        {intro && (
          <p className="mt-5 text-lg text-ink-600">{intro}</p>
        )}
        {updated && (
          <p className="mt-3 text-sm text-ink-500">Last updated: {updated}</p>
        )}

        <div className="mt-12 space-y-10">{children}</div>
      </div>
    </section>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight text-ink-900">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-base leading-relaxed text-ink-600">
        {children}
      </div>
    </section>
  );
}

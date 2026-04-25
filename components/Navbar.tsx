import Link from "next/link";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40">
      <div className="surface-glass border-b border-ink-100">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2">
            <Logo />
            <span className="text-[15px] font-semibold tracking-tight text-ink-900">
              Parkio
            </span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            <Link
              href="/#features"
              className="text-sm text-ink-600 transition hover:text-ink-900"
            >
              Features
            </Link>
            <Link
              href="/parks"
              className="text-sm text-ink-600 transition hover:text-ink-900"
            >
              Parks
            </Link>
            <Link
              href="/#preview"
              className="text-sm text-ink-600 transition hover:text-ink-900"
            >
              Preview
            </Link>
            <Link
              href="/#faq"
              className="text-sm text-ink-600 transition hover:text-ink-900"
            >
              FAQ
            </Link>
          </nav>

          <Link
            href="/parks"
            className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-sm font-medium text-white shadow-soft transition hover:bg-ink-800 active:scale-[0.98]"
          >
            Open Parkio
            <ArrowRight />
          </Link>
        </div>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-sky-500 shadow-glow">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-4 w-4 text-white"
        aria-hidden
      >
        <path
          d="M12 3l3 6 6 .9-4.5 4.4 1 6.2L12 17.8 6.5 20.5l1-6.2L3 9.9 9 9l3-6z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}

function ArrowRight() {
  return (
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
  );
}

import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-ink-100 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent-500 to-sky-500">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-3.5 w-3.5 text-white"
              aria-hidden
            >
              <path
                d="M12 3l3 6 6 .9-4.5 4.4 1 6.2L12 17.8 6.5 20.5l1-6.2L3 9.9 9 9l3-6z"
                fill="currentColor"
              />
            </svg>
          </span>
          <span className="text-sm font-medium text-ink-900">Parkio</span>
          <span className="text-sm text-ink-500">
            · Skip the lines. Own your day.
          </span>
        </div>

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-500">
          <Link href="/#features" className="hover:text-ink-900">
            Features
          </Link>
          <Link href="/parks" className="hover:text-ink-900">
            Parks
          </Link>
          <Link href="/#preview" className="hover:text-ink-900">
            Preview
          </Link>
          <span>© {new Date().getFullYear()} Parkio</span>
        </nav>
      </div>
    </footer>
  );
}

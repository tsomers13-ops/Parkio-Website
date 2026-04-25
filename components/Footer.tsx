import Link from "next/link";

const PRODUCT_LINKS: Array<{ label: string; href: string }> = [
  { label: "Parks", href: "/parks" },
  { label: "Features", href: "/#features" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Preview", href: "/#preview" },
];

const RESOURCE_LINKS: Array<{ label: string; href: string }> = [
  { label: "FAQ", href: "/#faq" },
  { label: "Support", href: "/support" },
  { label: "Developer API", href: "/developers" },
];

const LEGAL_LINKS: Array<{ label: string; href: string }> = [
  { label: "Privacy", href: "/privacy" },
];

export function Footer() {
  return (
    <footer className="border-t border-ink-100 bg-white">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          {/* Brand column */}
          <div className="lg:col-span-5">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-sky-500 shadow-glow">
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
              <span className="text-base font-semibold tracking-tight text-ink-900">
                Parkio
              </span>
            </div>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-600">
              Skip the lines. Own your day. Real-time wait times, smart park
              maps, and a beautifully simple way to plan your day at any of
              the six U.S. Disney parks.
            </p>
            <p className="mt-5 text-xs text-ink-400">
              Parkio is an independent app and is not affiliated with or
              endorsed by Disney. All ride and park names belong to The Walt
              Disney Company.
            </p>
          </div>

          {/* Link columns */}
          <div className="lg:col-span-7">
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
              <FooterColumn title="Product" links={PRODUCT_LINKS} />
              <FooterColumn title="Resources" links={RESOURCE_LINKS} />
              <FooterColumn title="Legal" links={LEGAL_LINKS} />
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-ink-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-ink-500">
            © {new Date().getFullYear()} Parkio. All rights reserved.
          </span>
          <span className="text-xs text-ink-500">
            Wait-time data via{" "}
            <a
              href="https://themeparks.wiki"
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-ink-700 underline-offset-2 hover:underline"
            >
              themeparks.wiki
            </a>
            .
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ label: string; href: string }>;
}) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-ink-500">
        {title}
      </h3>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.href + l.label}>
            <Link
              href={l.href}
              className="text-sm text-ink-700 transition hover:text-ink-900"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

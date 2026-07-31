/**
 * "Live / Estimated / Loading" data-provenance badges.
 *
 * Two shapes exist on the site — a standalone section badge and a
 * compact one that sits inline next to a heading — but the states,
 * colours and copy are identical, so only the wrapper classes and
 * the live-state label differ.
 */

export type LiveStatus = "loading" | "live" | "estimates";

const SHAPES = {
  section: {
    wrapper:
      "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium ring-1",
    liveLabel: "Live · refreshes every minute",
    loadingTitle: undefined as string | undefined,
    liveTitle: undefined as string | undefined,
  },
  inline: {
    wrapper:
      "ml-2 hidden items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium ring-1 sm:inline-flex",
    liveLabel: "Live",
    loadingTitle: "Loading live wait times…",
    liveTitle: "Live wait times from the Parkio API",
  },
};

export function LiveBadge({
  status,
  shape = "section",
}: {
  status: LiveStatus;
  shape?: keyof typeof SHAPES;
}) {
  const s = SHAPES[shape];

  if (status === "loading") {
    return (
      <span
        className={`${s.wrapper} bg-ink-50 text-ink-500 ring-ink-200`}
        title={s.loadingTitle}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-ink-300" />
        Loading
      </span>
    );
  }

  if (status === "estimates") {
    return (
      <span
        className={`${s.wrapper} bg-ink-100 text-ink-600 ring-ink-200`}
        title="Live data unavailable — showing estimated waits"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-ink-400" />
        Estimated waits
      </span>
    );
  }

  return (
    <span
      className={`${s.wrapper} bg-emerald-50 text-emerald-700 ring-emerald-200`}
      title={s.liveTitle}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      {s.liveLabel}
    </span>
  );
}

/**
 * Small uppercase section eyebrow with a pinging dot when the data
 * behind the section is live, and a flat grey dot when it isn't.
 */
export function LiveEyebrow({
  label,
  live,
  className = "text-[11px]",
}: {
  label: string;
  live: boolean;
  /** Text-size utility — the two call sites differ only here. */
  className?: string;
}) {
  const text = `${className} font-semibold uppercase tracking-widest`;
  if (!live) {
    return (
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-ink-300" />
        <span className={`${text} text-ink-500`}>{label}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-500" />
      </span>
      <span className={`${text} text-accent-700`}>{label}</span>
    </div>
  );
}

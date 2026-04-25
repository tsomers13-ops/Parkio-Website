import { waitColorClasses, waitTier } from "@/lib/utils";

export function WaitTimeBadge({
  minutes,
  size = "md",
}: {
  minutes: number;
  size?: "sm" | "md" | "lg";
}) {
  const tier = waitTier(minutes);
  const c = waitColorClasses(tier);

  const sizes = {
    sm: "px-2 py-0.5 text-[11px]",
    md: "px-2.5 py-1 text-xs",
    lg: "px-3 py-1.5 text-sm",
  }[size];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ${c.bg} ${c.text} ${c.ring} ${sizes}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {minutes} min
    </span>
  );
}

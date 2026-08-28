import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "neutral",
  children,
}: {
  className?: string;
  tone?: "neutral" | "ok" | "warn" | "danger" | "forest";
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "border-rule text-stone",
    ok: "border-rule-strong text-stone",
    warn: "border-ink text-ink",
    danger: "border-oxblood text-oxblood",
    forest: "border-oxblood bg-oxblood text-paper",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[2px] border px-2 py-0.5 text-[11px] font-medium tracking-[0.08em]",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

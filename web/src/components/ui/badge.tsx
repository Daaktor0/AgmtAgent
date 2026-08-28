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
    neutral: "border-rule text-ink-muted",
    ok: "border-forest/30 text-forest",
    warn: "border-warn/40 text-warn",
    danger: "border-danger/40 text-danger",
    forest: "bg-forest text-forest-fg border-forest",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

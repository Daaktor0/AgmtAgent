import { cn } from "@/lib/utils";

/**
 * The Execute mark: a spine and three leaves, the lowest (the signed one) in
 * oxblood. Drawn from rectangles so it is crisp at any size and needs no
 * font. The same geometry is in scripts/brand-assets.mjs for the static files.
 */
export function ExecuteMark({ size = 28, reversed = false, className, title }: { size?: number; reversed?: boolean; className?: string; title?: string }) {
  const ink = reversed ? "var(--color-paper)" : "var(--color-ink)";
  const signed = reversed ? "var(--color-oxblood-lift)" : "var(--color-oxblood)";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <rect x="6" y="5" width="4" height="22" fill={ink} />
      <rect x="11.5" y="5" width="15" height="4" fill={ink} />
      <rect x="11.5" y="14" width="11" height="4" fill={ink} />
      <rect x="11.5" y="23" width="15" height="4" fill={signed} />
    </svg>
  );
}

/** "Execute by Agmt", horizontal. The words are real text so they read and select as text. */
export function ExecuteLockup({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-ink", className)}>
      <ExecuteMark size={compact ? 24 : 28} />
      <span className={cn("font-display font-semibold leading-none tracking-[-0.02em]", compact ? "text-[20px]" : "text-[23px]")}>Execute</span>
      <span
        className={cn(
          "items-center gap-[3px] border-l border-rule-strong pl-2.5 text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-stone",
          compact ? "hidden sm:inline-flex" : "inline-flex",
        )}
      >
        by Agmt
        <span className="mb-1.5 size-[3px] bg-oxblood" aria-hidden="true" />
      </span>
    </span>
  );
}

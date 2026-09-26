import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/**
 * The Agmt wordmark: the name set in Newsreader, closed with a square full stop
 * in signature blue. Real text, so it reads and selects as text. Always "Agmt",
 * never all capitals.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline font-serif text-[1.6rem] leading-none font-[560] tracking-[-0.035em] text-ink",
        className,
      )}
    >
      Agmt
      <span aria-hidden className="ml-[0.06em] inline-block size-[0.19em] bg-blue" />
    </span>
  );
}

export function HomeLink({ className }: { className?: string }) {
  return (
    <Link to="/" aria-label="Agmt, home" className={cn("inline-flex rounded-sm", className)}>
      <Wordmark />
    </Link>
  );
}

/**
 * Execute's mark, from its own brand: a spine and three leaves, the signed one
 * in oxblood. Same geometry as web/src/components/agmt/brand.tsx.
 */
export function ExecuteMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={cn("shrink-0", className)}>
      <rect x="6" y="5" width="4" height="22" fill="currentColor" />
      <rect x="11.5" y="5" width="15" height="4" fill="currentColor" />
      <rect x="11.5" y="14" width="11" height="4" fill="currentColor" />
      <rect x="11.5" y="23" width="15" height="4" fill="var(--execute)" />
    </svg>
  );
}

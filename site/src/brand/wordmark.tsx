import { Link } from "@tanstack/react-router";
import { brand } from "./tokens";
import { cn } from "@/lib/utils";

/**
 * The wordmark is the word, set in the serif, under a short accent rule —
 * a masthead, not a logo. There is no symbol to draw and none is invented.
 */
export function Wordmark({ size = "sm", asLink = true }: { size?: "sm" | "lg"; asLink?: boolean }) {
  const word = (
    <span
      className={cn(
        "block font-serif leading-none tracking-[-0.02em] text-ink",
        size === "lg" ? "text-[2.75rem] sm:text-[3.25rem]" : "text-[1.375rem]",
      )}
    >
      {brand.name}
    </span>
  );

  const body = (
    <span className="inline-block">
      <span
        aria-hidden
        className={cn("mb-2 block bg-accent", size === "lg" ? "h-[3px] w-14" : "h-[2px] w-7")}
      />
      {word}
    </span>
  );

  if (!asLink) return body;

  return (
    <Link to="/" aria-label={`${brand.name} — home`} className="inline-block no-underline">
      {body}
    </Link>
  );
}

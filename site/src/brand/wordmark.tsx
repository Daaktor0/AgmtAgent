import { Link } from "@tanstack/react-router";
import { brand } from "./tokens";
import { cn } from "@/lib/utils";

export function Wordmark({
  size = "sm",
  asLink = true,
  inverse = false,
}: {
  size?: "sm" | "lg";
  asLink?: boolean;
  inverse?: boolean;
}) {
  const body = (
    <span className="inline-flex items-start gap-1.5">
      <span
        className={cn(
          "block font-serif leading-none tracking-[-0.035em]",
          inverse ? "text-on-hero" : "text-ink",
          size === "lg" ? "text-[3.25rem] sm:text-[4.5rem]" : "text-[1.625rem]",
        )}
      >
        {brand.name}
      </span>
      <span
        aria-hidden
        className={cn(
          "mt-[0.18em] rounded-full bg-accent",
          size === "lg" ? "size-2.5 sm:size-3" : "size-1.5",
        )}
      />
    </span>
  );

  if (!asLink) return body;

  return (
    <Link to="/" aria-label={`${brand.name} — home`} className="inline-flex no-underline">
      {body}
    </Link>
  );
}

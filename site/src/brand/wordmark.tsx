import { Link } from "@tanstack/react-router";
import { AgmtWordmark } from "@/brand/logo";

export function Wordmark({
  size = "sm",
  asLink = true,
  inverse = false,
}: {
  size?: "sm" | "lg";
  asLink?: boolean;
  inverse?: boolean;
}) {
  const mark = (
    <AgmtWordmark
      aria-hidden
      className={`wordmark ${size === "lg" ? "wordmark-large" : ""} ${inverse ? "wordmark-inverse" : ""}`}
    />
  );
  return asLink ? (
    <Link to="/" aria-label="Agmt home" className="wordmark-link">
      {mark}
    </Link>
  ) : (
    mark
  );
}

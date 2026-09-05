import { Link } from "@tanstack/react-router";
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
    <span
      className={`wordmark ${size === "lg" ? "wordmark-large" : ""} ${inverse ? "wordmark-inverse" : ""}`}
    >
      agmt<span aria-hidden>.</span>
    </span>
  );
  return asLink ? (
    <Link to="/" aria-label="Agmt — home" className="wordmark-link">
      {body}
    </Link>
  ) : (
    body
  );
}

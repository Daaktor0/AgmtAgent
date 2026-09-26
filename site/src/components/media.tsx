import { useState } from "react";
import { Check, Copy } from "./icons";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

/** A product screenshot in a plain browser window, with a caption beneath. */
export function Screenshot({
  src,
  alt,
  width,
  height,
  caption,
  url = "app.agmt.legal",
  className,
  eager = false,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  caption?: string;
  url?: string;
  className?: string;
  eager?: boolean;
}) {
  return (
    <figure className={cn("min-w-0", className)}>
      <div className="window">
        <div className="window-bar" aria-hidden>
          <span className="window-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="window-url">{url}</span>
          <span className="w-[42px]" />
        </div>
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
        />
      </div>
      {caption ? <figcaption className="mt-3 text-[0.875rem] text-ink-3">{caption}</figcaption> : null}
    </figure>
  );
}

/** The contact address, big, with a copy button that works on any device. */
export function EmailCopy() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(SITE.email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.location.href = `mailto:${SITE.email}`;
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
      <a
        href={`mailto:${SITE.email}`}
        className="font-serif text-[clamp(2rem,6vw,4.25rem)] leading-none tracking-[-0.035em] text-ink decoration-blue decoration-2 underline-offset-[0.14em] hover:text-blue hover:underline"
      >
        {SITE.email}
      </a>
      <button type="button" onClick={copy} className="btn btn-ghost btn-sm" aria-live="polite">
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy address"}
      </button>
    </div>
  );
}

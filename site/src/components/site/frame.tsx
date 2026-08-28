import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Wordmark } from "@/brand/wordmark";
import { FOOTER } from "@/brand/copy";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/what", label: "What" },
  { to: "/how", label: "How" },
  { to: "/beta", label: "Beta" },
  { to: "/legal", label: "Legal" },
] as const;

type NavPath = (typeof NAV)[number]["to"];

export function SiteFrame({ children, current }: { children: ReactNode; current?: NavPath }) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:text-ink"
      >
        Skip to content
      </a>

      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-3xl flex-wrap items-end justify-between gap-x-8 gap-y-4 px-6 pb-4 pt-6">
          <Wordmark />
          <nav className="-mb-px flex flex-wrap items-center gap-x-6 gap-y-1">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "inline-flex min-h-9 items-center border-b-2 text-[0.9375rem] no-underline transition-colors",
                  current === item.to
                    ? "border-accent text-ink"
                    : "border-transparent text-muted hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="mt-20 border-t border-rule">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <p className="text-sm text-muted">{FOOTER}</p>
        </div>
      </footer>
    </div>
  );
}

/** The one text measure the whole site sets to. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto max-w-3xl px-6 py-14 sm:py-20", className)}>{children}</div>;
}

/** A numbered section: the numeral hangs in the gutter, as it would in a deed. */
export function Clause({
  n,
  title,
  children,
  className,
}: {
  n: string;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("clause border-t border-rule pt-6", className)}>
      <p className="clause-n" aria-hidden>
        {n}
      </p>
      <div className="max-w-[var(--measure)]">
        {title ? <h2 className="text-[1.375rem] leading-snug text-ink">{title}</h2> : null}
        {children}
      </div>
    </section>
  );
}

/** Running text at the site measure. */
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("max-w-[var(--measure)] text-ink-2", className)}>{children}</p>;
}

/**
 * A quiet aside. This is where the site is allowed to be dry — never in a
 * heading, a call to action, a seat confirmation, or anything on /legal.
 */
export function Aside({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-[var(--measure)] border-l-2 border-rule-strong pl-3 text-[0.9375rem] text-muted">
      {children}
    </p>
  );
}

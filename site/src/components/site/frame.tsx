import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Wordmark } from "@/brand/wordmark";
import { FOOTER } from "@/brand/copy";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/#problem", label: "The problem" },
  { href: "/#proof", label: "Proof" },
  { href: "/#review", label: "Review" },
  { href: "/#beta", label: "Beta" },
] as const;

export function SiteFrame({
  children,
}: {
  children: ReactNode;
  current?: "/what" | "/how" | "/beta" | "/legal";
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:text-ink"
      >
        Skip to content
      </a>

      <header className="site-nav sticky top-0 z-50 border-b border-white/10">
        <div className="mx-auto flex h-[4.75rem] max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
          <Wordmark inverse />
          <nav className="hidden items-center gap-7 lg:flex" aria-label="Main navigation">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className="nav-link">
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              to="/beta"
              className="group inline-flex min-h-10 items-center gap-2 bg-accent px-4 text-sm font-medium text-accent-ink no-underline transition-colors hover:bg-accent-hover"
            >
              Book a seat
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-white/10 bg-hero text-on-hero">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <Wordmark inverse />
            <p className="mt-4 max-w-md text-sm leading-relaxed text-on-hero-muted">{FOOTER}</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-on-hero-muted">
            <Link to="/what" className="no-underline hover:text-on-hero">
              What
            </Link>
            <Link to="/how" className="no-underline hover:text-on-hero">
              How
            </Link>
            <Link to="/beta" className="no-underline hover:text-on-hero">
              Beta
            </Link>
            <Link to="/legal" className="no-underline hover:text-on-hero">
              Legal
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-24", className)}>
      {children}
    </div>
  );
}

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
    <section className={cn("clause border-t border-rule pt-7", className)}>
      <p className="clause-n" aria-hidden>
        {n.padStart(2, "0")}
      </p>
      <div className="max-w-[var(--measure)]">
        {title ? <h2 className="text-[1.5rem] leading-snug text-ink">{title}</h2> : null}
        {children}
      </div>
    </section>
  );
}

export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("max-w-[var(--measure)] text-ink-2", className)}>{children}</p>;
}

export function Aside({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-[var(--measure)] border-l-2 border-accent pl-4 text-[0.9375rem] text-muted">
      {children}
    </p>
  );
}

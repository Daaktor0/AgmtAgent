import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Wordmark } from "@/brand/wordmark";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { cn } from "@/lib/utils";

export function SiteFrame({
  children,
}: {
  children: ReactNode;
  current?: "/what" | "/how" | "/beta" | "/legal";
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="site-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="masthead">
        <div className="site-container masthead-inner">
          <Wordmark />
          <nav className="desktop-nav" aria-label="Main navigation">
            <Link to="/what">The idea</Link>
            <Link to="/how">Meet Proof</Link>
            <Link to="/beta">Dispatch</Link>
          </nav>
          <div className="nav-actions">
            <ThemeToggle />
            <Link className="nav-cta" to="/beta">
              Keep me posted <ArrowUpRight size={16} aria-hidden />
            </Link>
            <button
              className="menu-toggle"
              type="button"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-controls="mobile-nav"
              aria-label={open ? "Close navigation" : "Open navigation"}
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        {open && (
          <nav
            id="mobile-nav"
            className="mobile-nav"
            aria-label="Mobile navigation"
            onClick={() => setOpen(false)}
          >
            <Link to="/what">The idea</Link>
            <Link to="/how">Meet Proof</Link>
            <Link to="/beta">Agmt Dispatch</Link>
          </nav>
        )}
      </header>
      <main id="main">{children}</main>
      <footer className="site-footer">
        <div className="site-container">
          <div className="footer-top">
            <p>
              Less repetition.
              <br />
              <em>More possibility.</em>
            </p>
            <div className="footer-links">
              <Link to="/what">The idea</Link>
              <Link to="/how">Meet Proof</Link>
              <Link to="/beta">Dispatch</Link>
              <Link to="/legal">Legal & updates</Link>
            </div>
          </div>
          <div className="footer-bottom">
            <Wordmark />
            <span>Practical tools for modern legal work.</span>
            <a href="#main">Back to top ↑</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("site-container inner-page", className)}>{children}</div>;
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
      <div>
        {title && <h2 className="text-2xl">{title}</h2>}
        {children}
      </div>
    </section>
  );
}
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("max-w-[var(--measure)] text-ink-2", className)}>{children}</p>;
}
export function Aside({ children }: { children: ReactNode }) {
  return <p className="border-l-2 border-accent pl-4 text-muted">{children}</p>;
}

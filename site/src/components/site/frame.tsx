import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { Wordmark } from "@/brand/wordmark";
import { NAV, FOOTER_DESCRIPTION, FOOTER_LINKS, A11Y } from "@/brand/copy";
import { APP_URL } from "@/brand/tokens";
import { cn } from "@/lib/utils";

export function SiteFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="skip-link">
        {NAV.skip}
      </a>
      <header className="masthead">
        <div className="site-container masthead-inner">
          <Wordmark />
          <nav className="desktop-nav" aria-label={A11Y.mainNav}>
            <Link to="/products">{NAV.products}</Link>
            <Link to="/trust">{NAV.trust}</Link>
          </nav>
          <div className="nav-actions">
            <a className="nav-app-link" href={APP_URL}>
              {NAV.app}
            </a>
            <details className="mobile-menu">
              <summary className="mobile-menu-toggle" aria-label={A11Y.mobileMenuOpen}>
                <Menu className="icon-open" size={20} aria-hidden />
                <X className="icon-close" size={20} aria-hidden />
                {NAV.mobileMenu}
              </summary>
              <nav className="mobile-nav" aria-label={A11Y.mainNav}>
                <a href="/products">{NAV.products}</a>
                <a href="/trust">{NAV.trust}</a>
                <a href={APP_URL}>{NAV.app}</a>
              </nav>
            </details>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-rule">
        <div className="site-container py-16">
          <nav
            className="grid grid-cols-2 gap-8 border-b border-rule pb-12 sm:grid-cols-4"
            aria-label={A11Y.footerNav}
          >
            <div className="col-span-2 sm:col-span-1">
              <Wordmark size="lg" />
              <p className="text-helper mt-4 max-w-[16rem]">{FOOTER_DESCRIPTION}</p>
            </div>
            <FooterGroup heading="Products" links={FOOTER_LINKS.products} />
            <FooterGroup heading="Agmt" links={FOOTER_LINKS.agmt} />
            <FooterGroup heading="Legal" links={FOOTER_LINKS.legal} />
          </nav>
          <p className="text-helper pt-8">© {new Date().getFullYear()} Agmt.</p>
        </div>
      </footer>
    </div>
  );
}

function FooterGroup({
  heading,
  links,
}: {
  heading: string;
  links: readonly { label: string; to?: string; href?: string }[];
}) {
  return (
    <div>
      <p className="eyebrow mb-4">{heading}</p>
      <ul className="flex flex-col gap-3">
        {links.map((link) => (
          <li key={link.label}>
            {link.to ? (
              <Link to={link.to} className="text-sm font-medium hover:underline">
                {link.label}
              </Link>
            ) : (
              <a href={link.href} className="text-sm font-medium hover:underline">
                {link.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("site-container py-14 sm:py-20", className)}>{children}</div>;
}

export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("reading-measure text-[1.0625rem] leading-[1.75]", className)}>{children}</p>;
}

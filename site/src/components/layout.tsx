import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { HomeLink, Wordmark } from "./brand";
import { ArrowUpRight, Close, Menu } from "./icons";
import { NAV, SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const menu = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const closeMenu = () => menu.current?.removeAttribute("open");

  return (
    <header className="site-header" data-scrolled={scrolled}>
      <div className="container-site flex h-[68px] items-center justify-between gap-6">
        <HomeLink />
        <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => (
            <Link key={item.to} to={item.to} className="nav-link">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a href={SITE.appUrl} className="btn btn-primary btn-sm hidden sm:inline-flex">
            Open Execute
            <ArrowUpRight className="arrow arrow-up" />
          </a>
          <details ref={menu} className="mobile-menu md:hidden">
            <summary
              className="grid size-10 cursor-pointer place-items-center rounded-lg text-ink hover:bg-bg-2"
              aria-label="Menu"
            >
              <Menu size={20} className="icon-open" />
              <Close size={20} className="icon-close" />
            </summary>
            <div className="absolute inset-x-0 top-[68px] border-b border-line bg-bg shadow-[0_24px_40px_-24px_rgb(0_0_0/0.25)]">
              <nav aria-label="Main" className="container-site flex flex-col py-3">
                {NAV.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={closeMenu}
                    className="border-b border-line py-4 font-serif text-[1.6rem] tracking-[-0.02em] text-ink last:border-0"
                  >
                    {item.label}
                  </Link>
                ))}
                <a href={SITE.appUrl} className="btn btn-primary mt-4 mb-3">
                  Open Execute
                  <ArrowUpRight className="arrow arrow-up" />
                </a>
              </nav>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

const FOOTER_GROUPS: { heading: string; links: { label: string; to?: string; href?: string }[] }[] = [
  { heading: "Products", links: [{ label: "Execute", to: "/products/execute" }] },
  {
    heading: "Blog",
    links: [
      { label: "All posts", to: "/blog" },
      { label: "RSS feed", href: "/blog/rss.xml" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", to: "/about" },
      { label: "Contact", to: "/contact" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy", to: "/privacy" },
      { label: "Terms", to: "/terms" },
    ],
  },
];

/**
 * The footer is set like an execution block: the company on the left, a
 * column of closing brackets, and what it signs for on the right.
 */
function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-bg-2">
      <div className="container-site grid gap-12 py-16 md:grid-cols-[minmax(0,1fr)_2rem_minmax(0,1.6fr)] md:gap-0 md:py-20">
        <div className="flex flex-col gap-4">
          <Wordmark className="text-[2rem]" />
          <p className="max-w-[22ch] font-serif text-[1.35rem] leading-snug tracking-[-0.015em] text-ink-2">
            {SITE.tagline}
          </p>
        </div>
        <div aria-hidden className="hidden flex-col font-serif text-[1.35rem] leading-[2.6rem] text-ink-3 md:flex">
          {FOOTER_GROUPS.map((group) => (
            <span key={group.heading}>)</span>
          ))}
        </div>
        <nav aria-label="Footer" className="flex flex-col">
          {FOOTER_GROUPS.map((group) => (
            <div key={group.heading} className="flex min-h-[2.6rem] flex-wrap items-baseline gap-x-6 gap-y-1">
              <span className="label w-24 shrink-0">{group.heading}</span>
              {group.links.map((link) =>
                link.to ? (
                  <Link key={link.label} to={link.to} className="link text-[1rem] leading-[2.6rem]">
                    {link.label}
                  </Link>
                ) : (
                  <a key={link.label} href={link.href} className="link text-[1rem] leading-[2.6rem]">
                    {link.label}
                  </a>
                ),
              )}
            </div>
          ))}
        </nav>
      </div>
      <div className="border-t border-line">
        <div className="container-site flex flex-wrap items-center justify-between gap-3 py-6 text-[0.875rem] text-ink-3">
          <span>© {new Date().getFullYear()} Agmt</span>
          <a href={`mailto:${SITE.email}`} className="link">
            {SITE.email}
          </a>
        </div>
      </div>
    </footer>
  );
}

/** A labelled page opening: eyebrow, headline, standfirst. */
export function PageIntro({
  label,
  title,
  children,
  className,
}: {
  label: string;
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("container-site pt-16 pb-12 md:pt-24 md:pb-16", className)}>
      <p className="label reveal">{label}</p>
      <h1 className="display-1 reveal reveal-2 mt-5 max-w-[16ch]">{title}</h1>
      {children ? <div className="lead reveal reveal-3 mt-7 max-w-[58ch]">{children}</div> : null}
    </section>
  );
}

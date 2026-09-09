import { Link, useRouterState } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const proofActive = pathname === "/proof" || pathname.startsWith("/proof/");

  return (
    <div className="min-h-screen bg-paper text-ink">
      <a href="#proof-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-paper focus:px-3 focus:py-2">Skip to content</a>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink text-paper shadow-[0_1px_0_rgba(0,0,0,0.18)]">
        <div className="mx-auto flex h-[68px] max-w-[1500px] items-center justify-between gap-6 px-4 sm:px-9 lg:px-12">
          <div className="flex min-w-0 items-center gap-8 lg:gap-12">
            <Link
              to="/"
              aria-label="Agmt — agreement utilities"
              className="group inline-flex shrink-0 items-start gap-1.5 no-underline"
            >
              <span className="font-display text-[28px] font-semibold leading-none tracking-[-0.045em] text-paper">
                Agmt
              </span>
              <span className="mt-0.5 size-1.5 bg-oxblood transition-transform group-hover:scale-125" aria-hidden="true" />
            </Link>

            <nav className="flex items-center gap-1" aria-label="Products">
              <Link
                to="/proof"
                aria-current={proofActive ? "page" : undefined}
                className={proofActive
                  ? "border-b-2 border-oxblood px-3 py-[22px] text-[13px] font-medium text-paper no-underline"
                  : "px-3 py-[22px] text-[13px] text-paper no-underline"}
              >
                Proof
              </Link>
              <span className="inline-flex items-center gap-2 px-3 py-[22px] text-[13px] text-white/45">
                Review
                <span className="border border-white/15 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-white/45">
                  soon
                </span>
              </span>
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {isPending ? (
              <div className="h-8 w-32 animate-pulse bg-white/5" />
            ) : user ? (
              <div className="hidden items-center gap-3 text-[11px] uppercase tracking-[0.12em] text-white/50 sm:flex">
                <span className="size-1.5 bg-white/35" aria-hidden="true" />
                Account
                <Link to="/matters" className="text-white/50 no-underline hover:text-paper">Matters</Link>
              </div>
            ) : (
              <Link to="/login" search={{ returnTo: "/proof" }} className="text-[13px] text-paper underline underline-offset-4">Sign in</Link>
            )}
          </div>
        </div>
      </header>

      <main id="proof-main" className="mx-auto max-w-[1500px] px-4 py-10 sm:px-9 sm:py-12 lg:px-12 lg:py-14">
        {children}
      </main>
    </div>
  );
}

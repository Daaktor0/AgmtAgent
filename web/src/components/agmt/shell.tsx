import { Link } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, isPending } = useCurrentUserState();

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink text-paper shadow-[0_1px_0_rgba(0,0,0,0.18)]">
        <div className="mx-auto flex h-[68px] max-w-[1500px] items-center justify-between gap-6 px-6 sm:px-9 lg:px-12">
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

            <nav className="hidden items-center gap-1 sm:flex" aria-label="Workspace">
              <Link
                to="/matters"
                className="border-b-2 border-oxblood px-3 py-[22px] text-[13px] font-medium text-paper no-underline"
              >
                Matters
              </Link>
              <Link to="/proof" className="px-3 py-[22px] text-[13px] text-paper">Proof</Link>
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
              <div className="hidden items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-white/50 sm:flex">
                <span className="size-1.5 bg-white/35" aria-hidden="true" />
                Account
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-6 py-10 sm:px-9 sm:py-12 lg:px-12 lg:py-14">
        {children}
      </main>
    </div>
  );
}

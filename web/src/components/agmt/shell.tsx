import { Link } from "@tanstack/react-router";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-rule">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="border-b-2 border-oxblood pb-0.5 font-display text-[22px] font-semibold leading-none tracking-[-0.03em] text-ink"
            >
              Agmt
            </Link>
            <span className="hidden text-xs tracking-[0.04em] text-stone sm:inline">Proof</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-stone">
            {isPending ? (
              <div className="h-8 w-28 animate-pulse rounded-[2px] bg-paper-sunk" />
            ) : user ? (
              <UserButton />
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1280px] px-5 py-8 sm:px-8 sm:py-10">{children}</main>
    </div>
  );
}

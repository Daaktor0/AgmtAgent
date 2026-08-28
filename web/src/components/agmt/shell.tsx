import { Link } from "@tanstack/react-router";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-rule">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="font-display text-xl font-medium tracking-tight text-ink">
            Agmt
          </Link>
          <div className="flex items-center gap-4 text-sm text-ink-muted">
            <span className="hidden sm:inline">Proof the artefact.</span>
            {isPending ? (
              <div className="h-8 w-28 animate-pulse rounded-full bg-rule/60" />
            ) : user ? (
              <UserButton />
            ) : null}
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
    </div>
  );
}

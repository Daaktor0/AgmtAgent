import type { ErrorComponentProps } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { STATES, CTA } from "@/brand/copy";

export function AppErrorComponent({ error: _error }: ErrorComponentProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-paper px-6 text-center text-ink">
      <h1 className="text-product-title">{STATES.pageError.heading}</h1>
      <p className="max-w-md text-[1.0625rem] text-[var(--color-ash)]">{STATES.pageError.body}</p>
      <button type="button" onClick={() => window.location.reload()} className="btn btn-primary">
        {STATES.pageError.action}
      </button>
      <Link to="/" className="text-link">
        {CTA.backToAgmt}
      </Link>
    </main>
  );
}

export function NotFoundComponent() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-paper px-6 text-center text-ink">
      <h1 className="text-product-title">{STATES.notFound.heading}</h1>
      <p className="max-w-md text-[1.0625rem] text-[var(--color-ash)]">{STATES.notFound.body}</p>
      <Link to="/" className="btn btn-primary">
        {STATES.notFound.action}
      </Link>
    </main>
  );
}

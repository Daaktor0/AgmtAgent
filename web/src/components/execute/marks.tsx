import type { CellState } from "@/lib/execute/checks";
import { cn } from "@/lib/utils";

/**
 * Status without colour coding: each state is a small page with its own
 * shape, always beside a word. Filled ink: received. Hollow: awaited. Oxblood
 * outline with a dot: to check. Filled oxblood with a cross: to fix. A dash:
 * this party doesn't sign this document.
 */
export const STATE_LABEL: Record<CellState, string> = {
  done: "Received",
  check: "To check",
  problem: "To fix",
  awaited: "Awaited",
  "not-needed": "Not signing",
};

export function Mark({ state, className }: { state: CellState; className?: string }) {
  return (
    <svg viewBox="0 0 9 12" width="9" height="12" aria-hidden="true" className={cn("inline-block shrink-0", className)}>
      {state === "done" ? <rect width="9" height="12" fill="var(--color-ink)" /> : null}
      {state === "awaited" ? <rect x=".5" y=".5" width="8" height="11" fill="none" stroke="var(--color-stone)" /> : null}
      {state === "check" ? (
        <>
          <rect x="1" y="1" width="7" height="10" fill="none" stroke="var(--color-oxblood)" strokeWidth="2" />
          <rect x="3.5" y="5" width="2" height="2" fill="var(--color-oxblood)" />
        </>
      ) : null}
      {state === "problem" ? (
        <>
          <rect width="9" height="12" fill="var(--color-oxblood)" />
          <path d="M2.3 3.8l4.4 4.4M6.7 3.8L2.3 8.2" stroke="var(--color-paper)" strokeWidth="1.3" />
        </>
      ) : null}
      {state === "not-needed" ? <rect x="1" y="5.5" width="7" height="1" fill="var(--color-rule-strong)" /> : null}
    </svg>
  );
}

export const stateTone = (state: CellState) =>
  state === "problem" || state === "check" ? "text-oxblood" : state === "awaited" || state === "not-needed" ? "text-stone" : "text-ink";

export function StateText({ state, label }: { state: CellState; label?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[13px]", stateTone(state))}>
      <Mark state={state} />
      {label ?? STATE_LABEL[state]}
    </span>
  );
}

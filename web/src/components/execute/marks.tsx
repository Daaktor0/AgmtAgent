import type { CellState } from "@/lib/execute/checks";
import { cn } from "@/lib/utils";

/**
 * Status without colour coding: the app has no green, so state is carried by
 * shape and a word. Filled square: done. Hollow: awaited. Oxblood ring: have
 * a look. Oxblood filled with a cross: a problem to fix.
 */
export const STATE_LABEL: Record<CellState, string> = {
  done: "Received",
  check: "Have a look",
  problem: "Fix",
  awaited: "Awaited",
  "not-needed": "Not needed",
};

export function Mark({ state, className }: { state: CellState; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-3 shrink-0 items-center justify-center",
        state === "done" && "bg-ink",
        state === "awaited" && "border border-rule-strong",
        state === "check" && "border-2 border-oxblood",
        state === "problem" && "bg-oxblood text-[9px] leading-none text-paper",
        state === "not-needed" && "h-px w-3 bg-rule",
        className,
      )}
    >
      {state === "problem" ? "×" : null}
    </span>
  );
}

export function StateText({ state, label }: { state: CellState; label?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[13px]", state === "problem" || state === "check" ? "text-oxblood" : state === "awaited" || state === "not-needed" ? "text-stone" : "text-ink")}>
      <Mark state={state} />
      {label ?? STATE_LABEL[state]}
    </span>
  );
}

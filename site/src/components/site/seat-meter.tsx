import { SEAT_OPEN, SEAT_RESERVED } from "@/brand/tokens";
import type { SeatCounts } from "@/lib/waitlist";
import { cn } from "@/lib/utils";

/**
 * The 30 / 20 rule, drawn. One mark per seat: filled where the seat is gone,
 * empty where it is not. The reserved twenty are drawn apart and never fill
 * from the waitlist, which is the whole point of showing them separately.
 */
export function SeatMeter({ counts, className }: { counts: SeatCounts; className?: string }) {
  return (
    <div
      className={cn("space-y-4", className)}
      role="img"
      aria-label={
        `${counts.openRemaining} of ${SEAT_OPEN} open seats available. ` +
        `${counts.reservedAllotted} of ${SEAT_RESERVED} reserved seats allotted.`
      }
    >
      <Row
        total={SEAT_OPEN}
        filled={counts.fcfsTaken}
        label="Open · first come"
        note={`${counts.openRemaining} left`}
      />
      <Row
        total={SEAT_RESERVED}
        filled={counts.reservedAllotted}
        label="Reserved · allotted by hand"
        note={`${counts.reservedRemaining} left`}
        reserved
      />
    </div>
  );
}

function Row({
  total,
  filled,
  label,
  note,
  reserved = false,
}: {
  total: number;
  filled: number;
  label: string;
  note: string;
  reserved?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="label">{label}</span>
        <span className="font-mono text-xs tabular-nums text-muted">{note}</span>
      </div>
      <div className="mt-1.5 flex gap-[3px]" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-3.5 min-w-[3px] flex-1 rounded-[1px]",
              i < filled
                ? "bg-accent"
                : reserved
                  ? "border border-dashed border-rule-strong"
                  : "border border-rule-strong",
            )}
          />
        ))}
      </div>
    </div>
  );
}

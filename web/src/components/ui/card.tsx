import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[24px] border border-rule bg-paper-elevated p-5 shadow-[0_1px_0_rgba(26,25,22,0.04)]",
        className,
      )}
      {...props}
    />
  );
}

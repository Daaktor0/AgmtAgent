import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[2px] border border-rule bg-transparent p-5",
        className,
      )}
      {...props}
    />
  );
}

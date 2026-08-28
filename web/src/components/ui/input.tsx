import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-[2px] border border-rule bg-paper px-3 text-sm text-ink placeholder:text-stone focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oxblood",
        className,
      )}
      {...props}
    />
  );
}

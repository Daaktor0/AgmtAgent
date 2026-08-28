import { cn } from "@/lib/utils";
import type { TextareaHTMLAttributes } from "react";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-[2px] border border-rule bg-paper px-3 py-2 text-sm text-ink placeholder:text-stone focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oxblood",
        className,
      )}
      {...props}
    />
  );
}

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-medium transition-opacity duration-[var(--motion-quick)] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest min-h-11",
  {
    variants: {
      variant: {
        primary: "bg-forest text-forest-fg hover:opacity-90 rounded-[10px] px-4",
        secondary:
          "bg-paper-elevated text-ink border border-rule hover:border-rule-strong rounded-[10px] px-4",
        ghost: "text-ink-muted hover:text-ink px-3 rounded-[8px]",
        danger: "bg-danger text-paper-elevated rounded-[10px] px-4",
      },
      size: {
        default: "text-sm h-11",
        sm: "text-sm h-9 min-h-9",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

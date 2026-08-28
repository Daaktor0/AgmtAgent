import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

const buttonVariants = cva(
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-[2px] font-medium transition-colors duration-[var(--motion-quick)] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oxblood",
  {
    variants: {
      variant: {
        primary:
          "border border-oxblood bg-oxblood px-5 text-paper hover:border-oxblood-pressed hover:bg-oxblood-pressed",
        secondary:
          "border border-ink bg-transparent px-5 text-ink hover:bg-paper-sunk",
        ghost: "border border-transparent px-3 text-ink-muted hover:text-ink",
        danger:
          "border border-oxblood bg-transparent px-5 text-oxblood hover:bg-paper-sunk",
      },
      size: {
        default: "h-10 text-sm",
        sm: "h-9 min-h-9 text-xs",
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

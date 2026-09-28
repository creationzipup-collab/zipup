import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background,color,border,box-shadow,transform,opacity] duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-inv text-inv-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.7)] hover:bg-white hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.7),0_0_26px_-8px_rgb(255_255_255/0.45)]",
        secondary: "border border-line-2 bg-white/[0.035] text-fg hover:border-line-3 hover:bg-white/[0.07]",
        ghost: "text-fg-2 hover:bg-white/[0.06] hover:text-fg",
        outline: "border border-line-2 bg-transparent text-fg hover:border-line-3 hover:bg-white/[0.04]",
        accent: "bg-accent text-on-accent shadow-[0_0_28px_-8px_var(--accent-glow)] hover:bg-accent-2",
        danger: "border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20",
        link: "h-auto px-0 text-fg-2 underline-offset-4 hover:text-fg hover:underline",
      },
      size: {
        xs: "h-7 rounded-full px-2.5 text-xs [&_svg]:size-3.5",
        sm: "h-8 rounded-full px-3.5 text-[13px] [&_svg]:size-4",
        md: "h-9 rounded-full px-4 text-sm [&_svg]:size-4",
        lg: "h-11 rounded-full px-6 text-[15px] [&_svg]:size-[18px]",
        icon: "size-9 rounded-full [&_svg]:size-[18px]",
        "icon-sm": "size-8 rounded-full [&_svg]:size-4",
        "icon-xs": "size-7 rounded-full [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Spinner className="size-4" />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export { buttonVariants };

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Button hierarchy — exactly ONE `primary` per screen:
 *   primary   solid accent — the screen's single main action
 *   secondary hairline outline, neutral
 *   ghost     quiet utility (icon buttons in the top bar)
 *   tertiary  text only
 * The default is `secondary`, so a primary is always an explicit choice.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium transition-[color,background-color,border-color,transform] duration-fast ease-out active:translate-y-px [&_.lucide-arrow-right]:transition-transform [&_.lucide-arrow-right]:duration-base [&:hover_.lucide-arrow-right]:translate-x-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:bg-accent/90 active:bg-accent/80",
        secondary: "border border-line-strong text-fg hover:bg-fg/[0.05] active:bg-fg/[0.08]",
        ghost: "text-fg-2 hover:bg-fg/[0.06] hover:text-fg",
        tertiary: "text-fg-2 hover:text-fg",
      },
      size: {
        sm: "h-8 px-3 text-13",
        md: "h-9 px-3.5 text-14",
        lg: "h-10 px-4 text-14",
        icon: "size-9",
        text: "h-auto p-0 text-13",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";

import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-9 w-full rounded-control border border-line-strong bg-transparent px-3 text-14 text-fg transition-colors duration-fast placeholder:text-fg-3 hover:border-fg/20 focus-visible:border-accent/70 focus-visible:outline-none",
      className,
    )}
    {...p}
  />
));
Input.displayName = "Input";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Quiet switch: small, "on" is a soft ink track, "off" a faint one. No accent and no heavy black pill —
 * there can be 30+ on one page, and they must not out-shout the labels they belong to.
 */
export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...p }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full bg-fg/[0.12] transition-colors duration-fast hover:bg-fg/[0.18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-raised data-[state=checked]:bg-fg/45 data-[state=checked]:hover:bg-fg/60",
      className,
    )}
    {...p}
  >
    <SwitchPrimitive.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-raised shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition-transform duration-fast ease-out data-[state=checked]:translate-x-4" />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";

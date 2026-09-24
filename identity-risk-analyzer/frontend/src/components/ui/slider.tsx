import * as SliderPrimitive from "@radix-ui/react-slider";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Radix puts role="slider" on the Thumb, so the accessible name must go there, not on the Root. */
export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, "aria-label": ariaLabel, ...p }, ref) => (
  <SliderPrimitive.Root ref={ref} className={cn("relative flex w-full touch-none select-none items-center py-2", className)} {...p}>
    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/15">
      <SliderPrimitive.Range className="absolute h-full bg-primary" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      aria-label={ariaLabel}
      className="block size-4 rounded-full border-2 border-primary bg-background shadow-[0_0_12px_hsl(var(--primary)/0.6)] transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
    />
  </SliderPrimitive.Root>
));
Slider.displayName = "Slider";

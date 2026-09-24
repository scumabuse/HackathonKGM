import * as SliderPrimitive from "@radix-ui/react-slider";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Neutral slider (a settings page has dozens — accent is kept for focus only).
 *  Radix puts role="slider" on the Thumb, so the accessible name goes there, not on the Root. */
export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, "aria-label": ariaLabel, ...p }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("group relative flex w-full touch-none select-none items-center py-2 data-[disabled]:opacity-40", className)}
    {...p}
  >
    <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-fg/[0.1]">
      <SliderPrimitive.Range className="absolute h-full bg-fg-2" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      aria-label={ariaLabel}
      className="block size-3.5 rounded-full bg-fg shadow-[0_0_0_3px_rgb(var(--raised))] transition-transform duration-fast hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-raised"
    />
  </SliderPrimitive.Root>
));
Slider.displayName = "Slider";

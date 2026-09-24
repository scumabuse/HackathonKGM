import * as SliderPrimitive from "@radix-ui/react-slider";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Neutral slider (a settings page has dozens — accent is kept for focus only). One thumb per value, so a
 * range like the risk scale's three cut-offs is a single control. A light, outlined thumb instead of a heavy
 * ink dot keeps a page of sliders calm. Radix puts role="slider" on each Thumb, so names go there.
 */
export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
    thumbLabels?: string[];
    trackClassName?: string;
    trackStyle?: React.CSSProperties;
    /** hide the filled range (e.g. when the track itself is the legend) */
    noRange?: boolean;
  }
>(({ className, "aria-label": ariaLabel, thumbLabels, trackClassName, trackStyle, noRange, ...p }, ref) => {
  const count = (p.value ?? p.defaultValue ?? [0]).length;
  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn("group relative flex w-full touch-none select-none items-center py-2 data-[disabled]:opacity-40", className)}
      {...p}
    >
      <SliderPrimitive.Track className={cn("relative h-1 w-full grow overflow-hidden rounded-full bg-fg/[0.08]", trackClassName)} style={trackStyle}>
        {!noRange && <SliderPrimitive.Range className="absolute h-full rounded-full bg-fg/45 transition-colors duration-fast group-hover:bg-fg/60" />}
      </SliderPrimitive.Track>
      {Array.from({ length: count }, (_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          aria-label={thumbLabels?.[i] ?? ariaLabel}
          className="block size-4 cursor-grab rounded-full border border-fg/35 bg-raised shadow-[0_1px_3px_rgb(0_0_0/0.18)] transition-[transform,border-color] duration-fast hover:scale-110 hover:border-fg/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-raised active:cursor-grabbing"
        />
      ))}
    </SliderPrimitive.Root>
  );
});
Slider.displayName = "Slider";

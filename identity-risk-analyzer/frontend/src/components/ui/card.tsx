import * as React from "react";
import { cn } from "@/lib/utils";

/** A raised surface. Zones are separated by elevation, not borders. */
export const Panel = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(({ className, ...p }, ref) => (
  <section ref={ref} className={cn("panel p-6", className)} {...p} />
));
Panel.displayName = "Panel";

export function PanelHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-5 flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-14 font-semibold text-fg">{title}</h2>
        {subtitle && <p className="mt-0.5 text-13 text-fg-3">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}

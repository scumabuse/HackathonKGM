import * as React from "react";
import { cn } from "@/lib/utils";

/** Neutral tag (object type, status words). Never colored — risk has its own RiskChip. */
export function Tag({ className, ...p }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-control bg-fg/[0.06] px-2 text-12 text-fg-2 [&_svg]:size-3.5", className)}
      {...p}
    />
  );
}

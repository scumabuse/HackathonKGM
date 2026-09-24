import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...p }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-fg/10 bg-fg/[0.04] px-2 py-0.5 text-[11px] font-medium text-muted-foreground",
        className,
      )}
      {...p}
    />
  );
}

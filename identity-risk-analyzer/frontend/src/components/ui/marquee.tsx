import * as React from "react";
import { cn } from "@/lib/utils";

/** Infinite horizontal marquee (duplicated track, CSS animation, pauses on hover, edge fade). */
export function Marquee({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn("group relative flex overflow-hidden [--gap:1rem]", className)}
      style={{ maskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)" }}
    >
      {[0, 1].map((i) => (
        <div
          key={i}
          aria-hidden={i === 1}
          className="flex shrink-0 animate-marquee items-center gap-[var(--gap)] pr-[var(--gap)] group-hover:[animation-play-state:paused]"
        >
          {children}
        </div>
      ))}
    </div>
  );
}

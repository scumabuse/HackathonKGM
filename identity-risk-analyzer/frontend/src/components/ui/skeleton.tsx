import { cn } from "@/lib/utils";

/** Loading placeholder with a calm shimmer (static under prefers-reduced-motion). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-control", className)} aria-hidden />;
}

import { motion } from "motion/react";
import { useI18n } from "@/lib/i18n";
import { LEVEL_META } from "@/lib/risk";
import type { RiskLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Risk level pill — color + icon + label (never color alone). Critical gets a live pulse. */
export function RiskBadge({ level, className, compact }: { level: RiskLevel; className?: string; compact?: boolean }) {
  const { level: levelName } = useI18n();
  const m = LEVEL_META[level];
  const Icon = m.icon;
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        m.text,
        m.soft,
        m.ring,
        className,
      )}
    >
      {level === "Critical" ? (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full opacity-75" style={{ background: m.color }} />
          <span className="relative inline-flex size-1.5 rounded-full" style={{ background: m.color }} />
        </span>
      ) : (
        <Icon className="size-3" aria-hidden />
      )}
      {!compact && levelName(level)}
      {compact && <span className="sr-only">{levelName(level)}</span>}
    </motion.span>
  );
}

/** Object Risk Score number (higher = worse), with its level color as a side rail. */
export function ScoreChip({ score, level, className }: { score: number; level: RiskLevel; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-sm font-semibold num text-foreground", className)}>
      <span className="h-3.5 w-1 rounded-full" style={{ background: LEVEL_META[level].color }} aria-hidden />
      {score}
    </span>
  );
}

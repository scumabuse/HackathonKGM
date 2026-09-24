import { useI18n } from "@/lib/i18n";
import { LEVEL_META } from "@/lib/risk";
import type { RiskLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Risk level chip: tinted background + a shape-coded icon in the risk color + the label in text ink.
 *  Identity never relies on color alone (octagon / triangle / dot / shield + the word). */
export function RiskChip({ level, className }: { level: RiskLevel; className?: string }) {
  const { level: levelName } = useI18n();
  const m = LEVEL_META[level];
  const Icon = m.icon;
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-control px-2 text-12 font-medium text-fg", m.soft, className)}>
      <Icon className="size-3.5 shrink-0" style={{ color: m.color }} aria-hidden />
      {levelName(level)}
    </span>
  );
}

/** Object Risk Score (higher = worse): mono number with a thin level-colored rail. */
export function ScoreCell({ score, level, className }: { score: number; level: RiskLevel; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-mono text-14 text-fg", className)}>
      <span className={cn("h-3.5 w-0.5 rounded-full", LEVEL_META[level].dot)} aria-hidden />
      {score}
    </span>
  );
}

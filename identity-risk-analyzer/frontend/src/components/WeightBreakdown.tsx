import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { WeightItem } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The "why this score" panel: each matched rule's weight, the unmatched checks, and the exact math. */
export function WeightBreakdown({ items, k, score, accent }: { items: WeightItem[]; k: number; score: number; accent: string }) {
  const [showAll, setShowAll] = useState(false);
  const { tp } = useI18n();
  const matched = items.filter((i) => i.matched);
  const unmatched = items.filter((i) => !i.matched);
  const product = matched.reduce((p, i) => p * (1 - i.weight), 1);
  const combined = 1 - product;

  const Row = ({ item, i }: { item: WeightItem; i: number }) => (
    <motion.li
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ delay: i * 0.06 }}
      className="grid grid-cols-[minmax(0,1fr)_minmax(90px,40%)_3rem] items-center gap-3 py-1.5"
    >
      <div className="min-w-0">
        <div className={cn("truncate text-sm", item.matched ? "text-foreground" : "text-muted-foreground")}>{item.title}</div>
        <div className="truncate font-mono text-[10.5px] text-muted-foreground/80">{item.rule}</div>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-fg/[0.05]">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: item.matched ? accent : "hsl(var(--muted-foreground) / 0.45)" }}
          initial={{ width: 0 }}
          animate={{ width: `${item.weight * 100}%` }}
          transition={{ delay: 0.15 + i * 0.07, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <div className={cn("text-right font-mono text-sm num", item.matched ? "text-foreground" : "text-muted-foreground/70")}>
        {item.weight.toFixed(2)}
      </div>
    </motion.li>
  );

  return (
    <div>
      <ul className="divide-y divide-fg/[0.04]">
        {matched.map((it, i) => (
          <Row key={it.rule} item={it} i={i} />
        ))}
      </ul>
      {unmatched.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
            aria-expanded={showAll}
          >
            <ChevronDown className={cn("size-3.5 transition", showAll && "rotate-180")} />
            {tp(showAll ? "breakdown.hide" : "breakdown.show", unmatched.length)}
          </button>
          <AnimatePresence>
            {showAll && (
              <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                {unmatched.map((it, i) => (
                  <Row key={it.rule} item={it} i={i} />
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </>
      )}
      <div className="mt-4 rounded-xl border border-fg/[0.07] bg-inset p-3 font-mono text-[12px] leading-relaxed text-muted-foreground">
        <div>
          score = min(100, round(100 · (1 − Π(1 − wᵢ)) · k))
        </div>
        <div className="mt-1 text-foreground/90">
          1 − ({matched.map((m) => (1 - m.weight).toFixed(2)).join(" × ") || "1"}) = {combined.toFixed(4)}
          <span className="text-muted-foreground"> × k {k.toFixed(1)}</span> → <span className="font-semibold" style={{ color: accent }}>{score}</span>
        </div>
      </div>
    </div>
  );
}

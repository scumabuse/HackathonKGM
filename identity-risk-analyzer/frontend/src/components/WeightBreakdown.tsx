import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { DUR, EASE, STAGGER } from "@/lib/motion";
import { LEVEL_META } from "@/lib/risk";
import type { RiskLevel, WeightItem } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Split the score into per-rule contributions that SUM to it.
 * score = 100·k·(1 − Π(1 − wᵢ)); taking rules heaviest-first, rule i adds 100·k·wᵢ·Π_{j<i}(1 − wⱼ).
 * Those parts sum to the unrounded score; they are rescaled to the shown (rounded, capped) score and
 * rounded with the largest-remainder method so the integers add up exactly.
 */
function contributions(matched: WeightItem[], score: number): number[] {
  let remaining = 1;
  const raw = matched.map((m) => {
    const c = remaining * m.weight;
    remaining *= 1 - m.weight;
    return c;
  });
  const total = raw.reduce((a, b) => a + b, 0);
  if (!total) return matched.map(() => 0);
  const scaled = raw.map((c) => (c / total) * score);
  const floors = scaled.map(Math.floor);
  let left = score - floors.reduce((a, b) => a + b, 0);
  scaled
    .map((v, i) => ({ i, r: v - Math.floor(v) }))
    .sort((a, b) => b.r - a.r)
    .forEach(({ i }) => {
      if (left > 0) {
        floors[i] += 1;
        left -= 1;
      }
    });
  return floors;
}

/** "Why this score": a 0–100 bar whose segments are each rule's contribution, then the rules themselves. */
export function WeightBreakdown({ items, k, score, level }: { items: WeightItem[]; k: number; score: number; level: RiskLevel }) {
  const reduce = useReducedMotion();
  const { t, tp } = useI18n();
  const [showAll, setShowAll] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const matched = items.filter((i) => i.matched);
  const unmatched = items.filter((i) => !i.matched);
  const parts = useMemo(() => contributions(matched, score), [matched, score]); // k is already inside `score`
  const color = LEVEL_META[level].color;
  const product = matched.reduce((p, i) => p * (1 - i.weight), 1);
  const delay = (i: number) => (reduce ? 0 : DUR.fast + i * 0.12);

  return (
    <div>
      {/* the stacked bar: segments sum to the score; 2px surface gaps separate them */}
      <div>
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-sm bg-fg/[0.07]" role="img" aria-label={`${t("account.contribution")}: ${score}`}>
          {matched.map((m, i) => (
            <motion.span
              key={m.rule}
              className="h-full first:rounded-l-sm last:rounded-r-sm"
              style={{ background: color, opacity: hover && hover !== m.rule ? 0.35 : 1 }}
              initial={{ width: reduce ? `${parts[i]}%` : 0 }}
              animate={{ width: `${parts[i]}%` }}
              transition={{ duration: reduce ? 0 : 0.45, ease: EASE, delay: delay(i) }}
              onMouseEnter={() => setHover(m.rule)}
              onMouseLeave={() => setHover(null)}
              title={`${m.title}: +${parts[i]}`}
            />
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-12 text-fg-3">
        <span>0</span>
        <span>100</span>
      </div>
      <p className="mt-3 text-13 text-fg-3">{t("account.contribution")}</p>

      <ul className="mt-5 divide-y divide-line">
        {matched.map((m, i) => (
          <motion.li
            key={m.rule}
            initial={{ opacity: 0, y: reduce ? 0 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.base, ease: EASE, delay: reduce ? 0 : i * STAGGER }}
            onMouseEnter={() => setHover(m.rule)}
            onMouseLeave={() => setHover(null)}
            className={cn("grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-x-4 py-3 transition-colors duration-fast sm:grid-cols-[minmax(0,1fr)_8rem_3rem_3.5rem]", hover === m.rule && "bg-fg/[0.02]")}
          >
            <div className="min-w-0">
              <div className="truncate text-14 text-fg">{m.title}</div>
              <div className="truncate font-mono text-12 text-fg-3">{m.rule}</div>
            </div>
            <div className="hidden h-1 overflow-hidden rounded-full bg-fg/[0.08] sm:block">
              <div className="h-full rounded-full bg-fg-3" style={{ width: `${m.weight * 100}%` }} />
            </div>
            <div className="hidden text-right font-mono text-13 text-fg-3 sm:block">{m.weight.toFixed(2)}</div>
            <div className="text-right font-mono text-14 text-fg">+{parts[i]}</div>
          </motion.li>
        ))}
      </ul>

      {unmatched.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="mt-3 inline-flex items-center gap-1 text-13 text-fg-2 transition-colors duration-fast hover:text-fg"
            aria-expanded={showAll}
          >
            <ChevronDown className={cn("size-4 transition-transform duration-fast", showAll && "rotate-180")} />
            {tp(showAll ? "breakdown.hide" : "breakdown.show", unmatched.length)}
          </button>
          <AnimatePresence initial={false}>
            {showAll && (
              <motion.ul
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: DUR.base, ease: EASE }}
                className="overflow-hidden"
              >
                {unmatched.map((m) => (
                  <li key={m.rule} className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-x-4 border-t border-line py-2 first:border-0">
                    <div className="min-w-0">
                      <div className="truncate text-13 text-fg-3">{m.title}</div>
                      <div className="truncate font-mono text-12 text-fg-3/70">{m.rule}</div>
                    </div>
                    <div className="text-right font-mono text-13 text-fg-3">{m.weight.toFixed(2)}</div>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </>
      )}

      <div className="mt-5 rounded-control bg-base px-3 py-2.5 font-mono text-12 text-fg-3">
        <div>score = min(100, round(100 · (1 − Π(1 − wᵢ)) · k))</div>
        <div className="mt-1 text-fg-2">
          1 − ({matched.map((m) => (1 - m.weight).toFixed(2)).join(" × ") || "1"}) = {(1 - product).toFixed(4)} × k {k.toFixed(1)} →{" "}
          <span className="text-fg">{score}</span>
        </div>
      </div>
    </div>
  );
}

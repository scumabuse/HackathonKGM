import { motion, useReducedMotion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { Tip } from "@/components/ui/tooltip";
import { useI18n } from "@/lib/i18n";
import { DUR, EASE, STAGGER } from "@/lib/motion";
import { CATEGORIES, CATEGORY_ICON } from "@/lib/risk";
import type { Dashboard } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChartCard, DataTable, TooltipBox } from "./ChartCard";

const CAP = 20; // each category can cost at most 20 points of the AD Security Score

/** Score penalty per category: one measure → one neutral hue; the track shows the 20-point cap. */
export function CategoryBar({ scores, matrix }: { scores: Dashboard["category_scores"]; matrix: Dashboard["category_matrix"] }) {
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const { t, category } = useI18n();
  const data = CATEGORIES.map((c) => {
    const m = matrix.find((x) => x.category === c);
    return { category: c, label: category(c), penalty: scores[c] ?? 0, findings: m?.total ?? 0, critical: m?.Critical ?? 0 };
  });
  const worst = Math.max(...data.map((d) => d.penalty));

  return (
    <ChartCard
      title={t("charts.penalty")}
      subtitle={t("charts.penaltySub")}
      chart={
        <ul className="space-y-1.5">
          {data.map((d, i) => {
            const Icon = CATEGORY_ICON[d.category];
            const isWorst = d.penalty > 0 && d.penalty === worst; // the category costing the most points
            return (
            <li key={d.category}>
              <Tip
                side="top"
                content={
                  <TooltipBox
                    title={d.label}
                    rows={[
                      { label: t("charts.penaltyLabel"), value: `−${d.penalty} / ${CAP}` },
                      { label: t("charts.findings"), value: d.findings },
                      { label: t("charts.onCritical"), value: d.critical },
                    ]}
                  />
                }
                className="bg-transparent p-0 shadow-none"
              >
                <button
                  type="button"
                  onClick={() => navigate(`/findings?category=${d.category}`)}
                  className="group grid h-10 w-full grid-cols-[8rem_1fr_4.5rem] items-center gap-3 rounded-control px-2 text-13 transition-colors duration-fast hover:bg-fg/[0.04]"
                >
                  <span className={cn("flex min-w-0 items-center gap-2 text-left", isWorst ? "text-fg" : "text-fg-2")}>
                    <Icon className="size-3.5 shrink-0 text-fg-3" aria-hidden />
                    <span className="truncate">{d.label}</span>
                  </span>
                  <span className="relative h-3 overflow-hidden rounded-full bg-fg/[0.05]">
                    <motion.span
                      className={cn(
                        "absolute inset-y-0 left-0 rounded-full transition-colors duration-fast",
                        isWorst ? "bg-fg" : "bg-fg/35 group-hover:bg-fg/55",
                      )}
                      initial={{ width: reduce ? `${(d.penalty / CAP) * 100}%` : 0 }}
                      animate={{ width: `${(d.penalty / CAP) * 100}%` }}
                      transition={{ duration: reduce ? 0 : 0.8, ease: EASE, delay: reduce ? 0 : DUR.fast + i * STAGGER }}
                    />
                  </span>
                  <span className={cn("text-right font-mono", isWorst ? "text-fg" : "text-fg-2")}>
                    −{d.penalty}
                    <span className="text-12 text-fg-3"> /{CAP}</span>
                  </span>
                </button>
              </Tip>
            </li>
            );
          })}
        </ul>
      }
      table={
        <DataTable
          head={[t("charts.category"), t("charts.penaltyLabel"), t("charts.findings"), t("levels.Critical")]}
          rows={data.map((d) => [d.label, `−${d.penalty}`, d.findings, d.critical])}
        />
      }
    />
  );
}

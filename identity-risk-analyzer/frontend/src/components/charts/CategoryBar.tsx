import { motion, useReducedMotion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { Tip } from "@/components/ui/tooltip";
import { useI18n } from "@/lib/i18n";
import { DUR, EASE, STAGGER } from "@/lib/motion";
import { CATEGORIES } from "@/lib/risk";
import type { Dashboard } from "@/lib/types";
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

  return (
    <ChartCard
      title={t("charts.penalty")}
      subtitle={t("charts.penaltySub")}
      chart={
        <ul className="space-y-1">
          {data.map((d, i) => (
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
                  className="grid h-9 w-full grid-cols-[7.5rem_1fr_4.5rem] items-center gap-3 rounded-control px-2 text-13 transition-colors duration-fast hover:bg-fg/[0.04]"
                >
                  <span className="truncate text-left text-fg-2">{d.label}</span>
                  <span className="relative h-2 overflow-hidden rounded-sm bg-fg/[0.07]">
                    <motion.span
                      className="absolute inset-y-0 left-0 rounded-r-sm bg-fg-2"
                      initial={{ width: reduce ? `${(d.penalty / CAP) * 100}%` : 0 }}
                      animate={{ width: `${(d.penalty / CAP) * 100}%` }}
                      transition={{ duration: reduce ? 0 : 0.6, ease: EASE, delay: reduce ? 0 : DUR.fast + i * STAGGER }}
                    />
                  </span>
                  <span className="text-right font-mono text-fg">
                    −{d.penalty}
                    <span className="text-12 text-fg-3"> /{CAP}</span>
                  </span>
                </button>
              </Tip>
            </li>
          ))}
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

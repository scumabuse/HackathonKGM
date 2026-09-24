import { useReducedMotion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { useI18n } from "@/lib/i18n";
import { LEVELS, LEVEL_META } from "@/lib/risk";
import type { RiskLevel } from "@/lib/types";
import { ChartCard, DataTable, TooltipBox } from "./ChartCard";

/** Part-to-whole of at-risk objects by level: a thin ring with 2px surface gaps + a labelled legend. */
export function RiskDonut({ counts }: { counts: Record<RiskLevel, number> }) {
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const { t, tp, level } = useI18n();
  const total = LEVELS.reduce((s, l) => s + (counts[l] ?? 0), 0);
  const data = LEVELS.map((l) => ({ level: l, value: counts[l] ?? 0 }));
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0);

  return (
    <ChartCard
      title={t("charts.byLevel")}
      subtitle={t("charts.byLevelSub")}
      chart={
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
          <div className="relative size-[168px] shrink-0">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="level"
                  innerRadius={66}
                  outerRadius={82}
                  startAngle={90}
                  endAngle={-270}
                  stroke="rgb(var(--raised))"
                  strokeWidth={2}
                  isAnimationActive={!reduce}
                  animationDuration={700}
                  onClick={(d) => navigate(`/findings?level=${(d as { level: string }).level}`)}
                  cursor="pointer"
                >
                  {data.map((d) => (
                    <Cell key={d.level} fill={LEVEL_META[d.level].color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <TooltipBox
                        title={level(payload[0].name as RiskLevel)}
                        rows={[{ key: LEVEL_META[payload[0].name as RiskLevel].color, label: t("charts.objects"), value: `${payload[0].value} · ${pct(Number(payload[0].value))}%` }]}
                      />
                    ) : null
                  }
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <AnimatedCounter value={total} className="font-mono text-28 text-fg" />
              <span className="max-w-24 text-center text-12 text-fg-3">{tp("charts.objectsAtRisk", total)}</span>
            </div>
          </div>
          <ul className="w-full space-y-0.5">
            {data.map((d) => (
              <li key={d.level}>
                <button
                  type="button"
                  onClick={() => navigate(`/findings?level=${d.level}`)}
                  className="flex h-9 w-full items-center gap-3 rounded-control px-2 text-13 transition-colors duration-fast hover:bg-fg/[0.04]"
                >
                  <span className={`size-2 shrink-0 rounded-full ${LEVEL_META[d.level].dot}`} aria-hidden />
                  <span className="flex-1 text-left text-fg-2">{level(d.level)}</span>
                  <span className="font-mono text-fg">{d.value}</span>
                  <span className="w-10 text-right font-mono text-12 text-fg-3">{pct(d.value)}%</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      }
      table={
        <DataTable
          head={[t("charts.level"), t("charts.objects"), t("charts.share")]}
          rows={data.map((d) => [level(d.level), d.value, `${pct(d.value)}%`])}
        />
      }
    />
  );
}

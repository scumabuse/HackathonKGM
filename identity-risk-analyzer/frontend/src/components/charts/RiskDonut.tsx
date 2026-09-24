import { useReducedMotion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { useI18n } from "@/lib/i18n";
import { LEVELS, LEVEL_META } from "@/lib/risk";
import type { RiskLevel } from "@/lib/types";
import { ChartCard, DataTable, TooltipBox } from "./ChartCard";

const SURFACE = "hsl(var(--card))";

/** Part-to-whole of at-risk objects by level (4 segments, status colors, legend + labels always shown). */
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
        <div className="flex flex-col items-center gap-3">
          <div className="relative h-[176px] w-[176px] shrink-0">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="level"
                  innerRadius={60}
                  outerRadius={86}
                  startAngle={90}
                  endAngle={-270}
                  stroke={SURFACE}
                  strokeWidth={2}
                  isAnimationActive={!reduce}
                  animationDuration={900}
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
                        rows={[{ label: t("charts.objects"), value: `${payload[0].value} (${pct(Number(payload[0].value))}%)` }]}
                      />
                    ) : null
                  }
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <AnimatedCounter value={total} className="text-3xl font-semibold text-foreground" />
              <span className="text-[11px] text-muted-foreground">{tp("charts.objectsAtRisk", total)}</span>
            </div>
          </div>
          <ul className="grid w-full grid-cols-2 gap-1">
            {data.map((d) => (
              <li key={d.level}>
                <button
                  type="button"
                  title={`${t("common.objectRiskScore")} ${LEVEL_META[d.level].range}`}
                  onClick={() => navigate(`/findings?level=${d.level}`)}
                  className="flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-lg px-2 py-1.5 text-[13px] transition hover:bg-fg/[0.05]"
                >
                  <span className="inline-flex items-center gap-2 text-foreground/90">
                    <span className="size-2.5 rounded-[3px]" style={{ background: LEVEL_META[d.level].color }} />
                    {level(d.level)}
                  </span>
                  <span className="font-mono num text-foreground">
                    {d.value} <span className="text-muted-foreground">{pct(d.value)}%</span>
                  </span>
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

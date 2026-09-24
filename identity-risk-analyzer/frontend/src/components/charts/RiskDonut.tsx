import { useReducedMotion } from "motion/react";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { useI18n } from "@/lib/i18n";
import { LEVELS, LEVEL_META } from "@/lib/risk";
import type { RiskLevel } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChartCard, DataTable } from "./ChartCard";

/**
 * Part-to-whole of at-risk objects by level: a ring with surface gaps, the total in the centre and a legend
 * that doubles as the level filter. Hovering a segment or a legend row highlights the pair.
 */
export function RiskDonut({
  counts,
  title,
  subtitle,
  footer,
}: {
  counts: Record<RiskLevel, number>;
  title?: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const { t, tp, level } = useI18n();
  const [hover, setHover] = useState<RiskLevel | null>(null);
  const total = LEVELS.reduce((s, l) => s + (counts[l] ?? 0), 0);
  const data = LEVELS.map((l) => ({ level: l, value: counts[l] ?? 0 }));
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0);
  const focus = hover ? data.find((d) => d.level === hover) : null;

  return (
    <ChartCard
      title={title ?? t("charts.byLevel")}
      subtitle={subtitle ?? t("charts.byLevelSub")}
      chart={
        <div className="flex h-full flex-col">
          <div className="my-auto flex flex-col items-center gap-6 py-2 sm:flex-row sm:gap-10">
            <div className="relative size-[232px] shrink-0" onMouseLeave={() => setHover(null)}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="level"
                    innerRadius={82}
                    outerRadius={114}
                    startAngle={90}
                    endAngle={-270}
                    paddingAngle={2}
                    cornerRadius={3}
                    stroke="none"
                    isAnimationActive={!reduce}
                    animationDuration={900}
                    onMouseEnter={(d) => setHover((d as { level: RiskLevel }).level)}
                    onClick={(d) => navigate(`/findings?level=${(d as { level: string }).level}`)}
                    cursor="pointer"
                  >
                    {data.map((d) => (
                      <Cell
                        key={d.level}
                        fill={LEVEL_META[d.level].color}
                        style={{ opacity: hover && hover !== d.level ? 0.25 : 1, transition: "opacity 200ms ease-out", outline: "none" }}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                {focus ? (
                  <>
                    <span className="font-mono text-56 font-medium leading-none text-fg">{focus.value}</span>
                    <span className="mt-1.5 text-12 text-fg-3">
                      {level(focus.level)} · {pct(focus.value)}%
                    </span>
                  </>
                ) : (
                  <>
                    <AnimatedCounter value={total} className="font-mono text-56 font-medium leading-none text-fg" />
                    <span className="mt-1.5 max-w-28 text-center text-12 text-fg-3">{tp("charts.objectsAtRisk", total)}</span>
                  </>
                )}
              </div>
            </div>
            <ul className="w-full space-y-1" onMouseLeave={() => setHover(null)}>
              {data.map((d) => {
                const Icon = LEVEL_META[d.level].icon;
                return (
                  <li key={d.level}>
                    <button
                      type="button"
                      onMouseEnter={() => setHover(d.level)}
                      onFocus={() => setHover(d.level)}
                      onBlur={() => setHover(null)}
                      onClick={() => navigate(`/findings?level=${d.level}`)}
                      className={cn(
                        "grid w-full grid-cols-[1fr_auto_3rem] items-center gap-3 rounded-control px-3 py-2 text-left transition-[background-color,opacity] duration-fast",
                        hover === d.level ? "bg-fg/[0.05]" : "hover:bg-fg/[0.04]",
                        hover && hover !== d.level && "opacity-50",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Icon className="size-4 shrink-0" style={{ color: LEVEL_META[d.level].color }} aria-hidden />
                        <span className="min-w-0">
                          <span className="block truncate text-14 text-fg">{level(d.level)}</span>
                          <span className="block font-mono text-12 text-fg-3">{LEVEL_META[d.level].range}</span>
                        </span>
                      </span>
                      <span className="font-mono text-20 text-fg">{d.value}</span>
                      <span className="text-right font-mono text-12 text-fg-3">{pct(d.value)}%</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          {footer && <div className="pt-5">{footer}</div>}
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

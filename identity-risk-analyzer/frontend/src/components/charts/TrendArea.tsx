import { useReducedMotion } from "motion/react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Dashboard } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { ChartCard, DataTable, TooltipBox } from "./ChartCard";

const ACCENT = "hsl(var(--primary))";
const SURFACE = "hsl(var(--card))";

/** AD Security Score over scan history — single series: 2px line, 10% wash, ringed end-dot, crosshair tooltip. */
export function TrendArea({ trend }: { trend: Dashboard["trend"] }) {
  const reduce = useReducedMotion();
  const { t, tp, fmtDate, fmtDateTime, trigger } = useI18n();
  const data = trend.map((pt, i) => ({ ...pt, idx: i, label: fmtDate(pt.at) }));
  const scores = data.map((d) => d.score);
  const lo = Math.max(0, Math.floor((Math.min(...scores, 100) - 8) / 10) * 10);
  const hi = Math.min(100, Math.ceil((Math.max(...scores, 0) + 8) / 10) * 10);
  const ticks = Array.from({ length: Math.round((hi - lo) / 10) + 1 }, (_, i) => lo + i * 10);
  const last = data[data.length - 1];

  const EndDot = (props: { cx?: number; cy?: number; index?: number }) =>
    props.index === data.length - 1 && props.cx != null && props.cy != null ? (
      <g key={`dot-${props.index}`}>
        <circle cx={props.cx} cy={props.cy} r={6} fill={SURFACE} />
        <circle cx={props.cx} cy={props.cy} r={4} fill={ACCENT} />
        <text x={props.cx - 8} y={props.cy - 12} textAnchor="end" fill="hsl(var(--foreground))" fontSize={12} fontWeight={600}>
          {last?.score}
        </text>
      </g>
    ) : (
      <g key={`dot-${props.index}`} />
    );

  return (
    <ChartCard
      title={t("charts.trend")}
      subtitle={tp("charts.trendSub", data.length)}
      chart={
        data.length < 2 ? (
          <div className="grid h-[200px] place-items-center text-center text-sm text-muted-foreground">
            {t("charts.runAnotherTrend")}
          </div>
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer>
              <AreaChart data={data} margin={{ top: 22, right: 16, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="trend-wash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT} stopOpacity={0.14} />
                    <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} minTickGap={16} />
                <YAxis domain={[lo, hi]} ticks={ticks} tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} width={44} allowDecimals={false} />
                <Tooltip
                  cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as (typeof data)[number];
                    return (
                      <TooltipBox
                        title={fmtDateTime(d.at)}
                        rows={[
                          { key: ACCENT, label: t("common.adSecurityScore"), value: d.score },
                          { label: t("charts.findings"), value: d.findings },
                          { label: t("charts.trigger"), value: trigger(d.trigger) },
                        ]}
                      />
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke={ACCENT}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="url(#trend-wash)"
                  dot={EndDot}
                  activeDot={{ r: 4, fill: ACCENT, stroke: SURFACE, strokeWidth: 2 }}
                  isAnimationActive={!reduce}
                  animationDuration={1200}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )
      }
      table={
        <DataTable
          head={[t("charts.scan"), t("charts.score"), t("charts.findings"), t("charts.trigger")]}
          rows={[...data].reverse().map((d) => [fmtDateTime(d.at), d.score, d.findings, trigger(d.trigger)])}
        />
      }
    />
  );
}

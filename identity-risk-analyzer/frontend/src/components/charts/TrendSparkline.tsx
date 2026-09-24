import { useReducedMotion } from "motion/react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { useI18n } from "@/lib/i18n";
import { TooltipBox } from "./ChartCard";

interface Point {
  at: string;
  score: number;
  findings?: number;
  trigger?: string;
}

const INK = "rgb(var(--fg))";

/**
 * Small score-over-time sparkline: 2px ink line, soft wash, ringed end-dot, crosshair tooltip.
 * The first/last dates and the current value are labelled, so the tooltip never gates a value.
 */
export function TrendSparkline({ points, label, valueLabel, height = 56 }: { points: Point[]; label: string; valueLabel: string; height?: number }) {
  const reduce = useReducedMotion();
  const { t, fmtDate, fmtDateTime, trigger } = useI18n();
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const scores = points.map((p) => p.score);
  const lo = Math.max(0, Math.min(...scores) - 6);
  const hi = Math.min(100, Math.max(...scores) + 6);

  const EndDot = (props: { cx?: number; cy?: number; index?: number }) =>
    props.index === points.length - 1 && props.cx != null && props.cy != null ? (
      <g key="end">
        <circle cx={props.cx} cy={props.cy} r={6} fill="rgb(var(--raised))" />
        <circle cx={props.cx} cy={props.cy} r={4} fill="rgb(var(--fg))" />
      </g>
    ) : (
      <g key={`d-${props.index}`} />
    );

  return (
    <figure aria-label={`${label}: ${points.map((p) => p.score).join(", ")}`}>
      <figcaption className="mb-2 flex items-baseline justify-between">
        <span className="tech">{label}</span>
        <span className="font-mono text-14 text-fg">{last.score}</span>
      </figcaption>
      <div style={{ height }}>
        <ResponsiveContainer>
          <AreaChart data={points} margin={{ top: 6, right: 6, bottom: 2, left: 6 }}>
            <defs>
              <linearGradient id="spark-wash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={INK} stopOpacity={0.14} />
                <stop offset="100%" stopColor={INK} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis domain={[lo, hi]} hide />
            <Tooltip
              cursor={{ stroke: "rgb(var(--fg) / 0.2)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as Point;
                return (
                  <TooltipBox
                    title={fmtDateTime(d.at)}
                    rows={[
                      { label: valueLabel, value: d.score },
                      ...(d.findings != null ? [{ label: t("charts.findings"), value: d.findings }] : []),
                      ...(d.trigger ? [{ label: t("charts.trigger"), value: trigger(d.trigger) }] : []),
                    ]}
                  />
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke={INK}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="url(#spark-wash)"
              dot={EndDot}
              activeDot={{ r: 4, fill: "rgb(var(--fg))", stroke: "rgb(var(--raised))", strokeWidth: 2 }}
              isAnimationActive={!reduce}
              animationDuration={900}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex justify-between font-mono text-12 text-fg-3">
        <span>{fmtDate(points[0].at)}</span>
        <span>{fmtDate(last.at)}</span>
      </div>
    </figure>
  );
}

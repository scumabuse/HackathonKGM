import { motion, useReducedMotion } from "motion/react";
import { useI18n } from "@/lib/i18n";
import { DUR, EASE } from "@/lib/motion";
import { BAND_COLOR, bandFor } from "@/lib/risk";
import { AnimatedCounter } from "./AnimatedCounter";

const CX = 100;
const CY = 100;
const R = 76;
const START = 150; // degrees (SVG, y down) — the gap sits at the bottom
const SWEEP = 240;
const BAND_EDGES = [0, 40, 60, 80, 100]; // bandFor(): < 40 Critical, 40–59 Poor, 60–79 Fair, ≥ 80 Good
const MINOR = Array.from({ length: 21 }, (_, i) => i * 5);

const point = (deg: number, r = R) => {
  const rad = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)] as const;
};
const degOf = (pct: number) => START + (SWEEP * pct) / 100;

function arc(fromPct: number, toPct: number) {
  const a0 = degOf(fromPct);
  const a1 = degOf(toPct);
  const [x0, y0] = point(a0);
  const [x1, y1] = point(a1);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/**
 * AD Security Score (0–100, HIGHER IS BETTER) — the dashboard's focal point, drawn like the landing radar:
 * a thin arc colored by health band on an instrument bezel (a tick every 5 points, labelled band edges).
 */
export function ScoreGauge({ score, size = 280 }: { score: number; size?: number }) {
  const reduce = useReducedMotion();
  const { t } = useI18n();
  const band = bandFor(score);
  const full = arc(0, 100);

  return (
    <div className="relative mx-auto" style={{ width: size, maxWidth: "100%" }}>
      <svg
        viewBox="0 0 200 176"
        className="w-full overflow-visible"
        role="img"
        aria-label={`${t("common.adSecurityScore")} ${score} ${t("common.of100")} — ${t(`bands.${band}`)}, ${t("common.higherBetter")}`}
      >
        {/* bezel: minor ticks every 5, longer at band edges, with mono labels */}
        {MINOR.map((v) => {
          const edge = BAND_EDGES.includes(v);
          const [x0, y0] = point(degOf(v), R + 9);
          const [x1, y1] = point(degOf(v), R + (edge ? 15 : 12));
          return <line key={v} x1={x0} y1={y0} x2={x1} y2={y1} className={edge ? "stroke-fg/45" : "stroke-fg/20"} strokeWidth={edge ? 1 : 0.7} />;
        })}
        {BAND_EDGES.map((v) => {
          const [x, y] = point(degOf(v), R + 24);
          return (
            <text key={v} x={x} y={y} textAnchor="middle" dominantBaseline="central" className="fill-fg-3 font-mono" fontSize="7.5">
              {v}
            </text>
          );
        })}
        <path d={full} fill="none" stroke="rgb(var(--fg) / 0.07)" strokeWidth={7} strokeLinecap="round" />
        <motion.path
          d={full}
          fill="none"
          stroke={BAND_COLOR[band]}
          strokeWidth={7}
          strokeLinecap="round"
          initial={{ pathLength: reduce ? score / 100 : 0 }}
          animate={{ pathLength: Math.max(0.001, score / 100) }}
          transition={{ duration: reduce ? 0 : 1.1, ease: EASE, delay: reduce ? 0 : DUR.fast }}
        />
        {/* needle cap at the current value */}
        {(() => {
          const [x, y] = point(degOf(score));
          return (
            <motion.circle
              cx={x}
              cy={y}
              r={5.5}
              fill="rgb(var(--raised))"
              stroke={BAND_COLOR[band]}
              strokeWidth={2.5}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reduce ? 0 : 1.1, duration: DUR.base }}
            />
          );
        })()}
      </svg>
      <div className="pointer-events-none absolute inset-x-0 top-[30%] flex flex-col items-center">
        <AnimatedCounter value={score} className="font-mono text-[76px] font-medium leading-none tracking-[-0.04em] text-fg" />
        <span className="mt-2 font-mono text-13 text-fg-3">/ 100</span>
      </div>
    </div>
  );
}

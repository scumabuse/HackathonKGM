import { motion, useReducedMotion } from "motion/react";
import { useI18n } from "@/lib/i18n";
import { DUR, EASE } from "@/lib/motion";
import { BAND_COLOR, bandFor } from "@/lib/risk";
import { AnimatedCounter } from "./AnimatedCounter";

const CX = 100;
const CY = 100;
const R = 84;
const START = 150; // degrees (SVG, y down) — the gap sits at the bottom
const SWEEP = 240;

const point = (deg: number, r = R) => {
  const rad = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
};

function arc(fromPct: number, toPct: number) {
  const a0 = START + (SWEEP * fromPct) / 100;
  const a1 = START + (SWEEP * toPct) / 100;
  const [x0, y0] = point(a0);
  const [x1, y1] = point(a1);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/**
 * AD Security Score (0–100, HIGHER IS BETTER) — the dashboard's focal point.
 * Thin arc colored by health band, sweeping to the value once; band edges are hairline ticks, not colored rails.
 */
export function ScoreGauge({ score, size = 216 }: { score: number; size?: number }) {
  const reduce = useReducedMotion();
  const { t } = useI18n();
  const band = bandFor(score);
  const full = arc(0, 100);

  return (
    <div className="relative mx-auto" style={{ width: size, maxWidth: "100%" }}>
      <svg
        viewBox="0 0 200 172"
        className="w-full"
        role="img"
        aria-label={`${t("common.adSecurityScore")} ${score} ${t("common.of100")} — ${t(`bands.${band}`)}, ${t("common.higherBetter")}`}
      >
        <path d={full} fill="none" stroke="rgb(var(--fg) / 0.08)" strokeWidth={10} strokeLinecap="round" />
        {[40, 60, 80].map((edge) => {
          const deg = START + (SWEEP * edge) / 100;
          const [x0, y0] = point(deg, R - 9);
          const [x1, y1] = point(deg, R + 9);
          return <line key={edge} x1={x0} y1={y0} x2={x1} y2={y1} stroke="rgb(var(--raised))" strokeWidth={2} />;
        })}
        <motion.path
          d={full}
          fill="none"
          stroke={BAND_COLOR[band]}
          strokeWidth={10}
          strokeLinecap="round"
          initial={{ pathLength: reduce ? score / 100 : 0 }}
          animate={{ pathLength: Math.max(0.001, score / 100) }}
          transition={{ duration: reduce ? 0 : 0.9, ease: EASE, delay: reduce ? 0 : DUR.fast }}
        />
      </svg>
      <div className="pointer-events-none absolute inset-x-0 top-[34%] flex flex-col items-center">
        <AnimatedCounter value={score} className="font-mono text-56 font-medium text-fg" />
        <span className="mt-1 font-mono text-12 text-fg-3">/ 100</span>
      </div>
    </div>
  );
}

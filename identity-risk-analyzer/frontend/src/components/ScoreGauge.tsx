import { motion, useReducedMotion } from "motion/react";
import { useI18n } from "@/lib/i18n";
import { BAND_COLOR, bandFor } from "@/lib/risk";
import { AnimatedCounter } from "./AnimatedCounter";

const CX = 110;
const CY = 110;
const R = 88;
const START = 150; // degrees, SVG coordinates (y down) — gap at the bottom
const SWEEP = 240;

function point(deg: number) {
  const rad = (deg * Math.PI) / 180;
  return [CX + R * Math.cos(rad), CY + R * Math.sin(rad)];
}

function arc(fromPct: number, toPct: number) {
  const a0 = START + (SWEEP * fromPct) / 100;
  const a1 = START + (SWEEP * toPct) / 100;
  const [x0, y0] = point(a0);
  const [x1, y1] = point(a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

// Band boundaries of the AD Security Score (higher is better)
const BANDS = [
  { from: 0, to: 40, color: BAND_COLOR.Critical },
  { from: 40, to: 60, color: BAND_COLOR.Poor },
  { from: 60, to: 80, color: BAND_COLOR.Fair },
  { from: 80, to: 100, color: BAND_COLOR.Good },
];

/** Animated arc gauge for the AD Security Score (0–100, HIGHER IS BETTER). */
export function ScoreGauge({ score, delta, size = 240 }: { score: number; delta?: number | null; size?: number }) {
  const reduce = useReducedMotion();
  const { t } = useI18n();
  const band = bandFor(score);
  const color = BAND_COLOR[band];
  const full = arc(0, 100);

  return (
    <div className="relative mx-auto" style={{ width: size, maxWidth: "100%" }}>
      <svg viewBox="0 0 220 190" className="w-full" role="img" aria-label={`${t("common.adSecurityScore")} ${score} ${t("common.of100")}, ${t(`bands.${band}`)} — ${t("common.higherBetter")}`}>
        <defs>
          <filter id="gauge-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path d={full} fill="none" stroke="hsl(var(--muted))" strokeWidth={16} strokeLinecap="round" />
        {/* band context: thin rail on the inside of the track */}
        {BANDS.map((b) => (
          <path key={b.from} d={arc(b.from + 0.8, b.to - 0.8)} fill="none" stroke={b.color} strokeOpacity={0.35} strokeWidth={2} transform="translate(110 110) scale(0.83) translate(-110 -110)" />
        ))}
        <motion.path
          d={full}
          fill="none"
          stroke={color}
          strokeWidth={16}
          strokeLinecap="round"
          filter="url(#gauge-glow)"
          initial={{ pathLength: reduce ? score / 100 : 0 }}
          animate={{ pathLength: Math.max(0.001, score / 100) }}
          transition={{ duration: reduce ? 0 : 1.6, ease: [0.16, 1, 0.3, 1] }}
        />
        {[0, 40, 60, 80, 100].map((t) => {
          const [x, y] = (() => {
            const rad = ((START + (SWEEP * t) / 100) * Math.PI) / 180;
            return [CX + (R + 15) * Math.cos(rad), CY + (R + 15) * Math.sin(rad)];
          })();
          return (
            <text key={t} x={x} y={y + 3} textAnchor="middle" className="fill-muted-foreground" fontSize={8.5}>
              {t}
            </text>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-x-0 top-[33%] flex flex-col items-center">
        <AnimatedCounter value={score} className="text-[56px] font-semibold leading-none tracking-tight text-foreground" />
        <span className="mt-1 text-xs text-muted-foreground">{t("common.of100")}</span>
        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-fg/10 px-2.5 py-0.5 text-xs font-medium text-foreground">
          <span className="size-2 rounded-full" style={{ background: color }} />
          {t(`bands.${band}`)}
          {typeof delta === "number" && delta !== 0 && (
            <span className={delta > 0 ? "text-risk-fg-low" : "text-risk-fg-critical"}>
              {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

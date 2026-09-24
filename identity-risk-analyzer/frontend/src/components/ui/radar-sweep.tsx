import { useI18n } from "@/lib/i18n";
import { LEVEL_META, tint } from "@/lib/risk";
import type { Entity, RiskLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

const PERIOD = 8; // seconds per revolution — must match `animate-sweep` / `animate-blip` in tailwind.config.ts
const TICKS = Array.from({ length: 72 }, (_, i) => i * 5); // bezel ticks every 5°
const BEARINGS = [0, 90, 180, 270];

/** Static instrument face: a faintly darker scope, a bezel with ticks and bearings, hairline range rings. */
function ScopeFace() {
  const polar = (deg: number, r: number) => {
    const a = (deg * Math.PI) / 180;
    return [50 + r * Math.sin(a), 50 - r * Math.cos(a)] as const;
  };
  return (
    <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
      {/* range rings: outer solid, inner dashed */}
      <circle cx="50" cy="50" r="49.6" fill="none" className="stroke-fg/25" strokeWidth="0.35" />
      {[10, 20, 30, 40].map((r) => (
        <circle key={r} cx="50" cy="50" r={r} fill="none" className="stroke-fg/[0.12]" strokeWidth="0.25" strokeDasharray={r === 40 ? undefined : "0.6 0.9"} />
      ))}
      {/* crosshair */}
      <line x1="50" y1="1" x2="50" y2="99" className="stroke-fg/[0.08]" strokeWidth="0.2" />
      <line x1="1" y1="50" x2="99" y2="50" className="stroke-fg/[0.08]" strokeWidth="0.2" />
      {/* bezel ticks: long every 30°, short every 5° */}
      {TICKS.map((d) => {
        const long = d % 30 === 0;
        const [x1, y1] = polar(d, 49.6);
        const [x2, y2] = polar(d, long ? 46.6 : 48.3);
        return <line key={d} x1={x1} y1={y1} x2={x2} y2={y2} className={long ? "stroke-fg/40" : "stroke-fg/20"} strokeWidth={long ? 0.35 : 0.22} />;
      })}
      {/* bearings */}
      {BEARINGS.map((d) => {
        const [x, y] = polar(d, 43);
        return (
          <text key={d} x={x} y={y} textAnchor="middle" dominantBaseline="central" className="fill-fg-3 font-mono" fontSize="2.4" letterSpacing="0.1">
            {String(d).padStart(3, "0")}
          </text>
        );
      })}
      {/* centre reticle */}
      <circle cx="50" cy="50" r="1.6" fill="none" className="stroke-fg/40" strokeWidth="0.25" />
    </svg>
  );
}

/**
 * The landing's radar, drawn as an instrument. Honest by construction: one blip per at-risk object of the
 * latest scan, colored by its level, placed by its score (riskier = closer to the centre) at a stable angle.
 * The beam turns clockwise and each blip flares exactly when the beam passes it. Risk color only on data.
 *
 * Interactive when `onSelect` is given: blips become buttons, the selected one is locked on (a bearing line
 * from the centre, a soft glow, the rest dimmed) and `visible` hides whole levels.
 */
export function RadarSweep({
  entities = [],
  className,
  selectedId,
  onSelect,
  visible,
  ghosts,
}: {
  entities?: Entity[];
  className?: string;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  visible?: ReadonlySet<RiskLevel>;
  /** objects modelled as fixed: drawn as fading hollow rings at the rim (simulator) */
  ghosts?: ReadonlySet<string>;
}) {
  const { t, level } = useI18n();
  const blips = entities.map((e) => {
    const hash = [...e.object_id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const phi = hash % 360; // degrees clockwise from 12 o'clock
    const r = ghosts?.has(e.object_id) ? 46 : 6 + ((100 - e.score) / 100) * 38; // % of the scope, 6..44 (inside the bearing labels); fixed → rim
    const rad = (phi * Math.PI) / 180;
    return {
      e,
      phi,
      r,
      x: 50 + r * Math.sin(rad),
      y: 50 - r * Math.cos(rad),
      delay: (phi / 360) * PERIOD - PERIOD, // negative: already running; flare when the beam reaches phi
      enter: (phi / 360) * 0.9, // entrance stagger follows the bearing, like a first sweep
    };
  });
  const interactive = !!onSelect;
  const selected = blips.find((b) => b.e.object_id === selectedId);

  return (
    <div className={cn("relative aspect-square w-full", className)} aria-hidden={!interactive || undefined}>
      {/* scope glass: a faint graphite fill so the instrument reads darker than the page; click clears */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: "radial-gradient(circle at 50% 45%, rgb(var(--fg) / 0.015) 0%, rgb(var(--fg) / 0.05) 70%, rgb(var(--fg) / 0.07) 100%)",
          boxShadow: "inset 0 2px 18px rgb(var(--fg) / 0.06)",
        }}
        onClick={() => onSelect?.(null)}
      />
      <ScopeFace />
      {/* beam: bright leading edge at the rotation angle, trail behind it */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
        <div
          className="absolute inset-0 animate-sweep motion-reduce:hidden"
          style={{ background: "conic-gradient(from 0deg, transparent 0deg, transparent 280deg, rgb(var(--fg) / 0.07) 350deg, rgb(var(--fg) / 0.20) 360deg)" }}
        />
      </div>
      {/* lock-on: bearing line from the centre to the selected object */}
      {selected && (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 w-px origin-top bg-fg/60"
          style={{ height: `${selected.r}%`, transform: `rotate(${selected.phi + 180}deg)` }}
          aria-hidden
        />
      )}
      {blips.map(({ e, x, y, delay, enter }) => {
        const shown = !visible || visible.has(e.level);
        const isSel = e.object_id === selectedId;
        const dimmed = !!selected && !isSel;
        const color = LEVEL_META[e.level].color;
        const dot = cn("block size-2 rounded-full", LEVEL_META[e.level].dot);
        const style = {
          left: `${x}%`,
          top: `${y}%`,
          animation: `blip-in 500ms cubic-bezier(0.2, 0.8, 0.2, 1) ${enter.toFixed(2)}s both`,
          // a changed score (simulator) glides the blip to its new range instead of jumping
          transition: "left 700ms cubic-bezier(0.2, 0.8, 0.2, 1), top 700ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 500ms",
        };
        if (ghosts?.has(e.object_id)) {
          return (
            <span key={e.object_id} className="absolute -ml-1 -mt-1 opacity-40" style={style}>
              <span className="block size-2 rounded-full border" style={{ borderColor: color }} />
            </span>
          );
        }
        if (!interactive) {
          return (
            <span key={e.object_id} className="absolute -ml-1 -mt-1" style={style}>
              <span
                className={cn(dot, "opacity-90 transition-colors duration-slow animate-blip motion-reduce:animate-none")}
                style={{ animationDelay: `${delay.toFixed(2)}s`, boxShadow: `0 0 0 2px rgb(var(--raised)), 0 0 9px 1px ${tint(LEVEL_META[e.level].color, 55)}` }}
              />
            </span>
          );
        }
        return (
          <button
            key={e.object_id}
            type="button"
            tabIndex={shown ? 0 : -1}
            aria-hidden={!shown || undefined}
            aria-pressed={isSel}
            aria-label={t("radar.blipAria", { name: e.object_name, score: e.score, level: level(e.level) })}
            onClick={() => onSelect?.(isSel ? null : e.object_id)}
            className={cn("group absolute -ml-3 -mt-3 size-6 rounded-full outline-none", isSel && "z-10")}
            style={style}
          >
            <span
              className={cn(
                "grid size-full place-items-center rounded-full transition-[opacity,transform] duration-base ease-out",
                shown ? "scale-100 group-hover:scale-[1.4] group-focus-visible:scale-[1.4]" : "pointer-events-none scale-0 opacity-0",
                dimmed && "opacity-25 group-hover:opacity-100",
              )}
            >
              {isSel && (
                <span
                  className="absolute inset-0 rounded-full border border-fg/60"
                  style={{ background: tint(color, 14), boxShadow: `0 0 18px 2px ${tint(color, 45)}` }}
                  aria-hidden
                />
              )}
              <span
                className={cn(
                  dot,
                  "relative group-focus-visible:ring-2 group-focus-visible:ring-accent",
                  isSel ? "scale-150" : "opacity-90 animate-blip motion-reduce:animate-none",
                )}
                style={{ animationDelay: isSel ? undefined : `${delay.toFixed(2)}s`, boxShadow: `0 0 0 2px rgb(var(--raised)), 0 0 9px 1px ${tint(color, 55)}` }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}

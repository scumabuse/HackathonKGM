import { LEVEL_META } from "@/lib/risk";
import type { Entity } from "@/lib/types";
import { cn } from "@/lib/utils";

const PERIOD = 8; // seconds per revolution — must match `animate-sweep` / `animate-blip` in tailwind.config.ts

/**
 * The landing's radar. Honest by construction: one blip per at-risk object of the latest scan, colored by
 * its level, placed by its score (riskier = closer to the centre) at a stable angle. The beam turns
 * clockwise and each blip flares exactly when the beam passes it. Neutral scope; risk color only on data.
 */
export function RadarSweep({ entities = [], className }: { entities?: Entity[]; className?: string }) {
  const blips = entities.map((e) => {
    const hash = [...e.object_id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const phi = hash % 360; // degrees clockwise from 12 o'clock
    const r = 6 + ((100 - e.score) / 100) * 40; // % of the scope, 6..46
    const rad = (phi * Math.PI) / 180;
    return {
      e,
      x: 50 + r * Math.sin(rad),
      y: 50 - r * Math.cos(rad),
      delay: (phi / 360) * PERIOD - PERIOD, // negative: already running; flare when the beam reaches phi
    };
  });

  return (
    <div className={cn("relative aspect-square w-full", className)} aria-hidden>
      {/* scope: hairline rings + crosshair */}
      <div className="absolute inset-0 rounded-full border border-line-strong" />
      {[0.2, 0.4, 0.6, 0.8].map((f) => (
        <div key={f} className="absolute rounded-full border border-line" style={{ inset: `${(f * 50).toFixed(1)}%` }} />
      ))}
      <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
      <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
      {/* beam: bright leading edge at the rotation angle, trail behind it */}
      <div className="absolute inset-0 overflow-hidden rounded-full">
        <div
          className="absolute inset-0 animate-sweep motion-reduce:hidden"
          style={{ background: "conic-gradient(from 0deg, transparent 0deg, transparent 290deg, rgb(var(--fg) / 0.10) 358deg, rgb(var(--fg) / 0.22) 360deg)" }}
        />
      </div>
      {blips.map(({ e, x, y, delay }) => (
        <span
          key={e.object_id}
          className={cn("absolute -ml-1 -mt-1 size-2 rounded-full opacity-90 animate-blip motion-reduce:animate-none", LEVEL_META[e.level].dot)}
          style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${delay.toFixed(2)}s`, boxShadow: "0 0 0 2px rgb(var(--base))" }}
        />
      ))}
      <div className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg-2" />
    </div>
  );
}

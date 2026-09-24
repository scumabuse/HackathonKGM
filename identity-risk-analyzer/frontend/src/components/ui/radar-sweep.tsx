import { motion } from "motion/react";
import { LEVEL_META } from "@/lib/risk";
import type { Entity } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The signature visual: a radar scope whose blips are the riskiest objects of the latest scan. */
export function RadarSweep({ entities = [], className }: { entities?: Entity[]; className?: string }) {
  const blips = entities.slice(0, 12).map((e, i) => {
    // riskier objects sit closer to the centre; the angle is stable per object id
    const hash = [...e.object_id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const angle = ((hash % 360) * Math.PI) / 180;
    const radius = 14 + (100 - e.score) * 0.34 + (i % 3) * 3;
    return { e, x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius, delay: (hash % 60) / 10 };
  });

  return (
    // overflow-hidden: the rotating sweep layer is a square; at 45° its diagonal would otherwise create page scroll
    <div className={cn("relative aspect-square w-full overflow-hidden rounded-full", className)} aria-hidden>
      <div className="absolute inset-0 rounded-full border border-primary/20 bg-[radial-gradient(circle,hsl(var(--primary)/0.08),transparent_70%)]" />
      {[0.25, 0.5, 0.75].map((r) => (
        <div key={r} className="absolute rounded-full border border-primary/15" style={{ inset: `${r * 50}%` }} />
      ))}
      <div className="absolute left-1/2 top-0 h-full w-px bg-primary/10" />
      <div className="absolute left-0 top-1/2 h-px w-full bg-primary/10" />
      <div
        className="absolute inset-0 animate-radar-sweep rounded-full"
        style={{ background: "conic-gradient(from 0deg, hsl(var(--primary) / 0.35), hsl(var(--primary) / 0.05) 55deg, transparent 90deg)" }}
      />
      {blips.map(({ e, x, y, delay }, i) => (
        <motion.span
          key={e.object_id}
          className="absolute -ml-1.5 -mt-1.5 size-3 rounded-full"
          style={{ left: `${x}%`, top: `${y}%`, background: LEVEL_META[e.level].color, boxShadow: `0 0 12px ${LEVEL_META[e.level].color}` }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 1, 0.75], scale: 1 }}
          transition={{ delay: 0.4 + i * 0.08, duration: 0.6 }}
        >
          <span className="absolute inset-0 animate-ping-slow rounded-full" style={{ background: LEVEL_META[e.level].color, animationDelay: `${delay}s` }} />
        </motion.span>
      ))}
      <div className="absolute left-1/2 top-1/2 -ml-1 -mt-1 size-2 rounded-full bg-primary shadow-[0_0_16px_hsl(var(--primary))]" />
    </div>
  );
}

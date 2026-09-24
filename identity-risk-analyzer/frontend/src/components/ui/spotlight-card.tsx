import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from "motion/react";
import * as React from "react";
import { cn } from "@/lib/utils";

/** 21st.dev-style spotlight card: a soft light follows the pointer; optional subtle 3D tilt. */
export function SpotlightCard({
  children,
  className,
  glow = "hsl(var(--primary))",
  tilt = false,
  onClick,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  glow?: string; // any CSS color, e.g. "rgb(var(--risk-critical))"
  tilt?: boolean;
  onClick?: () => void;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "onClick">) {
  const mx = useMotionValue(-300);
  const my = useMotionValue(-300);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rotX = useSpring(useTransform(py, [0, 1], tilt ? [4, -4] : [0, 0]), { stiffness: 200, damping: 20 });
  const rotY = useSpring(useTransform(px, [0, 1], tilt ? [-5, 5] : [0, 0]), { stiffness: 200, damping: 20 });
  const bg = useMotionTemplate`radial-gradient(420px circle at ${mx}px ${my}px, color-mix(in srgb, ${glow} 14%, transparent), transparent 70%)`;

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set(e.clientX - r.left);
    my.set(e.clientY - r.top);
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  }
  function onLeave() {
    mx.set(-300);
    my.set(-300);
    px.set(0.5);
    py.set(0.5);
  }

  return (
    <motion.div
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      onClick={onClick}
      style={{ rotateX: rotX, rotateY: rotY, transformPerspective: 900 }}
      className={cn("glass group relative overflow-hidden", onClick && "cursor-pointer", className)}
      {...(rest as object)}
    >
      <motion.div aria-hidden className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: bg }} />
      <div className="relative">{children}</div>
    </motion.div>
  );
}

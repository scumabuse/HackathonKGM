import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";
import { useI18n } from "@/lib/i18n";

/** Counts up once on mount (useMotionValue + useSpring); static under reduced motion. Mono by default. */
export function AnimatedCounter({ value, className = "font-mono", decimals = 0 }: { value: number; className?: string; decimals?: number }) {
  const reduce = useReducedMotion();
  const { num } = useI18n();
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 90, damping: 22, mass: 0.8 });
  const text = useTransform(spring, (v) => num(v, decimals));

  useEffect(() => {
    mv.set(value);
  }, [mv, value]);

  if (reduce) return <span className={className}>{num(value, decimals)}</span>;
  return <motion.span className={className}>{text}</motion.span>;
}

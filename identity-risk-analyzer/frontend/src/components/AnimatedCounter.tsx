import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";
import { useI18n } from "@/lib/i18n";

/** Numbers roll up from 0 on mount (useMotionValue + useSpring). Static when reduced motion is on. */
export function AnimatedCounter({ value, className, decimals = 0 }: { value: number; className?: string; decimals?: number }) {
  const reduce = useReducedMotion();
  const { num } = useI18n();
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 60, damping: 18, mass: 0.9 });
  const text = useTransform(spring, (v) => num(v, decimals));

  useEffect(() => {
    mv.set(value);
  }, [mv, value]);

  if (reduce) {
    return <span className={className}>{num(value, decimals)}</span>;
  }
  return <motion.span className={className}>{text}</motion.span>;
}

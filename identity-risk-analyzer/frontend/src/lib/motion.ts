// Motion tokens. Animation confirms and guides — short, ease-out, never looping on operational screens.
// MotionConfig reducedMotion="user" (App.tsx) turns transforms off for prefers-reduced-motion.

export const EASE = [0.2, 0.8, 0.2, 1] as const;
export const DUR = { fast: 0.15, base: 0.22, slow: 0.3 } as const;
export const STAGGER = 0.04;

/** Route transition: fade + 6px rise. */
export const pageMotion = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: DUR.base, ease: EASE },
};

/** Parent/child variants for list and grid entrances. */
export const listMotion = { hidden: {}, show: { transition: { staggerChildren: STAGGER } } };
export const itemMotion = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE } },
};

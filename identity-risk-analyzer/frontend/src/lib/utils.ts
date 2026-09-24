import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The numeric type scale (text-12 … text-56, tailwind.config.ts) is unknown to tailwind-merge, which would
// otherwise read it as a text COLOR and drop a real color like text-accent-fg sitting next to it.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: ["12", "13", "14", "16", "20", "28", "40", "56"] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function sourceKind(source: string | undefined): "mock" | "live" | "snapshot" {
  if (!source) return "mock";
  if (source.startsWith("ldap")) return "live";
  if (source.startsWith("snapshot")) return "snapshot";
  return "mock";
}

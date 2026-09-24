import {
  AlertOctagon,
  AlertTriangle,
  Building2,
  CircleDot,
  Clock3,
  Cog,
  Crown,
  FileLock2,
  Globe2,
  KeyRound,
  Monitor,
  Server,
  ShieldCheck,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Category, ObjectType, RiskLevel } from "./types";

// Object Risk Score: higher = WORSE. Colors come from CSS variables so they follow the theme
// (validated per theme on its own surface); they are always paired with a text label.
export const LEVELS: RiskLevel[] = ["Critical", "High", "Medium", "Low"];

export const LEVEL_META: Record<RiskLevel, { color: string; text: string; soft: string; ring: string; icon: LucideIcon; range: string }> = {
  Critical: { color: "rgb(var(--risk-critical))", text: "text-risk-fg-critical", soft: "bg-risk-critical/15", ring: "ring-risk-critical/40", icon: AlertOctagon, range: "≥ 80" },
  High: { color: "rgb(var(--risk-high))", text: "text-risk-fg-high", soft: "bg-risk-high/15", ring: "ring-risk-high/40", icon: AlertTriangle, range: "60–79" },
  Medium: { color: "rgb(var(--risk-medium))", text: "text-risk-fg-medium", soft: "bg-risk-medium/15", ring: "ring-risk-medium/40", icon: CircleDot, range: "30–59" },
  Low: { color: "rgb(var(--risk-low))", text: "text-risk-fg-low", soft: "bg-risk-low/15", ring: "ring-risk-low/40", icon: ShieldCheck, range: "< 30" },
};

export type Band = "Good" | "Fair" | "Poor" | "Critical";

// AD Security Score: higher = BETTER (domain health). Band colors reuse the risk scale, inverted.
export const BAND_COLOR: Record<Band, string> = {
  Good: LEVEL_META.Low.color,
  Fair: LEVEL_META.Medium.color,
  Poor: LEVEL_META.High.color,
  Critical: LEVEL_META.Critical.color,
};

export function bandFor(score: number): Band {
  if (score >= 80) return "Good";
  if (score >= 60) return "Fair";
  if (score >= 40) return "Poor";
  return "Critical";
}

/** Translucent version of any CSS color (works with the CSS-variable colors above). */
export const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

export const CATEGORY_ICON: Record<Category, LucideIcon> = {
  Stale: Clock3,
  Privileged: Crown,
  Passwords: KeyRound,
  Service: Cog,
  Config: FileLock2,
};
export const CATEGORIES = Object.keys(CATEGORY_ICON) as Category[];

export const OBJECT_ICON: Record<ObjectType, LucideIcon> = {
  user: User,
  serviceAccount: Server,
  computer: Monitor,
  group: Users,
  domain: Building2,
  policy: FileLock2,
  host: Globe2,
};
export const OBJECT_TYPES = Object.keys(OBJECT_ICON) as ObjectType[];

export const mitreUrl = (id: string) => `https://attack.mitre.org/techniques/${id.replace(".", "/")}/`;

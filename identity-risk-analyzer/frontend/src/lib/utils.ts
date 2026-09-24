import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function sourceKind(source: string | undefined): "mock" | "live" | "snapshot" {
  if (!source) return "mock";
  if (source.startsWith("ldap")) return "live";
  if (source.startsWith("snapshot")) return "snapshot";
  return "mock";
}

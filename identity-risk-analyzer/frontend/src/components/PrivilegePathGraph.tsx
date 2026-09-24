import { Crown, User, Users } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Fragment } from "react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const EDGE_KEYS = { member: "path.member", primaryGroupID: "path.primaryGroupID", in_chain: "path.in_chain" } as const;

/**
 * Animated escalation chain: principal -> nested groups -> critical group.
 * `auto`: horizontal on wide screens (xl+), vertical otherwise; `vertical`: always vertical (side sheet).
 * Edge labels explain HOW each hop grants membership.
 */
export function PrivilegePathGraph({ path, edges, compact }: { path: string[]; edges?: string[] | null; compact?: boolean }) {
  const reduce = useReducedMotion();
  const { t } = useI18n();
  const step = reduce ? 0 : 0.32;
  const last = path.length - 1;
  const h = !compact; // allow the horizontal layout on xl screens

  return (
    <ol
      className={cn("flex flex-col items-stretch", h && "xl:flex-row xl:items-center")}
      aria-label={t("path.label", { path: path.join(" → ") })}
    >
      {path.map((node, i) => {
        const isFirst = i === 0;
        const isLast = i === last;
        const hidden = edges?.[i - 1] === "primaryGroupID";
        const Icon = isFirst ? User : isLast ? Crown : Users;
        return (
          <Fragment key={`${node}-${i}`}>
            {i > 0 && (
              <li aria-hidden className={cn("relative flex min-h-11 items-center pl-6", h && "xl:min-h-0 xl:min-w-[88px] xl:flex-1 xl:justify-center xl:pl-0")}>
                {/* connector: vertical rail on the left, horizontal line on xl */}
                <motion.span
                  className={cn(
                    "absolute left-[19px] top-0 h-full w-0.5 origin-top",
                    h && "xl:left-0 xl:top-1/2 xl:h-0.5 xl:w-full xl:-translate-y-1/2 xl:origin-left",
                    hidden ? "bg-[repeating-linear-gradient(180deg,rgb(var(--risk-critical))_0_6px,transparent_6px_10px)]" : "bg-primary/50",
                    hidden && h && "xl:bg-[repeating-linear-gradient(90deg,rgb(var(--risk-critical))_0_6px,transparent_6px_10px)]",
                  )}
                  initial={{ scaleX: reduce ? 1 : 0, scaleY: reduce ? 1 : 0 }}
                  animate={{ scaleX: 1, scaleY: 1 }}
                  transition={{ delay: i * step, duration: reduce ? 0 : 0.35 }}
                />
                {!reduce && h && (
                  <motion.span
                    className="absolute top-1/2 hidden size-1.5 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))] xl:block"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 1, 1, 0], left: ["0%", "50%", "100%", "100%"] }}
                    transition={{ delay: last * step + 0.6 + i * 0.25, duration: 1.4, repeat: Infinity, repeatDelay: 2.2 }}
                  />
                )}
                <motion.span
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * step + 0.15 }}
                  className={cn(
                    "relative z-10 ml-4 rounded-md border bg-popover px-1.5 py-0.5 font-mono text-[10px]",
                    h && "xl:ml-0",
                    hidden ? "border-risk-critical/50 text-risk-fg-critical" : "border-fg/10 text-muted-foreground",
                  )}
                >
                  {t(EDGE_KEYS[(edges?.[i - 1] ?? "member") as keyof typeof EDGE_KEYS] ?? "path.member")}
                  {hidden && t("path.hidden")}
                </motion.span>
              </li>
            )}
            <motion.li
              initial={{ opacity: 0, scale: 0.8, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: i * step, type: "spring", stiffness: 260, damping: 20 }}
              className={cn(
                "relative flex min-w-0 shrink-0 items-center gap-2 rounded-xl border px-3 py-2",
                isLast
                  ? "border-risk-critical/50 bg-risk-critical/10 shadow-[0_0_28px_-6px_rgb(var(--risk-critical))]"
                  : isFirst
                    ? "border-primary/50 bg-primary/10 shadow-[0_0_24px_-8px_hsl(var(--primary))]"
                    : "border-fg/10 bg-fg/[0.04]",
              )}
            >
              <Icon className={cn("size-4 shrink-0", isLast ? "text-risk-fg-critical" : isFirst ? "text-primary" : "text-muted-foreground")} aria-hidden />
              <div className="min-w-0">
                <div className="truncate font-mono text-sm text-foreground xl:max-w-[200px]">{node}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t(isFirst ? "path.account" : isLast ? "path.criticalGroup" : "path.nestedGroup")}
                </div>
              </div>
            </motion.li>
          </Fragment>
        );
      })}
    </ol>
  );
}

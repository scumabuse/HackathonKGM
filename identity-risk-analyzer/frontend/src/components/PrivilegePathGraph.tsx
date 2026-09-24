import { Crown, User, Users } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Fragment } from "react";
import { useI18n } from "@/lib/i18n";
import { DUR, EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";

const EDGE_KEYS = { member: "path.member", primaryGroupID: "path.primaryGroupID", in_chain: "path.in_chain" } as const;

/**
 * Escalation chain: principal → nested groups → critical group, drawn hop by hop once.
 * Horizontal on wide screens (unless `compact`), vertical otherwise. A hop through primaryGroupID is the one
 * red, dashed edge — that membership is invisible in the group's member list.
 */
export function PrivilegePathGraph({ path, edges, compact }: { path: string[]; edges?: string[] | null; compact?: boolean }) {
  const reduce = useReducedMotion();
  const { t } = useI18n();
  const step = reduce ? 0 : 0.18;
  const last = path.length - 1;
  const h = !compact;

  return (
    <ol className={cn("flex flex-col items-stretch", h && "xl:flex-row xl:items-center")} aria-label={t("path.label", { path: path.join(" → ") })}>
      {path.map((node, i) => {
        const isFirst = i === 0;
        const isLast = i === last;
        const hidden = edges?.[i - 1] === "primaryGroupID";
        const Icon = isFirst ? User : isLast ? Crown : Users;
        const edgeKey = EDGE_KEYS[(edges?.[i - 1] ?? "member") as keyof typeof EDGE_KEYS] ?? "path.member";
        return (
          <Fragment key={`${node}-${i}`}>
            {i > 0 && (
              <li aria-hidden className={cn("relative flex min-h-10 items-center pl-7", h && "xl:min-h-0 xl:min-w-24 xl:flex-1 xl:justify-center xl:pl-0")}>
                <motion.span
                  className={cn(
                    "absolute left-[21px] top-0 h-full w-px origin-top",
                    h && "xl:left-0 xl:top-1/2 xl:h-px xl:w-full xl:origin-left",
                    hidden
                      ? "bg-[repeating-linear-gradient(180deg,rgb(var(--risk-critical))_0_5px,transparent_5px_9px)]"
                      : "bg-line-strong",
                    hidden && h && "xl:bg-[repeating-linear-gradient(90deg,rgb(var(--risk-critical))_0_5px,transparent_5px_9px)]",
                  )}
                  initial={{ scaleX: reduce ? 1 : 0, scaleY: reduce ? 1 : 0 }}
                  animate={{ scaleX: 1, scaleY: 1 }}
                  transition={{ delay: i * step, duration: reduce ? 0 : DUR.slow, ease: EASE }}
                />
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * step + DUR.fast, duration: DUR.base }}
                  className={cn(
                    "relative z-10 ml-3 inline-flex items-center gap-1.5 rounded-control bg-raised px-1.5 font-mono text-12",
                    h && "xl:ml-0",
                    hidden ? "text-fg" : "text-fg-3",
                  )}
                >
                  {hidden && <span className="size-1.5 rounded-full bg-risk-critical" />}
                  {t(edgeKey)}
                  {hidden && t("path.hidden")}
                </motion.span>
              </li>
            )}
            <motion.li
              initial={{ opacity: 0, y: reduce ? 0 : 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * step, duration: DUR.base, ease: EASE }}
              className="flex min-w-0 shrink-0 items-center gap-2.5 rounded-control bg-fg/[0.05] px-3 py-2"
            >
              <Icon className={cn("size-4 shrink-0", isLast ? "text-risk-critical" : "text-fg-3")} aria-hidden />
              <div className="min-w-0">
                <div className="truncate font-mono text-13 text-fg xl:max-w-[14rem]">{node}</div>
                <div className="text-12 text-fg-3">{t(isFirst ? "path.account" : isLast ? "path.criticalGroup" : "path.nestedGroup")}</div>
              </div>
            </motion.li>
          </Fragment>
        );
      })}
    </ol>
  );
}

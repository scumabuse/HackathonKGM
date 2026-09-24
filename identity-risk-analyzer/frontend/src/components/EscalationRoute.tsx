import { Crown, User, Users } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Fragment } from "react";
import { useI18n } from "@/lib/i18n";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";

const EDGE_KEYS = { member: "path.member", primaryGroupID: "path.primaryGroupID", in_chain: "path.in_chain" } as const;
const HIDDEN_DASH_V = "bg-[repeating-linear-gradient(180deg,rgb(var(--risk-critical))_0_4px,transparent_4px_8px)]";
const HIDDEN_DASH_H = "lg:bg-[repeating-linear-gradient(90deg,rgb(var(--risk-critical))_0_4px,transparent_4px_8px)]";

/**
 * An escalation path drawn as a route: principal → nested groups → privileged group, exactly as the analyzer
 * walked it (`path` + `path_edges`, nothing inferred). Nodes are labelled boxes, hops are directed lines;
 * a primaryGroupID hop is the one dashed, risk-colored line — invisible in the group's member list.
 * The wide layout runs left→right from `lg` up; `vertical` (and every phone) runs top→bottom.
 */
export function EscalationRoute({ path, edges, vertical }: { path: string[]; edges?: string[] | null; vertical?: boolean }) {
  const reduce = useReducedMotion();
  const { t } = useI18n();
  const last = path.length - 1;
  const step = reduce ? 0 : 0.16;
  const wide = !vertical; // horizontal from lg up

  return (
    <ol className={cn("flex flex-col", wide && "lg:flex-row lg:items-stretch")} aria-label={t("path.label", { path: path.join(" → ") })}>
      {path.map((node, i) => {
        const isFirst = i === 0;
        const isLast = i === last;
        const Icon = isFirst ? User : isLast ? Crown : Users;
        const kind = t(isFirst ? "path.account" : isLast ? "path.criticalGroup" : "path.nestedGroup");
        const edge = edges?.[i - 1] ?? "member";
        const hidden = edge === "primaryGroupID";
        const edgeLabel = `${t(EDGE_KEYS[edge as keyof typeof EDGE_KEYS] ?? "path.member")}${hidden ? t("path.hidden") : ""}`;
        return (
          <Fragment key={`${node}-${i}`}>
            {i > 0 && (
              <li
                aria-hidden
                className={cn("relative flex h-10 shrink-0 items-center pl-6", wide && "lg:h-auto lg:min-w-16 lg:max-w-40 lg:flex-1 lg:flex-col lg:justify-center lg:pl-0")}
              >
                {/* the line + arrowhead; revealed from the previous node towards the next */}
                <motion.span
                  className={cn("absolute left-[17px] top-0 h-full w-4", wide && "lg:left-0 lg:top-1/2 lg:h-4 lg:w-full lg:-translate-y-1/2")}
                  initial={{ clipPath: reduce ? "inset(0 0 0 0)" : "inset(0 100% 100% 0)" }}
                  animate={{ clipPath: "inset(0 0 0 0)" }}
                  transition={{ delay: i * step, duration: reduce ? 0 : 0.45, ease: EASE }}
                >
                  <span
                    className={cn(
                      "absolute left-1/2 top-0 h-[calc(100%-5px)] w-px -translate-x-1/2",
                      wide && "lg:left-0 lg:top-1/2 lg:h-px lg:w-[calc(100%-5px)] lg:-translate-y-1/2 lg:translate-x-0",
                      hidden ? cn(HIDDEN_DASH_V, wide && HIDDEN_DASH_H) : "bg-fg/30 transition-colors duration-base group-hover:bg-fg/55",
                    )}
                  />
                  <svg
                    viewBox="0 0 8 8"
                    className={cn(
                      "absolute bottom-0 left-1/2 size-2 -translate-x-1/2 rotate-90",
                      wide && "lg:bottom-auto lg:left-auto lg:right-0 lg:top-1/2 lg:-translate-y-1/2 lg:translate-x-0 lg:rotate-0",
                      hidden ? "fill-risk-critical" : "fill-fg/45 transition-colors duration-base group-hover:fill-fg/70",
                    )}
                  >
                    <path d="M0 0L8 4L0 8Z" />
                  </svg>
                </motion.span>
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * step + 0.2, duration: 0.25 }}
                  className={cn(
                    "relative ml-6 whitespace-nowrap font-mono text-12",
                    wide && "lg:ml-0 lg:-translate-y-4 lg:bg-raised lg:px-1.5",
                    hidden ? "text-risk-critical" : "text-fg-3",
                  )}
                >
                  {edgeLabel}
                </motion.span>
              </li>
            )}
            <motion.li
              initial={{ opacity: 0, y: reduce ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * step, duration: 0.3, ease: EASE }}
              className={cn(
                "relative min-w-0 rounded-control border bg-raised px-4 py-3 transition-[border-color,box-shadow] duration-base",
                wide && "lg:max-w-[16rem] lg:flex-1 lg:py-3.5",
                isLast
                  ? "border-risk-critical/40 [box-shadow:inset_0_2px_0_rgb(var(--risk-critical))] group-hover:border-risk-critical/60"
                  : "border-line-strong group-hover:border-fg/25",
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <Icon className={cn("size-4 shrink-0", isLast ? "text-risk-critical" : "text-fg-3")} aria-hidden />
                <div className="min-w-0">
                  <div className="tech truncate text-fg-3">{kind}</div>
                  <div className="mt-0.5 break-all font-mono text-14 text-fg">
                    {node}
                  </div>
                </div>
              </div>
            </motion.li>
          </Fragment>
        );
      })}
    </ol>
  );
}

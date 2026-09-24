import { Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Fragment } from "react";
import { useI18n } from "@/lib/i18n";
import { DUR, EASE } from "@/lib/motion";
import { SCAN_STEPS, useScan } from "@/lib/scan";
import { cn } from "@/lib/utils";

const STEP_META = {
  collecting: { label: "scan.collecting", detail: "scan.collectingDetail" },
  analyzing: { label: "scan.analyzing", detail: "scan.analyzingDetail" },
  scoring: { label: "scan.scoring", detail: "scan.scoringDetail" },
  persisting: { label: "scan.saving", detail: "scan.savingDetail" },
} as const;
const STEPS = Object.keys(STEP_META) as (keyof typeof STEP_META)[];

/** Calm stepped progress: Collect → Analyze → Score → Save, driven by the real job stages. */
export function ScanProgress() {
  const { running, step, source } = useScan();
  const { t } = useI18n();
  const idx = step ? SCAN_STEPS.indexOf(step) : -1;
  const current = STEPS[Math.min(Math.max(idx, 0), STEPS.length - 1)];
  const progress = Math.min(1, (idx + 1) / STEPS.length);

  return (
    <AnimatePresence>
      {running && (
        <motion.div
          className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DUR.base }}
          role="status"
          aria-live="polite"
        >
          <motion.div
            className="w-full max-w-md rounded-card bg-overlay p-6 shadow-overlay"
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 4, opacity: 0 }}
            transition={{ duration: DUR.slow, ease: EASE }}
          >
            <div className="eyebrow">{t("scan.eyebrow")}</div>
            <div className="mt-1 text-16 font-medium text-fg">{source === "ldap" ? t("scan.live") : t("scan.mockDomain")}</div>

            <ol className="mt-6 flex items-start">
              {STEPS.map((s, i) => {
                const state = i < idx ? "done" : i === idx ? "active" : "todo";
                return (
                  <Fragment key={s}>
                    {i > 0 && <li aria-hidden className={cn("mt-2.5 h-px flex-1 transition-colors duration-slow", i <= idx ? "bg-fg-2" : "bg-line-strong")} />}
                    <li className="flex w-24 flex-col items-center gap-2 text-center">
                      <span
                        className={cn(
                          "grid size-5 place-items-center rounded-full border transition-colors duration-slow",
                          state === "done" && "border-fg-2 bg-fg-2 text-raised",
                          state === "active" && "border-fg bg-transparent",
                          state === "todo" && "border-line-strong",
                        )}
                      >
                        {state === "done" && <Check className="size-3" strokeWidth={3} />}
                        {state === "active" && <span className="size-1.5 rounded-full bg-fg" />}
                      </span>
                      <span className={cn("text-12", state === "todo" ? "text-fg-3" : "text-fg")}>{t(STEP_META[s].label)}</span>
                    </li>
                  </Fragment>
                );
              })}
            </ol>

            <div className="relative mt-6 h-1 overflow-hidden rounded-full bg-fg/[0.08]">
              <motion.div
                className="relative h-full overflow-hidden rounded-full bg-fg-2"
                initial={{ width: 0 }}
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: DUR.slow, ease: EASE }}
              >
                <span className="absolute inset-y-0 w-1/3 animate-progress bg-gradient-to-r from-transparent via-white/40 to-transparent" />
              </motion.div>
            </div>
            <p className="mt-3 text-13 text-fg-2">{t(STEP_META[current].detail)}</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

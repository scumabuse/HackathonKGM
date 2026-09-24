import { Check, Database, Gauge, HardDriveDownload, Loader2, ScanSearch } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useI18n } from "@/lib/i18n";
import { SCAN_STEPS, useScan } from "@/lib/scan";
import { cn } from "@/lib/utils";
import { RadarSweep } from "./ui/radar-sweep";

const STEP_META = {
  collecting: { icon: Database, label: "scan.collecting", detail: "scan.collectingDetail" },
  analyzing: { icon: ScanSearch, label: "scan.analyzing", detail: "scan.analyzingDetail" },
  scoring: { icon: Gauge, label: "scan.scoring", detail: "scan.scoringDetail" },
  persisting: { icon: HardDriveDownload, label: "scan.saving", detail: "scan.savingDetail" },
} as const;

/** Stepped progress overlay: collecting -> analyzing -> scoring -> saving (driven by the real job stages). */
export function ScanProgress() {
  const { running, step, source } = useScan();
  const { t } = useI18n();
  const idx = step ? SCAN_STEPS.indexOf(step) : -1;

  return (
    <AnimatePresence>
      {running && (
        <motion.div
          className="fixed inset-0 z-[70] grid place-items-center bg-black/55 p-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="status"
          aria-live="polite"
        >
          <motion.div
            className="glass w-full max-w-md p-6"
            initial={{ scale: 0.94, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
          >
            <div className="flex items-center gap-4">
              <RadarSweep className="w-16 shrink-0" />
              <div>
                <div className="eyebrow">{t("scan.eyebrow")}</div>
                <div className="mt-1 text-lg font-semibold">
                  {source === "ldap" ? t("scan.live") : t("scan.mockDomain")}
                </div>
              </div>
            </div>
            <ol className="mt-6 space-y-2">
              {(Object.keys(STEP_META) as (keyof typeof STEP_META)[]).map((s, i) => {
                const state = i < idx ? "done" : i === idx ? "active" : "todo";
                const M = STEP_META[s];
                return (
                  <li
                    key={s}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                      state === "active" && "border-primary/40 bg-primary/[0.07]",
                      state === "done" && "border-fg/[0.06] bg-fg/[0.02]",
                      state === "todo" && "border-transparent opacity-50",
                    )}
                  >
                    <span className={cn("grid size-8 place-items-center rounded-lg", state === "done" ? "bg-risk-low/20 text-risk-fg-low" : "bg-fg/[0.05] text-primary")}>
                      {state === "done" ? <Check className="size-4" /> : state === "active" ? <Loader2 className="size-4 animate-spin" /> : <M.icon className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{t(M.label)}</div>
                      <div className="truncate text-xs text-muted-foreground">{t(M.detail)}</div>
                    </div>
                    {state === "active" && <div className="shimmer h-1.5 w-14 rounded-full" />}
                  </li>
                );
              })}
            </ol>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

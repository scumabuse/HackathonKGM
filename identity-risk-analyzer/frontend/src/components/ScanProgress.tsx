import { ArrowRight, Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { Button } from "@/components/ui/button";
import { RadarSweep } from "@/components/ui/radar-sweep";
import { useI18n } from "@/lib/i18n";
import { DUR, EASE } from "@/lib/motion";
import { BAND_COLOR, LEVELS, LEVEL_META } from "@/lib/risk";
import { SCAN_STEPS, useScan } from "@/lib/scan";
import { cn } from "@/lib/utils";

const STEP_META = {
  collecting: { label: "scan.collecting", detail: "scan.collectingDetail" },
  analyzing: { label: "scan.analyzing", detail: "scan.analyzingDetail" },
  scoring: { label: "scan.scoring", detail: "scan.scoringDetail" },
  persisting: { label: "scan.saving", detail: "scan.savingDetail" },
} as const;
const STEPS = Object.keys(STEP_META) as (keyof typeof STEP_META)[];

/**
 * The scan as a scene: the whole screen becomes the instrument. While the job runs, the empty scope sweeps and
 * the real job stages tick off; when it lands, the new scan's objects light up on the scope (one blip each,
 * in bearing order), the score counts up and the change since the previous scan is stated. Skippable.
 */
export function ScanProgress() {
  const { running, step, source, result, dismiss } = useScan();
  const { t, tp, level, num } = useI18n();
  const idx = step ? SCAN_STEPS.indexOf(step) : -1;
  const current = STEPS[Math.min(Math.max(idx, 0), STEPS.length - 1)];
  const progress = result ? 1 : Math.min(1, (idx + 1) / STEPS.length);
  const delta = result?.diff?.score_delta;
  const total = result ? LEVELS.reduce((s, l) => s + result.level_counts[l], 0) : 0;

  useEffect(() => {
    if (!result) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [result, dismiss]);

  return (
    <AnimatePresence>
      {running && (
        <motion.div
          className="instrument fixed inset-0 z-[70] overflow-y-auto bg-base"
          style={{ backgroundImage: "radial-gradient(60% 60% at 35% 50%, rgb(255 250 240 / 0.06), transparent 70%)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DUR.slow }}
          role="status"
          aria-live="polite"
        >
          <div className="mx-auto grid min-h-full max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-10 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:gap-16">
            <motion.div
              className="mx-auto w-full max-w-[min(72vh,560px)]"
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <RadarSweep entities={result?.top_risky ?? []} />
            </motion.div>

            <div className="min-w-0">
              <div className="kicker">
                {t("scan.eyebrow")} · {result ? result.scan.domain : source === "ldap" ? t("scan.live") : t("scan.mockDomain")}
              </div>

              <AnimatePresence mode="wait" initial={false}>
                {!result ? (
                  <motion.div key="running" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: DUR.base }}>
                    <h2 className="display mt-4 text-40 leading-[1.1]">{t(STEP_META[current].label)}…</h2>
                    <p className="mt-3 text-14 text-fg-2">{t(STEP_META[current].detail)}</p>
                    <ol className="mt-8 space-y-3">
                      {STEPS.map((s, i) => {
                        const state = i < idx ? "done" : i === idx ? "active" : "todo";
                        return (
                          <li key={s} className="flex items-center gap-3">
                            <span
                              className={cn(
                                "grid size-5 shrink-0 place-items-center rounded-full border transition-colors duration-slow",
                                state === "done" && "border-fg-2 bg-fg-2 text-raised",
                                state === "active" && "border-fg",
                                state === "todo" && "border-line-strong",
                              )}
                            >
                              {state === "done" && <Check className="size-3" strokeWidth={3} />}
                              {state === "active" && <span className="size-1.5 animate-pulse rounded-full bg-fg" />}
                            </span>
                            <span className={cn("font-mono text-13 uppercase tracking-[0.06em]", state === "todo" ? "text-fg-3" : "text-fg")}>
                              {t(STEP_META[s].label)}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  </motion.div>
                ) : (
                  <motion.div key="result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DUR.slow, ease: EASE }}>
                    <h2 className="display mt-4 text-28">{t("scan.complete")}</h2>
                    <div className="mt-4 flex items-baseline gap-2">
                      <AnimatedCounter
                        value={result.ad_security_score}
                        className="font-mono text-[88px] font-medium leading-none tracking-[-0.04em]"
                      />
                      <span className="font-mono text-16 text-fg-3">/100</span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-14">
                      <span className="inline-flex items-center gap-2 text-fg">
                        <span className="size-2 rounded-full" style={{ background: BAND_COLOR[result.score_band] }} aria-hidden />
                        {t(`bands.${result.score_band}`)}
                      </span>
                      {delta != null && (
                        <span className={cn("font-mono text-13", delta > 0 ? "text-risk-low" : delta < 0 ? "text-risk-critical" : "text-fg-3")}>
                          {delta === 0 ? t("dashboard.noChange") : t("dashboard.vsPrevious", { delta: `${delta > 0 ? "+" : "−"}${num(Math.abs(delta))}` })}
                        </span>
                      )}
                    </div>
                    <p className="mt-6 text-14 text-fg-2">
                      <span className="font-mono text-fg">{total}</span> {tp("charts.objectsAtRisk", total)}
                    </p>
                    <ul className="mt-3 grid grid-cols-2 gap-2">
                      {LEVELS.map((l, i) => (
                        <motion.li
                          key={l}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3 + i * 0.08, duration: DUR.base }}
                          className="flex items-center gap-2 rounded-control bg-fg/[0.05] px-3 py-2 text-13"
                        >
                          <span className={cn("size-2 rounded-full", LEVEL_META[l].dot)} aria-hidden />
                          <span className="flex-1 text-fg-2">{level(l)}</span>
                          <span className="font-mono text-fg">{result.level_counts[l]}</span>
                        </motion.li>
                      ))}
                    </ul>
                    <div className="mt-8 flex flex-wrap items-center gap-4">
                      <Button variant="primary" size="lg" onClick={dismiss}>
                        {t("scan.openDashboard")} <ArrowRight />
                      </Button>
                      <span className="font-mono text-12 text-fg-3">{t("scan.skip")}</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="relative mt-10 h-px overflow-hidden bg-fg/[0.12]">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-fg"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress * 100}%` }}
                  transition={{ duration: DUR.slow, ease: EASE }}
                />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

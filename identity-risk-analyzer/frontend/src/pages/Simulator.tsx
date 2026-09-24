import { Check, FlaskConical, RotateCcw, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { ErrorState, NoScanYet, isNotFound } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import { useScanModel } from "@/lib/model";
import { itemMotion, listMotion } from "@/lib/motion";
import { BAND_COLOR, CATEGORIES, CATEGORY_ICON, LEVELS, LEVEL_META } from "@/lib/risk";
import { ruleImpacts, simulate, type Outcome } from "@/lib/simulate";
import { cn } from "@/lib/utils";

const PENALTY_CAP = 20;

function Delta({ value, better }: { value: number; better: "up" | "down" }) {
  if (value === 0) return <span className="font-mono text-13 text-fg-3">±0</span>;
  const good = better === "up" ? value > 0 : value < 0;
  return (
    <span className={cn("font-mono text-13", good ? "text-risk-low" : "text-risk-critical")}>
      {value > 0 ? "+" : "−"}
      {Math.abs(value)}
    </span>
  );
}

/** Right column: the scan as it is vs. the modelled scan after the ticked fixes. */
function Outcomes({ now, after, selected }: { now: Outcome; after: Outcome; selected: number }) {
  const { t, tp, level, category } = useI18n();
  const maxLevel = Math.max(1, ...LEVELS.map((l) => now.levels[l]));
  return (
    <div className="panel space-y-6 p-6">
      <div>
        <div className="kicker">{t("sim.model")}</div>
        {selected > 0 && <div className="mt-1.5 text-12 text-fg-3">{tp("sim.selected", selected)}</div>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {(
          [
            [t("sim.now"), now],
            [t("sim.after"), after],
          ] as const
        ).map(([label, o], i) => (
          <div key={label} className={cn("rounded-control p-4", i === 1 ? "bg-fg/[0.04]" : "border border-line")}>
            <div className="text-12 text-fg-3">{label}</div>
            <div className="mt-2 flex items-baseline gap-1">
              {i === 1 ? <AnimatedCounter value={o.score} className="font-mono text-40 text-fg" /> : <span className="font-mono text-40 text-fg">{o.score}</span>}
              <span className="font-mono text-13 text-fg-3">/100</span>
            </div>
            <div className="mt-1 inline-flex items-center gap-1.5 text-13 text-fg-2">
              <span className="size-2 rounded-full" style={{ background: BAND_COLOR[o.band] }} aria-hidden />
              {t(`bands.${o.band}`)}
            </div>
          </div>
        ))}
      </div>

      <dl className="space-y-2 text-13">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-fg-2">{t("sim.score")}</dt>
          <dd className="flex items-baseline gap-2">
            <span className="font-mono text-fg">
              {now.score} → {after.score}
            </span>
            <Delta value={after.score - now.score} better="up" />
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-fg-2">{t("sim.objects")}</dt>
          <dd className="flex items-baseline gap-2">
            <span className="font-mono text-fg">
              {now.objects} → {after.objects}
            </span>
            <Delta value={after.objects - now.objects} better="down" />
          </dd>
        </div>
      </dl>

      <section>
        <h3 className="eyebrow mb-3">{t("sim.levels")}</h3>
        <ul className="space-y-2.5">
          {LEVELS.map((l) => (
            <li key={l} className="grid grid-cols-[8rem_1fr_4.5rem] items-center gap-3 text-13">
              <span className="inline-flex items-center gap-2 text-fg-2">
                <span className={cn("size-2 rounded-full", LEVEL_META[l].dot)} aria-hidden />
                {level(l)}
              </span>
              <span className="relative h-2 overflow-hidden rounded-full bg-fg/[0.06]">
                <span className="absolute inset-y-0 left-0 rounded-full bg-fg/[0.12]" style={{ width: `${(now.levels[l] / maxLevel) * 100}%` }} />
                <motion.span
                  className={cn("absolute inset-y-0 left-0 rounded-full", LEVEL_META[l].dot)}
                  initial={false}
                  animate={{ width: `${(after.levels[l] / maxLevel) * 100}%` }}
                  transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
                />
              </span>
              <span className="text-right font-mono text-fg">
                {now.levels[l]}
                {after.levels[l] !== now.levels[l] && <span className="text-fg-3"> → {after.levels[l]}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="eyebrow mb-3">{t("sim.penalties")}</h3>
        <ul className="space-y-2.5">
          {CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICON[c];
            return (
              <li key={c} className="grid grid-cols-[8rem_1fr_4.5rem] items-center gap-3 text-13">
                <span className="inline-flex items-center gap-2 truncate text-fg-2">
                  <Icon className="size-3.5 shrink-0" aria-hidden />
                  {category(c)}
                </span>
                <span className="relative h-2 overflow-hidden rounded-full bg-fg/[0.06]">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-fg/[0.12]" style={{ width: `${(now.penalties[c] / PENALTY_CAP) * 100}%` }} />
                  <motion.span
                    className="absolute inset-y-0 left-0 rounded-full bg-fg-2"
                    initial={false}
                    animate={{ width: `${(after.penalties[c] / PENALTY_CAP) * 100}%` }}
                    transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
                  />
                </span>
                <span className="text-right font-mono text-fg">−{after.penalties[c].toFixed(1)}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {selected > 0 && after.objects < now.objects && <p className="text-13 text-fg-2">{tp("sim.cleared", now.objects - after.objects)}</p>}
      {selected === 0 && <p className="text-13 text-fg-3">{t("sim.nothing")}</p>}
    </div>
  );
}

/** "What if we fix it?" — tick rules, see the domain re-scored with the scan's own formulas. */
export default function Simulator() {
  const { t, tp, category } = useI18n();
  const { findings, params, ruleName, isLoading, error } = useScanModel();
  const [params0] = useSearchParams();
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set((params0.get("fix") ?? "").split(",").filter(Boolean)));

  const impacts = useMemo(() => (findings && params ? ruleImpacts(findings, params) : []), [findings, params]);
  const now = useMemo(() => (findings && params ? simulate(findings, params) : null), [findings, params]);
  const valid = useMemo(() => new Set([...picked].filter((id) => impacts.some((r) => r.rule_id === id))), [picked, impacts]);
  const after = useMemo(() => (findings && params ? simulate(findings, params, valid) : null), [findings, params, valid]);

  if (isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]" aria-busy>
        <Skeleton className="h-[600px] rounded-card" />
        <Skeleton className="h-[600px] rounded-card" />
      </div>
    );
  }
  if (error && isNotFound(error)) return <NoScanYet what="findings" />;
  if (error || !now || !after) return <ErrorState error={error} />;

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const top3 = impacts.filter((r) => r.gain > 0).slice(0, 3).map((r) => r.rule_id);

  return (
    <motion.div variants={listMotion} initial="hidden" animate="show" className="space-y-8 pb-8">
      <motion.header variants={itemMotion} className="max-w-3xl">
        <div className="kicker">{t("nav.simulator")}</div>
        <h1 className="display mt-4 text-40 leading-[1.1]">{t("sim.title")}</h1>
        <p className="mt-4 text-14 text-fg-2">{t("sim.sub")}</p>
      </motion.header>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <motion.section variants={itemMotion} className="panel min-w-0 p-0">
          <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-6">
            <div>
              <h2 className="display text-20">{t("sim.rulesTitle")}</h2>
              <p className="mt-1 text-13 text-fg-3">{t("sim.rulesSub")}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setPicked(new Set(top3))}>
                <Sparkles /> {t("sim.pickTop")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())} disabled={valid.size === 0}>
                <RotateCcw /> {t("sim.reset")}
              </Button>
            </div>
          </div>
          <ul className="mt-4 border-t border-line">
            {impacts.map((r) => {
              const on = valid.has(r.rule_id);
              const Icon = CATEGORY_ICON[r.category];
              return (
                <li key={r.rule_id} className="border-b border-line last:border-0">
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors sm:gap-4 sm:px-6 duration-fast hover:bg-fg/[0.03]",
                      on && "bg-fg/[0.04]",
                    )}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggle(r.rule_id)} className="peer sr-only" />
                    <span
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-inner border transition-colors duration-fast peer-focus-visible:ring-2 peer-focus-visible:ring-accent",
                        on ? "border-accent bg-accent text-accent-fg" : "border-line-strong",
                      )}
                      aria-hidden
                    >
                      {on && <Check className="size-3.5" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-14 text-fg">{ruleName(r.rule_id)}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 truncate text-12 text-fg-3">
                        <Icon className="size-3.5 shrink-0" aria-hidden />
                        {category(r.category)} · <span className="font-mono">{r.rule_id}</span> · {tp("sim.objectsN", r.objects)}
                      </span>
                    </span>
                    <span className={cn("shrink-0 font-mono text-13", r.gain > 0 ? "text-fg" : "text-fg-3")}>{t("sim.alone", { n: r.gain })}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </motion.section>

        <motion.aside variants={itemMotion} className="min-w-0 lg:sticky lg:top-20">
          <Outcomes now={now} after={after} selected={valid.size} />
          <p className="mt-3 flex items-start gap-2 px-1 text-12 text-fg-3">
            <FlaskConical className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="font-mono">
              score = 100 − Σ 20·(1 − e<sup>−S/τ</sup>), τ = {params?.score_tau}
            </span>
          </p>
        </motion.aside>
      </div>
    </motion.div>
  );
}

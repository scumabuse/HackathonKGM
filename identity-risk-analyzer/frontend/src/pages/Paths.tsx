import { ArrowRight, Play, RotateCcw, Route } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { EscalationRoute } from "@/components/EscalationRoute";
import { RiskChip } from "@/components/RiskBadge";
import { ErrorState, NoScanYet, StateBlock, isNotFound } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import { pathFindings, useScanModel } from "@/lib/model";
import { itemMotion, listMotion } from "@/lib/motion";
import { OBJECT_ICON } from "@/lib/risk";
import type { Finding } from "@/lib/types";
import { cn } from "@/lib/utils";

const targetOf = (f: Finding) => f.privilege_path![f.privilege_path!.length - 1];

const HOP_MS = 1100;
const STORY_KEYS = { member: "paths.story.member", primaryGroupID: "paths.story.primaryGroupID", in_chain: "paths.story.in_chain" } as const;

/** Fill a dictionary template with React nodes ({from}, {to}, …). */
function fill(tpl: string, parts: Record<string, ReactNode>) {
  return tpl.split(/(\{\w+\})/).map((chunk, i) => {
    const key = /^\{(\w+)\}$/.exec(chunk)?.[1];
    return key && key in parts ? <Fragment key={i}>{parts[key]}</Fragment> : chunk;
  });
}

/**
 * Attack replay: walks the path node by node (`step`), then states the outcome. Pure presentation of the
 * path the analyzer found — each sentence is one real hop (member / primaryGroupID) of that path.
 */
function useReplay(hops: number) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState<number | null>(null);
  const [run, setRun] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const play = () => {
    clearTimeout(timer.current);
    setRun((r) => r + 1);
    if (reduce) return setStep(hops + 1);
    setStep(0);
    const tick = (s: number) => {
      timer.current = setTimeout(() => {
        setStep(s);
        if (s <= hops) tick(s + 1);
      }, HOP_MS);
    };
    tick(1);
  };
  return { step, run, play, done: step != null && step > hops };
}

function AttackStory({ path, edges, step }: { path: string[]; edges?: string[] | null; step: number }) {
  const { t } = useI18n();
  const hops = path.length - 1;
  const node = (s: string, critical?: boolean) => <span className={cn("font-medium", critical ? "text-risk-critical" : "text-fg")}>{s}</span>;
  return (
    <ol className="mt-5 space-y-1.5 rounded-control bg-fg/[0.03] px-4 py-3 font-mono text-13" aria-live="polite">
      {Array.from({ length: Math.min(step, hops) }, (_, i) => {
        const edge = (edges?.[i] ?? "member") as keyof typeof STORY_KEYS;
        const hidden = edge === "primaryGroupID";
        return (
          <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }} className="flex gap-3 text-fg-2">
            <span className="shrink-0 text-fg-3">{i + 1}.</span>
            <span className={hidden ? "text-risk-critical" : undefined}>
              {fill(t(STORY_KEYS[edge] ?? STORY_KEYS.member), { from: node(path[i]), to: node(path[i + 1], i + 1 === hops) })}
            </span>
          </motion.li>
        );
      })}
      {step > hops && (
        <motion.li initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="flex gap-3 border-t border-line pt-2 text-fg">
          <span className="shrink-0 text-risk-critical">→</span>
          <span>{fill(t("paths.story.result"), { start: node(path[0]), to: node(path[hops], true) })}</span>
        </motion.li>
      )}
    </ol>
  );
}

/** One escalation path as a report card: number, verdict, the route, the fix. `featured` = the riskiest one. */
function PathCard({ f, n, featured }: { f: Finding; n: number; featured?: boolean }) {
  const { t, tp, objectType } = useI18n();
  const Icon = OBJECT_ICON[f.object_type];
  const path = f.privilege_path!;
  const replay = useReplay(path.length - 1);

  // presentation tour: "replay the featured attack"
  useEffect(() => {
    if (!featured) return;
    const onTour = () => replay.play();
    window.addEventListener("tour:replay", onTour);
    return () => window.removeEventListener("tour:replay", onTour);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featured]);
  return (
    <article
      className={cn(
        "panel group flex h-full flex-col transition-[box-shadow] duration-base ease-out hover:shadow-overlay",
        featured ? "p-6 sm:p-8" : "p-6",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="tech flex flex-wrap items-center gap-x-2">
            <span className="text-brand">{String(n).padStart(2, "0")}</span>
            <span aria-hidden>/</span>
            <span>{featured ? t("paths.featured") : t("paths.pathNo", { n })}</span>
          </div>
          <h2 className={cn("display mt-2", featured ? "text-28" : "text-20")}>{f.title}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-12 text-fg-3">
            <Icon className="size-3.5" aria-hidden />
            {objectType(f.object_type)} · {tp("paths.hops", path.length - 1)} · {t("paths.target")}{" "}
            <span className="font-mono text-fg-2">{targetOf(f)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <RiskChip level={f.level} />
          <span className={cn("font-mono font-medium leading-none text-fg", featured ? "text-40" : "text-28")}>{f.score}</span>
        </div>
      </header>

      <div className={featured ? "my-8" : "my-6"}>
        <EscalationRoute path={path} edges={f.path_edges} vertical={!featured} active={replay.step == null ? null : Math.min(replay.step, path.length - 1)} run={replay.run} />
        {replay.step != null && <AttackStory path={path} edges={f.path_edges} step={replay.step} />}
      </div>

      <footer className="mt-auto flex flex-wrap items-end justify-between gap-4 border-t border-line pt-4">
        <div className="min-w-0 max-w-[70ch]">
          <div className="tech">{t("paths.recommendation")}</div>
          <p className="mt-1 text-13 text-fg-2 transition-colors duration-base group-hover:text-fg">{f.recommendation}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={featured ? "secondary" : "ghost"} size="sm" onClick={replay.play} disabled={replay.step != null && !replay.done}>
            {replay.done ? <RotateCcw /> : <Play />}
            {t(replay.done ? "paths.replayAgain" : "paths.replay")}
          </Button>
          <Button asChild variant={featured ? "primary" : "secondary"} size="sm">
            <Link to={`/accounts/${f.object_id}`}>
              {t("paths.openObject")} <ArrowRight />
            </Link>
          </Button>
        </div>
      </footer>
    </article>
  );
}

/**
 * Escalation paths: every finding that carries a real privilege path (group membership walked by the
 * analyzer, incl. the primaryGroupID hop that LDAP_IN_CHAIN cannot see). Nothing here is inferred by the UI.
 * Order is the findings order (riskiest first); the first card is only drawn larger.
 */
export default function Paths() {
  const { t, tp } = useI18n();
  const { findings, isLoading, error } = useScanModel();
  const [target, setTarget] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-32 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-72 rounded-card" />
      </div>
    );
  }
  if (error && isNotFound(error)) return <NoScanYet what="findings" />;
  if (error || !findings) return <ErrorState error={error} />;

  const all = pathFindings(findings);
  const targets = [...new Set(all.map(targetOf))].sort();
  const shown = target ? all.filter((f) => targetOf(f) === target) : all;
  const [first, ...rest] = shown;
  const stats = [
    { label: t("paths.statAccounts"), value: new Set(all.map((f) => f.object_id)).size },
    { label: t("paths.statTargets"), value: targets.length },
    { label: t("paths.statHidden"), value: all.filter((f) => f.path_edges?.includes("primaryGroupID")).length, alert: true },
    { label: t("paths.statLongest"), value: Math.max(0, ...all.map((f) => f.privilege_path!.length - 1)) },
  ];

  return (
    <motion.div variants={listMotion} initial="hidden" animate="show" className="space-y-8 pb-8">
      <motion.header variants={itemMotion} className="max-w-3xl">
        <div className="kicker">
          Identity Radar · {t("nav.groupAnalysis")} · {tp("paths.total", all.length)}
        </div>
        <h1 className="display mt-4 text-40 leading-[1.05] sm:text-56">{t("paths.title")}</h1>
        <p className="mt-5 max-w-[62ch] text-16 text-fg-2">{t("paths.sub")}</p>
      </motion.header>

      {all.length === 0 ? (
        <StateBlock icon={Route} title={t("paths.empty")} />
      ) : (
        <>
          {/* one instrument strip instead of four identical cards */}
          <motion.dl variants={itemMotion} className="panel grid grid-cols-2 md:grid-cols-4">
            {stats.map((s, i) => (
              <div
                key={s.label}
                className={cn(
                  "px-6 py-5",
                  i % 2 === 1 && "border-l border-line",
                  i >= 2 && "border-t border-line md:border-t-0",
                  i === 2 && "md:border-l",
                )}
              >
                <dd className={cn("font-mono text-40 font-medium leading-none", s.alert && s.value > 0 ? "text-risk-critical" : "text-fg")}>
                  {String(s.value).padStart(2, "0")}
                </dd>
                <dt className="mt-2 text-13 text-fg-3">{s.label}</dt>
              </div>
            ))}
          </motion.dl>

          <motion.div variants={itemMotion}>
            <div className="tech mb-2.5">{t("paths.groups")}</div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("paths.groups")}>
              {[null, ...targets].map((g) => {
                const on = target === g;
                const count = g ? all.filter((f) => targetOf(f) === g).length : all.length;
                return (
                  <button
                    key={g ?? "all"}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTarget(g)}
                    className={cn(
                      "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-13 transition-[background-color,border-color,color,box-shadow] duration-fast",
                      on ? "border-fg bg-fg text-raised" : "border-line-strong bg-raised text-fg-2 hover:border-fg/40 hover:text-fg",
                    )}
                  >
                    <span className={g ? "font-mono text-12" : ""}>{g ?? t("paths.all")}</span>
                    <span className={cn("font-mono text-12", on ? "text-raised/70" : "text-fg-3")}>{count}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>

          {first && (
            <motion.div key={`featured-${target ?? "all"}`} variants={itemMotion} data-tour="featured">
              <PathCard f={first} n={1} featured />
            </motion.div>
          )}

          {rest.length > 0 && (
            <section>
              <h2 className="kicker mb-4">{t("paths.others")}</h2>
              <motion.ol key={`rest-${target ?? "all"}`} variants={listMotion} initial="hidden" animate="show" className="grid gap-4 xl:grid-cols-2">
                {rest.map((f, i) => (
                  <motion.li key={f.id} variants={itemMotion} className="min-w-0">
                    <PathCard f={f} n={i + 2} />
                  </motion.li>
                ))}
              </motion.ol>
            </section>
          )}

          <p className="flex items-center gap-2 text-12 text-fg-3">
            <span className="h-px w-6 shrink-0 bg-[repeating-linear-gradient(90deg,rgb(var(--risk-critical))_0_4px,transparent_4px_8px)]" aria-hidden />
            {t("account.pathHidden")}
          </p>
        </>
      )}
    </motion.div>
  );
}

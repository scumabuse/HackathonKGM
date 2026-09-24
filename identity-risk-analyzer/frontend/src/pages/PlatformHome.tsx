import { useQuery } from "@tanstack/react-query";
import { Archive, ArrowRight, Globe2, Play, ScrollText, ShieldCheck, Wrench } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MonoDigits } from "@/components/MonoDigits";
import { PrivilegePathGraph } from "@/components/PrivilegePathGraph";
import { RiskChip } from "@/components/RiskBadge";
import { Button } from "@/components/ui/button";
import { RadarSweep } from "@/components/ui/radar-sweep";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { pathFindings, useScanModel } from "@/lib/model";
import { DUR, EASE, itemMotion, listMotion } from "@/lib/motion";
import { BAND_COLOR, CATEGORIES, CATEGORY_ICON, LEVELS, LEVEL_META, OBJECT_ICON, tint } from "@/lib/risk";
import { useScan } from "@/lib/scan";
import { ruleImpacts } from "@/lib/simulate";
import type { Dashboard, Entity, RiskLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

const MODULES = [
  { name: "modules.identity", icon: ShieldCheck, blurb: "home.identityText", live: true },
  { name: "modules.certificate", icon: ScrollText, blurb: "modules.certificateBlurb", live: false },
  { name: "modules.dns", icon: Globe2, blurb: "modules.dnsBlurb", live: false },
  { name: "modules.patch", icon: Wrench, blurb: "modules.patchBlurb", live: false },
  { name: "modules.backup", icon: Archive, blurb: "modules.backupBlurb", live: false },
] as const;

const STEPS = [
  { title: "home.steps.collect", text: "home.steps.collectText" },
  { title: "home.steps.analyze", text: "home.steps.analyzeText" },
  { title: "home.steps.score", text: "home.steps.scoreText" },
  { title: "home.steps.explain", text: "home.steps.explainText" },
  { title: "home.steps.fix", text: "home.steps.fixText" },
] as const;

/** Fill a dictionary template ("{name} is {hops} away…") with React nodes instead of strings. */
function fillTemplate(tpl: string, parts: Record<string, ReactNode>) {
  return tpl.split(/(\{\w+\})/).map((chunk, i) => {
    const key = /^\{(\w+)\}$/.exec(chunk)?.[1];
    return key && key in parts ? <Fragment key={i}>{parts[key]}</Fragment> : chunk;
  });
}

const HEAD_LINK = "underline decoration-fg/20 decoration-1 underline-offset-[0.14em] transition-colors duration-fast hover:decoration-fg/70";

/**
 * The hero headline, written by the latest scan: the domain's score, then its single most telling fact —
 * the riskiest real escalation path (or, failing that, the critical count). Every name and number links
 * to where it comes from. Falls back to the product slogan before the first scan.
 */
function LiveHeadline({ d }: { d: Dashboard }) {
  const { t, tp, objectType } = useI18n();
  const { findings } = useScanModel();
  const path = pathFindings(findings)[0];
  const hidden = path?.path_edges?.includes("primaryGroupID");
  const target = path?.privilege_path?.[path.privilege_path.length - 1];

  const score = (
    <Link to="/dashboard" className={cn(HEAD_LINK, "italic")} style={{ color: BAND_COLOR[d.score_band] }}>
      {d.ad_security_score}
    </Link>
  );
  let second: ReactNode;
  if (path && target) {
    second = fillTemplate(t(hidden ? "live.hidden" : "live.path"), {
      type: objectType(path.object_type),
      name: (
        <Link to={`/accounts/${path.object_id}`} className={cn(HEAD_LINK, "italic")}>
          {path.object_name}
        </Link>
      ),
      hops: tp("live.hops", path.privilege_path!.length - 1),
      target: (
        <Link to="/paths" className={cn(HEAD_LINK, "text-risk-critical")}>
          {target}
        </Link>
      ),
    });
  } else if (findings) {
    second = d.level_counts.Critical > 0 ? tp("live.critical", d.level_counts.Critical) : t("live.clean");
  }

  return (
    <>
      <span className="block">{fillTemplate(t("live.score"), { domain: d.scan.domain, score })}</span>
      {second && (
        <motion.span className="mt-2 block text-fg-2" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DUR.slow, ease: EASE }}>
          {second}
        </motion.span>
      )}
    </>
  );
}

/** The object picked on the radar — what it is, why it is risky, where to go next. */
function SelectedObject({ e, onClear }: { e: Entity; onClear: () => void }) {
  const { t, tp, objectType } = useI18n();
  const Icon = OBJECT_ICON[e.object_type];
  return (
    <motion.div
      key={e.object_id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: DUR.base, ease: EASE }}
      className="space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-12 text-fg-3">
            <Icon className="size-3.5" aria-hidden />
            {objectType(e.object_type)}
            {e.tier0 && " · Tier-0"}
          </div>
          <div className="mt-1 truncate font-mono text-16 text-fg">{e.object_name}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-28 leading-none text-fg">{e.score}</div>
          <RiskChip level={e.level} className="mt-1.5" />
        </div>
      </div>
      <p className="text-13 text-fg-2">
        {e.top_title}
        {e.finding_count > 1 && <span className="text-fg-3"> · {tp("radar.findingsN", e.finding_count)}</span>}
      </p>
      {e.privilege_path && (
        <p className="truncate font-mono text-12 text-fg-3" title={e.privilege_path.join(" → ")}>
          {e.privilege_path.join(" → ")}
        </p>
      )}
      <div className="flex items-center gap-2 pt-1">
        <Button asChild variant="primary" size="sm">
          <Link to={`/accounts/${e.object_id}`}>
            {t("radar.open")} <ArrowRight />
          </Link>
        </Button>
        <Button variant="tertiary" size="sm" onClick={onClear}>
          {t("radar.clear")}
        </Button>
      </div>
    </motion.div>
  );
}

/** Radar card: level filters, the interactive scope and either the picked object or the legend. */
function RadarCard({ d }: { d: Dashboard | undefined }) {
  const { t, tp, level } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shown, setShown] = useState<ReadonlySet<RiskLevel>>(() => new Set(LEVELS));
  const entities = d?.top_risky ?? [];
  const selected = entities.find((e) => e.object_id === selectedId && shown.has(e.level));

  const toggle = (l: RiskLevel) =>
    setShown((prev) => {
      const next = new Set(prev);
      if (next.has(l) && next.size > 1) next.delete(l);
      else next.add(l);
      return next;
    });

  const total = LEVELS.reduce((s, l) => s + (d?.level_counts[l] ?? 0), 0);
  return (
    <div
      className="instrument panel relative mx-auto w-full max-w-[520px] overflow-hidden p-6 sm:p-7"
      style={{ backgroundImage: "radial-gradient(120% 70% at 50% 38%, rgb(255 250 240 / 0.055), transparent 62%)" }}
    >
      {d && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="kicker truncate">{d.scan.domain}</span>
          <span className="tech shrink-0">
            {total} {tp("charts.objectsAtRisk", total)}
          </span>
        </div>
      )}
      {d && (
        <div className="mb-5 flex flex-wrap gap-1.5" role="group" aria-label={t("radar.filter")}>
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={shown.has(l)}
              onClick={() => toggle(l)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-12 transition-colors duration-fast",
                shown.has(l) ? "border-line-strong bg-raised text-fg" : "border-transparent bg-fg/[0.04] text-fg-3 hover:text-fg",
              )}
            >
              <span className={cn("size-2 rounded-full", LEVEL_META[l].dot, !shown.has(l) && "opacity-40")} aria-hidden />
              {level(l)}
              <span className="font-mono">{d.level_counts[l]}</span>
            </button>
          ))}
        </div>
      )}
      <RadarSweep entities={entities} selectedId={selected?.object_id ?? null} onSelect={setSelectedId} visible={shown} className="mx-auto max-w-[380px]" />
      <div className="mt-6 min-h-[132px] border-t border-line pt-5">
        {!d ? (
          <p className="text-center text-13 text-fg-3">{t("home.noScanTile")}</p>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            {selected ? (
              <SelectedObject e={selected} onClear={() => setSelectedId(null)} />
            ) : (
              <motion.div key="legend" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: DUR.fast }}>
                <p className="text-14 font-medium text-fg">{t("radar.hint")}</p>
                <p className="mt-1.5 text-13 text-fg-3">{t("home.radarLegend")}</p>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function Kpi({ to, label, hint, children, extra, className }: { to: string; label: string; hint: string; children: ReactNode; extra?: ReactNode; className?: string }) {
  return (
    <Link
      to={to}
      className={cn("panel group relative flex flex-col overflow-hidden p-5 transition-[transform,box-shadow] duration-base ease-out hover:-translate-y-0.5 hover:shadow-overlay", className)}
    >
      <div className="tech">{label}</div>
      <div className="mt-3 flex items-baseline gap-2">{children}</div>
      {extra}
      <p className="mt-auto pt-3 text-12 text-fg-3">{hint}</p>
    </Link>
  );
}

// AD Security Score bands (bandFor in lib/risk): < 40 Critical, 40–59 Poor, 60–79 Fair, ≥ 80 Good.
const BAND_SEGMENTS = [
  { band: "Critical", from: 0, to: 40 },
  { band: "Poor", from: 40, to: 60 },
  { band: "Fair", from: 60, to: 80 },
  { band: "Good", from: 80, to: 100 },
] as const;

/** Thin 0–100 scale with the four bands and a marker at the current score. */
function ScoreScale({ score }: { score: number }) {
  return (
    <div className="mt-4" aria-hidden>
      <div className="relative h-1.5">
        <div className="flex h-full overflow-hidden rounded-full">
          {BAND_SEGMENTS.map((s) => (
            <span
              key={s.band}
              className="h-full border-raised last:border-0 [border-right-width:2px]"
              style={{ width: `${s.to - s.from}%`, background: tint(BAND_COLOR[s.band], 38) }}
            />
          ))}
        </div>
        <motion.span
          className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-fg"
          initial={{ left: "0%" }}
          animate={{ left: `calc(${score}% - 1px)` }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.2 }}
        />
      </div>
      <div className="relative mt-1.5 h-4 font-mono text-12 text-fg-3">
        {[0, 40, 60, 80, 100].map((n) => (
          <span key={n} className="absolute top-0" style={{ left: `${n}%`, transform: `translateX(${n === 0 ? 0 : n === 100 ? -100 : -50}%)` }}>
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Real distribution of the at-risk objects by level, as one stacked hairline bar. */
function LevelStrip({ counts }: { counts: Record<RiskLevel, number> }) {
  const total = LEVELS.reduce((s, l) => s + counts[l], 0) || 1;
  return (
    <div className="mt-4 flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
      {LEVELS.map((l) => (
        <span key={l} className={cn("h-full", LEVEL_META[l].dot)} style={{ width: `${(counts[l] / total) * 100}%` }} />
      ))}
    </div>
  );
}

/** The story under the hero: the numbers, what they mean, the worst object and the best first fixes. */
function Overview({ d }: { d: Dashboard }) {
  const { t, objectType } = useI18n();
  const { findings, params, ruleName } = useScanModel();
  const totalAtRisk = LEVELS.reduce((s, l) => s + d.level_counts[l], 0);
  const paths = pathFindings(findings);
  const top = d.top_risky[0];
  const topFinding = findings?.filter((f) => f.object_id === top?.object_id).sort((a, b) => b.rule_weight - a.rule_weight)[0];
  const impacts = useMemo(() => (findings && params ? ruleImpacts(findings, params).filter((r) => r.gain > 0).slice(0, 3) : []), [findings, params]);
  const TopIcon = top ? OBJECT_ICON[top.object_type] : null;
  const critCut = params?.levels.critical ?? 80;

  return (
    <motion.section variants={itemMotion} className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.7fr)_repeat(3,minmax(0,1fr))]" data-tour="kpis">
        <Kpi
          to="/dashboard"
          label={t("overview.kpiScore")}
          hint={t("overview.kpiScoreHint")}
          extra={<ScoreScale score={d.ad_security_score} />}
          className="sm:col-span-2 lg:col-span-1"
        >
          <span className="font-mono text-56 font-medium leading-none text-fg">{d.ad_security_score}</span>
          <span className="font-mono text-16 text-fg-3">/100</span>
          <span className="ml-auto inline-flex items-center gap-1.5 self-center text-14 text-fg-2">
            <span className="size-2 rounded-full" style={{ background: BAND_COLOR[d.score_band] }} aria-hidden />
            {t(`bands.${d.score_band}`)}
          </span>
        </Kpi>
        <Kpi
          to="/findings?level=Critical"
          label={t("overview.kpiCritical")}
          hint={t("overview.kpiCriticalHint", { n: critCut })}
          className="before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-risk-critical before:content-['']"
        >
          <span className="font-mono text-40 text-risk-critical">{d.level_counts.Critical}</span>
        </Kpi>
        <Kpi to="/findings" label={t("overview.kpiObjects")} hint={t("overview.kpiObjectsHint")} extra={<LevelStrip counts={d.level_counts} />}>
          <span className="font-mono text-40 text-fg">{totalAtRisk}</span>
        </Kpi>
        <Kpi to="/paths" label={t("overview.kpiPaths")} hint={t("overview.kpiPathsHint")}>
          <span className="font-mono text-40 text-fg">{findings ? paths.length : "—"}</span>
          <svg viewBox="0 0 48 8" className="ml-auto h-2 w-12 self-center text-fg-3" aria-hidden>
            <path d="M4 4H44" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
            {[4, 17, 30].map((x) => (
              <circle key={x} cx={x} cy="4" r="2.4" fill="rgb(var(--raised))" stroke="currentColor" strokeWidth="1" />
            ))}
            <circle cx="44" cy="4" r="2.8" className="fill-risk-critical" />
          </svg>
        </Kpi>
      </div>
      <p className="max-w-[80ch] text-13 text-fg-2">{t("overview.explain", { score: d.ad_security_score, objects: totalAtRisk })}</p>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {top && TopIcon && (
          <div className="panel flex flex-col p-6">
            <div className="kicker">{t("overview.mainRisk")}</div>
            <div className="mt-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="display truncate text-28">{top.object_name}</h2>
                <div className="mt-1 flex items-center gap-2 text-13 text-fg-3">
                  <TopIcon className="size-4" aria-hidden />
                  {objectType(top.object_type)}
                  {top.tier0 && " · Tier-0"}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-mono text-40 leading-none text-fg">{top.score}</div>
                <RiskChip level={top.level} className="mt-2" />
              </div>
            </div>
            <p className="mt-4 text-14 text-fg">{top.top_title}</p>
            {topFinding?.recommendation && <p className="mt-2 text-13 text-fg-2">{topFinding.recommendation}</p>}
            {top.privilege_path && (
              <div className="mt-4">
                <PrivilegePathGraph path={top.privilege_path} edges={top.path_edges} compact />
              </div>
            )}
            <div className="mt-auto flex flex-wrap gap-2 pt-5">
              <Button asChild variant="secondary" size="sm">
                <Link to={`/accounts/${top.object_id}`}>
                  {t("overview.openObject")} <ArrowRight />
                </Link>
              </Button>
              {paths.length > 0 && (
                <Button asChild variant="tertiary" size="sm">
                  <Link to="/paths">
                    {t("overview.explorePaths")} <ArrowRight />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="panel flex flex-col p-6">
          <div className="kicker">{t("overview.priorities")}</div>
          <p className="mt-2 text-13 text-fg-3">{t("overview.prioritiesSub")}</p>
          <ol className="mt-4 space-y-2">
            {impacts.map((r, i) => {
              const Icon = CATEGORY_ICON[r.category];
              return (
                <li key={r.rule_id} className="flex items-center gap-3 rounded-control bg-fg/[0.03] px-3 py-3">
                  <span className="w-5 shrink-0 font-serif text-20 italic text-brand">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-14 text-fg">{ruleName(r.rule_id)}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 truncate text-12 text-fg-3">
                      <Icon className="size-3.5 shrink-0" aria-hidden />
                      <span className="font-mono">{r.rule_id}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right" title={t("overview.gainHint")}>
                    <div className="font-mono text-16 text-risk-low">{t("overview.gain", { n: r.gain })}</div>
                    <div className="text-12 text-fg-3">{t("overview.gainHint")}</div>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="mt-auto pt-5">
            <Button asChild variant="secondary" size="sm">
              <Link to={`/simulator?fix=${impacts.map((r) => r.rule_id).join(",")}`}>
                {t("overview.openSimulator")} <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

/** The vision screen: one statement, one primary action, a radar that shows the real scan, then the story. */
export default function PlatformHome() {
  const { t, tp, lang } = useI18n();
  const navigate = useNavigate();
  const { runScan, running } = useScan();
  const { data: d } = useQuery({ queryKey: ["dashboard", "latest", lang, "radar"], queryFn: () => api.dashboard("latest", 50), retry: false });
  const { data: rules } = useQuery({ queryKey: ["rules", lang], queryFn: api.rules, staleTime: 300_000 });

  return (
    <motion.div variants={listMotion} initial="hidden" animate="show" className="space-y-16 pb-8">
      {/* ------------------------------------------------------------ hero */}
      <section className="relative grid grid-cols-[minmax(0,1fr)] items-center gap-10 overflow-x-clip lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-12">
        <motion.div variants={itemMotion} className="max-w-xl">
          <div className="kicker">{t("home.eyebrow")}</div>
          <h1 className="display mt-5 text-40 leading-[1.12] tracking-[-0.02em]" aria-live="polite" data-tour="headline">
            {d ? (
              <LiveHeadline d={d} />
            ) : (
              <>
                {t("home.heroA")}
                {t("home.heroB")}
                {t("home.heroC")}
              </>
            )}
          </h1>
          <p className="mt-5 max-w-[46ch] text-16 text-fg-2">{t("home.heroText")}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" onClick={() => runScan()} disabled={running}>
              <Play /> {t("home.runIdentityScan")}
            </Button>
            <Button variant="secondary" size="lg" onClick={() => navigate("/dashboard")}>
              {t("home.openDashboard")} <ArrowRight />
            </Button>
          </div>
          <p className="mt-5 text-13 text-fg-3">{t("home.offline")}</p>
        </motion.div>

        <motion.figure variants={itemMotion} className="w-full" data-tour="radar">
          <RadarCard d={d} />
        </motion.figure>
      </section>

      {/* ------------------------------------------------------------ numbers, main risk, first fixes */}
      {d && <Overview d={d} />}

      {/* ------------------------------------------------------------ modules: uniform cards */}
      <motion.section variants={itemMotion}>
        <h2 className="kicker mb-5">{t("home.modulesTitle")}</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {MODULES.map((m) => {
            const body = (
              <>
                <div className="flex items-center justify-between">
                  <m.icon className={cn("size-5", m.live ? "text-fg" : "text-fg-3")} aria-hidden />
                  <span className="inline-flex items-center gap-1.5 text-12 text-fg-3">
                    {m.live && <span className="size-1.5 rounded-full bg-brand" aria-hidden />}
                    {t(m.live ? "home.live" : "home.comingSoon")}
                  </span>
                </div>
                <h3 className={cn("display mt-5 text-20", !m.live && "text-fg-2")}>{t(m.name)}</h3>
                <p className="mt-1.5 text-13 text-fg-3">{t(m.blurb)}</p>
              </>
            );
            return (
              <li key={m.name}>
                {m.live ? (
                  <Link
                    to="/dashboard"
                    className="panel group block h-full p-5 transition-[transform,box-shadow] duration-base ease-out hover:-translate-y-0.5 hover:shadow-overlay"
                  >
                    {body}
                    <span className="mt-4 inline-flex items-center gap-1 text-13 text-fg-2 transition-colors duration-fast group-hover:text-fg">
                      {t("home.openIdentity")} <ArrowRight className="size-3.5" />
                    </span>
                  </Link>
                ) : (
                  <div className="panel h-full p-5 opacity-60">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </motion.section>

      {/* ------------------------------------------------------------ how it works */}
      <motion.section variants={itemMotion}>
        <h2 className="kicker mb-5">{t("home.howItWorks")}</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="panel p-5">
              <span className="font-serif text-28 italic text-brand">0{i + 1}</span>
              <div className="mt-4 text-14 font-semibold text-fg">{t(s.title)}</div>
              <p className="mt-1.5 text-13 text-fg-2">{t(s.text)}</p>
            </li>
          ))}
        </ol>
      </motion.section>

      {/* ------------------------------------------------------------ what is checked */}
      {rules && rules.length > 0 && (
        <motion.section variants={itemMotion}>
          <h2 className="kicker mb-5">
            <MonoDigits text={tp("home.checks", rules.length)} />
          </h2>
          <ul className="panel grid gap-x-8 px-5 py-2 sm:grid-cols-2 lg:grid-cols-5">
            {CATEGORIES.map((c) => {
              const Icon = CATEGORY_ICON[c];
              const n = rules.filter((r) => r.category === c).length;
              return (
                <li key={c}>
                  <Link
                    to={`/findings?category=${c}`}
                    className="-mx-2 flex items-start gap-3 rounded-control px-2 py-3 transition-colors duration-fast hover:bg-fg/[0.04] [&>svg]:mt-0.5"
                  >
                    <Icon className="size-4 shrink-0 text-fg-3" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-14 text-fg-2">{t(`categories.${c}`)}</span>
                      <MonoDigits text={tp("home.checksN", n)} className="block text-13 text-fg-3" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </motion.section>
      )}
    </motion.div>
  );
}

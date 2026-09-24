import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, RotateCcw, Save } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { MonoDigits } from "@/components/MonoDigits";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RadarSweep } from "@/components/ui/radar-sweep";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { useI18n, type TKey } from "@/lib/i18n";
import { useScanModel } from "@/lib/model";
import { DUR, EASE } from "@/lib/motion";
import { BAND_COLOR, CATEGORIES, CATEGORY_ICON, LEVELS, LEVEL_META, tint } from "@/lib/risk";
import { levelFor, simulate } from "@/lib/simulate";
import type { AnalysisSettings, Entity, Finding, RuleSetting, Thresholds } from "@/lib/types";
import { cn } from "@/lib/utils";

// Labels: settings.fields.<key> / settings.fields.<key>Hint; values: settings.units.<unit>.
const THRESHOLDS = [
  { key: "inactive_days", min: 30, max: 365, step: 5, unit: "days" },
  { key: "pwd_max_age_days", min: 30, max: 1095, step: 15, unit: "days" },
  { key: "svc_pwd_max_age_days", min: 30, max: 1095, step: 15, unit: "days" },
  { key: "computer_inactive_days", min: 30, max: 365, step: 5, unit: "days" },
  { key: "krbtgt_max_age_days", min: 30, max: 730, step: 10, unit: "days" },
  { key: "da_max_members", min: 1, max: 30, step: 1, unit: "members" },
  { key: "min_pwd_length", min: 8, max: 24, step: 1, unit: "chars" },
  { key: "spray_min_accounts", min: 3, max: 50, step: 1, unit: "accounts" },
  { key: "spray_window_minutes", min: 5, max: 240, step: 5, unit: "min" },
  { key: "brute_min_failures", min: 5, max: 100, step: 1, unit: "failures" },
] as const satisfies readonly { key: keyof Thresholds; min: number; max: number; step: number; unit: string }[];

const SECTIONS: { id: string; label: TKey }[] = [
  { id: "s-scale", label: "settings.scale" },
  { id: "s-weights", label: "settings.ruleWeights" },
  { id: "s-thresholds", label: "settings.thresholds" },
  { id: "s-heuristics", label: "settings.heuristics" },
  { id: "s-system", label: "settings.system" },
];

/** Number of leaf values that differ between two settings objects (for the "N changes" counter). */
function countChanges(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return JSON.stringify(a) === JSON.stringify(b) ? 0 : 1;
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b) ? 0 : 1;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let n = 0;
  for (const k of keys) n += countChanges((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]);
  return n;
}

const PILL = "shrink-0 rounded-inner bg-fg/[0.05] px-2 py-0.5 font-mono text-13 text-fg";

function AfterRescoreTag() {
  const { t } = useI18n();
  return (
    <span className="tech -mt-2 mb-5 inline-flex items-start gap-1.5 rounded-control border border-line-strong px-2.5 py-1 normal-case tracking-normal">
      <Info className="mt-px size-3.5 shrink-0" aria-hidden /> {t("settings.afterRescore")}
    </span>
  );
}

function Field({ label, hint, value, children, min, max }: { label: string; hint?: string; value: ReactNode; children: ReactNode; min?: ReactNode; max?: ReactNode }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-14 text-fg">{label}</div>
          {hint && <p className="mt-0.5 font-mono text-12 text-fg-3">{hint}</p>}
        </div>
        <span className={PILL}>{value}</span>
      </div>
      <div className="mt-2">{children}</div>
      {(min != null || max != null) && (
        <div className="-mt-0.5 flex justify-between font-mono text-12 text-fg-3/80">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      )}
    </div>
  );
}

function RuleRow({ r, weight, enabled, onWeight, onEnabled }: { r: RuleSetting; weight: number; enabled: boolean; onWeight: (w: number) => void; onEnabled: (e: boolean) => void }) {
  const { t } = useI18n();
  const changed = Math.abs(weight - r.default_weight) > 1e-9 || !enabled;
  return (
    <div
      className={cn(
        "relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3 pl-3 sm:grid-cols-[minmax(0,1fr)_8rem_3rem_auto]",
        "before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-full before:transition-colors before:duration-base before:content-['']",
        changed ? "before:bg-brand" : "before:bg-transparent",
      )}
    >
      <div className={cn("min-w-0 transition-opacity duration-fast", !enabled && "opacity-45")}>
        <div className="text-14 leading-snug text-fg">{r.name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-12 text-fg-3">
          {r.id}
          {Math.abs(weight - r.default_weight) > 1e-9 && (
            <button type="button" onClick={() => onWeight(r.default_weight)} className="font-sans text-fg-2 underline decoration-fg/30 underline-offset-2 hover:text-fg hover:decoration-fg">
              {t("settings.reset", { w: r.default_weight.toFixed(2) })}
            </button>
          )}
        </div>
      </div>
      <Slider
        className="order-3 col-span-2 sm:order-none sm:col-span-1"
        min={0}
        max={1}
        step={0.05}
        value={[weight]}
        onValueChange={([v]) => onWeight(v)}
        disabled={!enabled}
        aria-label={t("settings.weightAria", { name: r.name })}
      />
      <span className={cn(PILL, "hidden text-center sm:block", !changed && "text-fg-3")}>{weight.toFixed(2)}</span>
      <Switch checked={enabled} onCheckedChange={onEnabled} aria-label={t("settings.enabledAria", { name: r.name })} />
    </div>
  );
}

/** One scale, three markers: where Medium, High and Critical start. Order can't be broken. */
function RiskScale({ levels, onChange }: { levels: AnalysisSettings["levels"]; onChange: (l: AnalysisSettings["levels"]) => void }) {
  const { t, level } = useI18n();
  const { medium, high, critical } = levels;
  const zones = [
    { l: "Low" as const, from: 0, to: medium },
    { l: "Medium" as const, from: medium, to: high },
    { l: "High" as const, from: high, to: critical },
    { l: "Critical" as const, from: critical, to: 100 },
  ];
  const gradient = `linear-gradient(90deg, ${zones.map((z) => `${tint(LEVEL_META[z.l].color, 55)} ${z.from}% ${z.to}%`).join(", ")})`;
  return (
    <div>
      <Slider
        min={1}
        max={100}
        step={1}
        minStepsBetweenThumbs={1}
        value={[medium, high, critical]}
        onValueChange={([m, h, c]) => onChange({ medium: m, high: h, critical: c })}
        noRange
        trackClassName="h-2.5 bg-transparent"
        trackStyle={{ background: gradient }}
        thumbLabels={[t("settings.mediumFrom"), t("settings.highFrom"), t("settings.criticalFrom")]}
      />
      <div className="relative mt-2 h-10">
        {zones.map((z) => (
          <div key={z.l} className="absolute top-0 min-w-0 overflow-hidden px-1 text-center" style={{ left: `${z.from}%`, width: `${z.to - z.from}%` }}>
            <div className="flex items-center justify-center gap-1.5 truncate text-12 text-fg-2">
              <span className={cn("size-1.5 shrink-0 rounded-full", LEVEL_META[z.l].dot)} aria-hidden />
              <span className="truncate">{level(z.l)}</span>
            </div>
            <div className="truncate font-mono text-12 text-fg-3">
              {z.l === "Low" ? `< ${z.to}` : z.l === "Critical" ? `≥ ${z.from}` : `${z.from}–${z.to - 1}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Live preview: the latest scan re-scored with the draft weights, switches, scale and k — before saving. */
function Preview({ draft, saved, rules, findings, dirty }: { draft: AnalysisSettings; saved: AnalysisSettings; rules: RuleSetting[]; findings?: Finding[]; dirty: number }) {
  const { t, tp, level, lang } = useI18n();
  const { data: dash } = useQuery({ queryKey: ["dashboard", "latest", lang, "radar"], queryFn: () => api.dashboard("latest", 50), retry: false });

  const model = useMemo(() => {
    if (!findings) return null;
    const def = new Map(rules.map((r) => [r.id, r.default_weight]));
    const weight = (id: string) => draft.rule_weights[id] ?? def.get(id) ?? 0;
    const on = (id: string) => draft.rule_enabled[id] ?? true;
    const drafted = findings.filter((f) => on(f.rule_id)).map((f) => ({ ...f, rule_weight: weight(f.rule_id), k: f.k > 1 ? draft.k_tier0 : 1 }));
    return {
      now: simulate(findings, { levels: saved.levels, score_tau: saved.score_tau }),
      next: simulate(drafted, { levels: draft.levels, score_tau: draft.score_tau }),
    };
  }, [findings, rules, draft, saved]);

  const radar = useMemo<Entity[]>(() => {
    if (!dash || !model) return [];
    return dash.top_risky.map((e) => {
      const s = model.next.scores.get(e.object_id);
      return s == null ? e : { ...e, score: s, level: levelFor(s, draft.levels) };
    });
  }, [dash, model, draft.levels]);
  const ghosts = useMemo(() => new Set(radar.filter((e) => !model?.next.scores.has(e.object_id)).map((e) => e.object_id)), [radar, model]);

  const thresholdsChanged = JSON.stringify(draft.thresholds) !== JSON.stringify(saved.thresholds) || JSON.stringify(draft.service) !== JSON.stringify(saved.service);
  const reEnabled = Object.keys(saved.rule_enabled).some((id) => saved.rule_enabled[id] === false && (draft.rule_enabled[id] ?? true));

  if (!model) return <Skeleton className="h-[520px] rounded-card" />;
  const { now, next } = model;
  const delta = next.score - now.score;

  return (
    <div className="instrument panel space-y-5 p-6" style={{ backgroundImage: "radial-gradient(120% 45% at 50% 20%, rgb(255 250 240 / 0.055), transparent 70%)" }}>
      <div>
        <div className="kicker">{t("settings.preview")}</div>
        <p className="mt-1.5 text-12 text-fg-3">{t("settings.previewSub")}</p>
      </div>
      {radar.length > 0 && <RadarSweep entities={radar} ghosts={ghosts} className="mx-auto max-w-[220px]" />}
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-12 text-fg-3">{t("settings.previewDraft")}</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <AnimatedCounter value={next.score} className="font-mono text-56 font-medium leading-none" />
            <span className="font-mono text-13 text-fg-3">/100</span>
          </div>
          <div className="mt-2 inline-flex items-center gap-1.5 text-13 text-fg-2">
            <span className="size-2 rounded-full" style={{ background: BAND_COLOR[next.band] }} aria-hidden />
            {t(`bands.${next.band}`)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-12 text-fg-3">{t("sim.now")}</div>
          <div className="mt-1 font-mono text-20 text-fg-2">{now.score}</div>
          <div className={cn("mt-1 font-mono text-13", delta > 0 ? "text-risk-low" : delta < 0 ? "text-risk-critical" : "text-fg-3")}>
            {delta === 0 ? "±0" : `${delta > 0 ? "+" : "−"}${Math.abs(delta)}`}
          </div>
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {LEVELS.map((l) => (
          <li key={l} className="flex items-center gap-1.5 rounded-control bg-fg/[0.05] px-2.5 py-2 text-13">
            <span className={cn("size-2 shrink-0 rounded-full", LEVEL_META[l].dot)} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-12 text-fg-2" title={level(l)}>
              {level(l)}
            </span>
            <span className="font-mono text-fg">
              {next.levels[l]}
              {next.levels[l] !== now.levels[l] && <span className="text-fg-3"> ({now.levels[l]})</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-13 text-fg-2">
        <span className="font-mono text-fg">{next.objects}</span> {tp("charts.objectsAtRisk", next.objects)}
        {next.objects !== now.objects && <span className="text-fg-3"> ({now.objects})</span>}
      </p>
      {(dirty > 0 || thresholdsChanged || reEnabled) && (
        <div className="space-y-1.5 border-t border-line pt-4 text-12 text-fg-3">
          {dirty > 0 && <p className="font-mono text-fg-2">{tp("settings.changes", dirty)}</p>}
          {thresholdsChanged && <p>{t("settings.afterRescore")}</p>}
          {reEnabled && <p>{t("settings.enabledLater")}</p>}
        </div>
      )}
    </div>
  );
}

/** Sticky section index with the current section highlighted (2xl and up). */
function SectionNav() {
  const { t } = useI18n();
  const [current, setCurrent] = useState(SECTIONS[0].id);
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setCurrent(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return (
    <nav className="sticky top-24 hidden 2xl:block" aria-label={t("titles.settings")}>
      <ul className="space-y-0.5 border-l border-line">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={cn(
                "-ml-px block border-l py-1.5 pl-4 text-13 transition-colors duration-fast",
                current === s.id ? "border-brand font-medium text-fg" : "border-transparent text-fg-3 hover:text-fg",
              )}
            >
              {t(s.label)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function Settings() {
  const { t, lang, category, fmtDateTime } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  // rule names are localized; keep the previous language's payload while the new one loads
  const { data, error, isLoading } = useQuery({ queryKey: ["settings", lang], queryFn: api.settings, placeholderData: keepPreviousData });
  const { data: audit } = useQuery({ queryKey: ["audit"], queryFn: () => api.audit(20) });
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health });
  const { findings } = useScanModel();
  const [draft, setDraft] = useState<AnalysisSettings | null>(null);

  useEffect(() => {
    if (data && !draft) setDraft(structuredClone(data.settings));
  }, [data, draft]);

  const changes = useMemo(() => (data && draft ? countChanges(data.settings, draft) : 0), [data, draft]);
  const dirty = changes > 0;

  const save = useMutation({
    mutationFn: (rescore: boolean) => api.saveSettings(draft!, rescore),
    onSuccess: async (res) => {
      setDraft(structuredClone(res.settings));
      await qc.invalidateQueries();
      if (res.rescored) {
        toast.success(t("settings.savedRescored"), { description: t("settings.newScore", { n: res.rescored.ad_security_score }) });
        navigate("/dashboard");
      } else {
        toast.success(t("settings.saved"), { description: t("settings.savedDesc") });
      }
    },
    onError: (e) => toast.error(t("settings.saveError"), { description: e instanceof Error ? e.message : String(e) }),
  });

  const reset = useMutation({
    mutationFn: async () => {
      const res = await api.resetSettings();
      let rescored = false;
      try {
        await api.rescore("latest");
        rescored = true;
      } catch {
        /* no scan yet — defaults apply to the first scan */
      }
      return { res, rescored };
    },
    onSuccess: async ({ res, rescored }) => {
      setDraft(structuredClone(res.settings));
      await qc.invalidateQueries();
      toast.success(t("settings.defaultsRestored"), { description: t(rescored ? "settings.defaultsRescored" : "settings.defaultsNext") });
    },
    onError: (e) => toast.error(t("settings.restoreError"), { description: e instanceof Error ? e.message : String(e) }),
  });

  if (error) return <ErrorState error={error} />;
  if (isLoading || !data || !draft)
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" aria-busy>
        <Skeleton className="h-[560px] rounded-card" />
        <Skeleton className="h-[560px] rounded-card" />
      </div>
    );

  const setT = (k: keyof Thresholds, v: number) => setDraft({ ...draft, thresholds: { ...draft.thresholds, [k]: v } });
  const weightOf = (r: RuleSetting) => draft.rule_weights[r.id] ?? r.default_weight;
  const enabledOf = (r: RuleSetting) => draft.rule_enabled[r.id] ?? true;
  const setWeight = (r: RuleSetting, w: number) => {
    const rw = { ...draft.rule_weights };
    if (Math.abs(w - r.default_weight) < 1e-9) delete rw[r.id];
    else rw[r.id] = Math.round(w * 100) / 100;
    setDraft({ ...draft, rule_weights: rw });
  };
  const setEnabled = (r: RuleSetting, e: boolean) => {
    const re = { ...draft.rule_enabled };
    if (e) delete re[r.id];
    else re[r.id] = false;
    setDraft({ ...draft, rule_enabled: re });
  };
  const levelsValid = draft.levels.critical > draft.levels.high && draft.levels.high > draft.levels.medium;

  return (
    <div className="space-y-8 pb-28">
      {/* ---- masthead ---- */}
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="min-w-0 max-w-3xl">
          <div className="kicker">Identity Radar · {t("nav.settings")}</div>
          <h1 className="display mt-3 text-40 leading-[1.1]">{t("settings.pageTitle")}</h1>
          <p className="mt-3 text-14 text-fg-2">{t("settings.pageSub")}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => reset.mutate()} disabled={reset.isPending}>
          <RotateCcw /> {t("settings.restoreDefaults")}
        </Button>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[160px_minmax(0,1fr)_320px]">
        <SectionNav />

        {/* ---- the preview: first on narrow screens, a sticky instrument on the right from xl ---- */}
        <aside className="min-w-0 xl:sticky xl:top-20 xl:order-last xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:rounded-card">
          <Preview draft={draft} saved={data.settings} rules={data.rules} findings={findings} dirty={changes} />
        </aside>

        <div className="min-w-0 space-y-6">
          <Panel id="s-scale" className="scroll-mt-24">
            <PanelHeader title={t("settings.scale")} subtitle={t("settings.scaleSub")} />
            <RiskScale levels={draft.levels} onChange={(levels) => setDraft({ ...draft, levels })} />
            {!levelsValid && <p className="mt-2 text-13 text-fg">{t("settings.cutoffError")}</p>}
            <div className="mt-6 border-t border-line pt-5">
              <Field label={t("settings.kLabel")} hint={t("settings.kHint")} value={`× ${draft.k_tier0.toFixed(2)}`} min="× 1.00" max="× 1.50">
                <Slider min={1} max={1.5} step={0.05} value={[draft.k_tier0]} onValueChange={([v]) => setDraft({ ...draft, k_tier0: Math.round(v * 100) / 100 })} aria-label={t("settings.kLabel")} />
              </Field>
            </div>
          </Panel>

          <Panel id="s-weights" className="scroll-mt-24">
            <PanelHeader title={t("settings.ruleWeights")} subtitle={t("settings.ruleWeightsSub")} />
            <div className="space-y-6">
              {CATEGORIES.map((cat) => {
                const Icon = CATEGORY_ICON[cat];
                const rules = data.rules.filter((r) => r.category === cat);
                return (
                  <section key={cat}>
                    <h3 className="tech flex items-center gap-2 border-b border-line pb-2">
                      <Icon className="size-3.5" aria-hidden /> {category(cat)}
                      <span className="ml-auto font-mono text-fg-3/80">{rules.length}</span>
                    </h3>
                    <div className="divide-y divide-line">
                      {rules.map((r) => (
                        <RuleRow key={r.id} r={r} weight={weightOf(r)} enabled={enabledOf(r)} onWeight={(w) => setWeight(r, w)} onEnabled={(e) => setEnabled(r, e)} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </Panel>

          <Panel id="s-thresholds" className="scroll-mt-24">
            <PanelHeader title={t("settings.thresholds")} subtitle={t("settings.thresholdsSub")} />
            <AfterRescoreTag />
            <div className="grid gap-x-10 gap-y-7 md:grid-cols-2">
              {THRESHOLDS.map((th) => (
                <Field
                  key={th.key}
                  label={t(`settings.fields.${th.key}`)}
                  hint={t(`settings.fields.${th.key}Hint`)}
                  value={<MonoDigits text={t(`settings.units.${th.unit}`, { n: draft.thresholds[th.key] })} />}
                  min={th.min}
                  max={th.max}
                >
                  <Slider min={th.min} max={th.max} step={th.step} value={[draft.thresholds[th.key]]} onValueChange={([v]) => setT(th.key, v)} aria-label={t(`settings.fields.${th.key}`)} />
                </Field>
              ))}
            </div>
          </Panel>

          <Panel id="s-heuristics" className="scroll-mt-24">
            <PanelHeader title={t("settings.heuristics")} subtitle={t("settings.heuristicsSub")} />
            <AfterRescoreTag />
            <div className="space-y-5">
              <label className="block space-y-1.5">
                <span className="text-14 text-fg">{t("settings.prefixes")}</span>
                <Input
                  value={draft.service.name_prefixes.join(", ")}
                  onChange={(e) => setDraft({ ...draft, service: { ...draft.service, name_prefixes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })}
                  className="font-mono text-13"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-14 text-fg">{t("settings.ouMarkers")}</span>
                <Input
                  value={draft.service.ou_markers.join(", ")}
                  onChange={(e) => setDraft({ ...draft, service: { ...draft.service, ou_markers: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })}
                  className="font-mono text-13"
                />
              </label>
              <label className="flex items-center justify-between gap-4">
                <span className="text-14 text-fg">{t("settings.spnOnUser")}</span>
                <Switch checked={draft.service.spn_on_user} onCheckedChange={(v) => setDraft({ ...draft, service: { ...draft.service, spn_on_user: v } })} />
              </label>
              <label className="flex items-center justify-between gap-4">
                <span className="text-14 text-fg">{t("settings.includeGmsa")}</span>
                <Switch checked={draft.service.include_gmsa} onCheckedChange={(v) => setDraft({ ...draft, service: { ...draft.service, include_gmsa: v } })} />
              </label>
            </div>
          </Panel>

          <section id="s-system" className="scroll-mt-24 space-y-6">
            <Panel>
              <PanelHeader title={t("topbar.collector")} />
              <dl className="space-y-2.5 text-13">
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-3">{t("settings.sourceLabel")}</dt>
                  <dd className="font-mono text-fg">{health?.config.source ?? "…"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-3">LDAP</dt>
                  <dd className="min-w-0 break-all text-right text-fg">
                    {health?.config.ldap_configured ? (
                      <span className="font-mono">{t("settings.ldapAs", { url: health.config.ldap_url ?? "", user: health.config.ldap_bind_user ?? "" })}</span>
                    ) : (
                      <span className="text-fg-2">{t("settings.ldapNotConfigured")}</span>
                    )}
                  </dd>
                </div>
              </dl>
            </Panel>

            <Panel className="p-0">
              <div className="px-6 pt-6">
                <PanelHeader title={t("settings.auditLog")} subtitle={t("settings.auditSub")} className="mb-3" />
              </div>
              <ul className="max-h-80 overflow-auto pb-3 text-13">
                {audit?.map((a) => (
                  <li key={a.id} className="grid grid-cols-[9.5rem_1fr] gap-3 px-6 py-1.5">
                    <span className="font-mono text-12 text-fg-3">{fmtDateTime(a.ts)}</span>
                    <span className="min-w-0 truncate">
                      <span className="font-mono text-12 text-fg">{a.action}</span> <span className="text-fg-3">{t("settings.by")}</span>{" "}
                      <span className="text-fg-2">{a.actor}</span>
                      {a.target && <span className="font-mono text-12 text-fg-3"> · {a.target.slice(0, 8)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </section>
        </div>
      </div>

      {/* ---- save bar: the page's single primary action ---- */}
      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: DUR.base, ease: EASE }}
            className="instrument fixed inset-x-0 bottom-6 z-40 mx-auto flex w-[min(640px,calc(100%-2rem))] flex-wrap items-center justify-between gap-3 rounded-card bg-raised px-4 py-3 shadow-overlay"
          >
            <span className="text-14 text-fg">
              {t("settings.unsaved")} <span className="font-mono text-12 text-fg-3">· {changes}</span>
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="tertiary" size="sm" onClick={() => setDraft(structuredClone(data.settings))}>
                {t("settings.discard")}
              </Button>
              <Button variant="secondary" size="sm" disabled={!levelsValid || save.isPending} onClick={() => save.mutate(false)}>
                <Save /> {t("settings.save")}
              </Button>
              <Button variant="primary" size="sm" disabled={!levelsValid || save.isPending} onClick={() => save.mutate(true)}>
                <RotateCcw /> {t("settings.saveRescore")}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

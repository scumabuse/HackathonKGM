import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Save } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { MonoDigits } from "@/components/MonoDigits";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { DUR, EASE } from "@/lib/motion";
import { CATEGORIES, CATEGORY_ICON } from "@/lib/risk";
import type { AnalysisSettings, RuleSetting, Thresholds } from "@/lib/types";
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

const CUTOFFS = [
  { lvl: "critical", label: "settings.criticalFrom" },
  { lvl: "high", label: "settings.highFrom" },
  { lvl: "medium", label: "settings.mediumFrom" },
] as const;

function Field({ label, hint, value, children }: { label: string; hint?: string; value: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-14 text-fg">{label}</span>
        <span className="shrink-0 text-14 text-fg">{value}</span>
      </div>
      {hint && <p className="text-12 text-fg-3">{hint}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function RuleRow({ r, weight, enabled, onWeight, onEnabled }: { r: RuleSetting; weight: number; enabled: boolean; onWeight: (w: number) => void; onEnabled: (e: boolean) => void }) {
  const { t } = useI18n();
  const changed = Math.abs(weight - r.default_weight) > 1e-9;
  return (
    <div className={cn("grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 py-3 sm:grid-cols-[minmax(0,1fr)_9rem_2.75rem_auto]", !enabled && "opacity-50")}>
      <div className="min-w-0">
        <div className="truncate text-14 text-fg">{r.name}</div>
        <div className="flex items-center gap-2 font-mono text-12 text-fg-3">
          {r.id}
          {changed && (
            <button type="button" onClick={() => onWeight(r.default_weight)} className="font-sans text-fg-2 underline-offset-2 hover:text-fg hover:underline">
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
      <div className={cn("hidden text-right font-mono text-13 sm:block", changed ? "text-fg" : "text-fg-3")}>{weight.toFixed(2)}</div>
      <Switch checked={enabled} onCheckedChange={onEnabled} aria-label={t("settings.enabledAria", { name: r.name })} />
    </div>
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
  const [draft, setDraft] = useState<AnalysisSettings | null>(null);

  useEffect(() => {
    if (data && !draft) setDraft(structuredClone(data.settings));
  }, [data, draft]);

  const dirty = useMemo(() => !!data && !!draft && JSON.stringify(data.settings) !== JSON.stringify(draft), [data, draft]);

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
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2" aria-busy>
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
    <div className="space-y-6 pb-24">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <Panel>
            <PanelHeader title={t("settings.thresholds")} subtitle={t("settings.thresholdsSub")} />
            <div className="space-y-6">
              {THRESHOLDS.map((th) => (
                <Field
                  key={th.key}
                  label={t(`settings.fields.${th.key}`)}
                  hint={t(`settings.fields.${th.key}Hint`)}
                  value={<MonoDigits text={t(`settings.units.${th.unit}`, { n: draft.thresholds[th.key] })} />}
                >
                  <Slider min={th.min} max={th.max} step={th.step} value={[draft.thresholds[th.key]]} onValueChange={([v]) => setT(th.key, v)} aria-label={t(`settings.fields.${th.key}`)} />
                </Field>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title={t("settings.scoring")} subtitle={t("settings.scoringSub")} />
            <div className="space-y-6">
              {CUTOFFS.map(({ lvl, label }) => (
                <Field key={lvl} label={t(label)} value={<span className="font-mono">≥ {draft.levels[lvl]}</span>}>
                  <Slider min={1} max={100} step={1} value={[draft.levels[lvl]]} onValueChange={([v]) => setDraft({ ...draft, levels: { ...draft.levels, [lvl]: v } })} aria-label={t(label)} />
                </Field>
              ))}
              {!levelsValid && <p className="text-13 text-fg">{t("settings.cutoffError")}</p>}
              <Field label={t("settings.kLabel")} hint={t("settings.kHint")} value={<span className="font-mono">× {draft.k_tier0.toFixed(2)}</span>}>
                <Slider min={1} max={1.5} step={0.05} value={[draft.k_tier0]} onValueChange={([v]) => setDraft({ ...draft, k_tier0: Math.round(v * 100) / 100 })} aria-label={t("settings.kLabel")} />
              </Field>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title={t("settings.heuristics")} subtitle={t("settings.heuristicsSub")} />
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
        </div>

        <div className="min-w-0 space-y-6">
          <Panel>
            <PanelHeader title={t("settings.ruleWeights")} subtitle={t("settings.ruleWeightsSub")} />
            <div className="space-y-6">
              {CATEGORIES.map((cat) => {
                const Icon = CATEGORY_ICON[cat];
                const rules = data.rules.filter((r) => r.category === cat);
                return (
                  <section key={cat}>
                    <h3 className="eyebrow flex items-center gap-2 border-b border-line pb-2">
                      <Icon className="size-3.5" aria-hidden /> {category(cat)}
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

          {!dirty && (
            <div className="flex justify-end">
              <Button variant="tertiary" size="text" onClick={() => reset.mutate()} disabled={reset.isPending}>
                <RotateCcw /> {t("settings.restoreDefaults")}
              </Button>
            </div>
          )}
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
            className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-[min(620px,calc(100%-2rem))] flex-wrap items-center justify-between gap-3 rounded-card bg-overlay px-4 py-3 shadow-overlay"
          >
            <span className="text-14 text-fg">{t("settings.unsaved")}</span>
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

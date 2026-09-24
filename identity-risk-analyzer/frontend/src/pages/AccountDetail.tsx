import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, Crown, Lock, Unlock } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { TooltipBox } from "@/components/charts/ChartCard";
import { CodeBlock } from "@/components/CodeBlock";
import { EvidenceList, MitreTags } from "@/components/FindingDetailSheet";
import { PrivilegePathGraph } from "@/components/PrivilegePathGraph";
import { RiskBadge } from "@/components/RiskBadge";
import { ErrorState, isNotFound } from "@/components/States";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WeightBreakdown } from "@/components/WeightBreakdown";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { CATEGORY_ICON, LEVEL_META, OBJECT_ICON, tint } from "@/lib/risk";
import type { Finding } from "@/lib/types";
import { cn } from "@/lib/utils";

const ACCENT = "hsl(var(--primary))";

function FindingAccordion({ f, defaultOpen }: { f: Finding; defaultOpen: boolean }) {
  const { t, category, fmtDateTime } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const CatIcon = CATEGORY_ICON[f.category];
  return (
    <div className={cn("rounded-2xl border transition", open ? "border-fg/[0.1] bg-fg/[0.025]" : "border-fg/[0.06] hover:border-fg/[0.12]")}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-fg/[0.05]">
          <CatIcon className="size-4 text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{f.title}</div>
          <div className="font-mono text-[11px] text-muted-foreground">
            {f.rule_id} · {t("account.weight", { w: f.rule_weight.toFixed(2) })} · {category(f.category)}
          </div>
        </div>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-4 px-4 pb-4">
              <p className="text-sm leading-relaxed text-foreground/85">{f.description}</p>
              <EvidenceList evidence={f.evidence} />
              <div className="rounded-xl border border-primary/20 bg-primary/[0.05] p-3">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{t("detail.recommendation")}</div>
                <p className="text-sm leading-relaxed">{f.recommendation}</p>
              </div>
              {f.remediation_command && <CodeBlock code={f.remediation_command} />}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <MitreTags ids={f.mitre} />
                <span className="text-[11px] text-muted-foreground">{t("account.firstSeen", { date: fmtDateTime(f.first_seen) })}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AccountDetail() {
  const { t, lang, objectType, fmtDate, fmtDateTime } = useI18n();
  const { objectId = "" } = useParams();
  const reduce = useReducedMotion();
  const { data, error, isLoading } = useQuery({
    queryKey: ["account", objectId, lang],
    queryFn: () => api.account(objectId),
    retry: (n, e) => !isNotFound(e) && n < 2,
  });

  if (isLoading)
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Skeleton className="h-40 lg:col-span-12" />
        <Skeleton className="h-80 lg:col-span-7" />
        <Skeleton className="h-80 lg:col-span-5" />
      </div>
    );
  if (error || !data)
    return (
      <ErrorState error={error ?? "not found"}>
        <Link to="/findings" className="text-sm text-primary hover:underline">
          {t("common.backToFindings")}
        </Link>
      </ErrorState>
    );

  const e = data.entity;
  const meta = LEVEL_META[e.level];
  const TypeIcon = OBJECT_ICON[e.object_type];
  const history = data.history.map((h) => ({ ...h, label: fmtDate(h.at) }));

  return (
    <div className="space-y-4">
      <Link to="/findings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground">
        <ArrowLeft className="size-4" /> {t("account.back")}
      </Link>

      {/* ---- header ---- */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="relative overflow-hidden p-6">
          <div className="absolute -right-24 -top-24 size-72 rounded-full blur-3xl" style={{ background: tint(meta.color, 15) }} />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl border border-fg/10 bg-fg/[0.04]">
                <TypeIcon className="size-7 text-foreground/80" />
              </span>
              <div className="min-w-0 space-y-1.5">
                <h1 className="truncate font-mono text-2xl font-semibold">{e.object_name}</h1>
                {e.display_name && e.display_name !== e.object_name && <div className="text-sm text-muted-foreground">{e.display_name}</div>}
                <div className="break-all font-mono text-[11.5px] text-muted-foreground/80">{e.object_dn}</div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="rounded-md border border-fg/10 px-2 py-0.5 text-[11px] text-muted-foreground">{objectType(e.object_type)}</span>
                  {e.tier0 && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-risk-critical/40 bg-risk-critical/10 px-2 py-0.5 text-[11px] text-risk-fg-critical">
                      <Crown className="size-3" /> {t("account.tier0", { k: e.k })}
                    </span>
                  )}
                  {!e.tier0 && e.privileged && <span className="rounded-md border border-risk-high/40 bg-risk-high/10 px-2 py-0.5 text-[11px] text-risk-fg-high">{t("account.privileged")}</span>}
                  {e.enabled !== null && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-fg/10 px-2 py-0.5 text-[11px] text-muted-foreground">
                      {e.enabled ? <Unlock className="size-3" /> : <Lock className="size-3" />} {t(e.enabled ? "account.enabled" : "account.disabled")}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-5 md:flex-col md:items-end md:gap-1">
              <div className="flex items-baseline gap-1">
                <AnimatedCounter value={e.score} className="text-6xl font-semibold leading-none tracking-tight" />
                <span className="text-sm text-muted-foreground">/100</span>
              </div>
              <div className="flex flex-col items-start gap-1 md:items-end">
                <RiskBadge level={e.level} />
                <span className="text-[11px] text-muted-foreground">{t("account.scoreCaption")}</span>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      {e.privilege_path && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
          <Card>
            <CardHeader
              title={t("account.pathTitle")}
              subtitle={t(e.path_edges?.includes("primaryGroupID") ? "account.pathHidden" : "account.pathSub")}
            />
            <div className="overflow-x-auto pb-1">
              <PrivilegePathGraph path={e.privilege_path} edges={e.path_edges} />
            </div>
          </Card>
        </motion.div>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="min-w-0 space-y-4 lg:col-span-7">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            <Card>
              <CardHeader title={t("account.why", { score: e.score })} subtitle={t("account.whySub")} />
              <WeightBreakdown items={e.weight_breakdown} k={e.k} score={e.score} accent={meta.color} />
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="space-y-2">
            <h2 className="px-1 text-sm font-semibold">
              {t("common.findings")} <span className="text-muted-foreground">({data.findings.length})</span>
            </h2>
            {data.findings.map((f, i) => (
              <FindingAccordion key={f.id} f={f} defaultOpen={i === 0} />
            ))}
          </motion.div>
        </div>

        <div className="min-w-0 space-y-4 lg:col-span-5">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card>
              <CardHeader title={t("account.facts")} subtitle={t("account.factsSub")} />
              <dl className="divide-y divide-fg/[0.05] text-[13px]">
                {Object.entries(e.attributes).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[130px_1fr] gap-3 py-2">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="min-w-0 break-words font-mono text-[12px] text-foreground/90">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </motion.div>

          {data.mitre.length > 0 && (
            <Card>
              <CardHeader title={t("account.mitreTitle")} />
              <MitreTags ids={data.mitre} />
            </Card>
          )}

          <Card>
            <CardHeader title={t("account.riskOverTime")} subtitle={t("account.riskOverTimeSub")} />
            {history.length < 2 ? (
              <p className="text-sm text-muted-foreground">{t("account.onlyOneScan")}</p>
            ) : (
              <>
                <div className="h-[110px]">
                  <ResponsiveContainer>
                    <LineChart data={history} margin={{ top: 10, right: 12, bottom: 4, left: 12 }}>
                      <YAxis domain={[0, 100]} hide />
                      <Tooltip
                        cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
                        content={({ active, payload }) =>
                          active && payload?.length ? (
                            <TooltipBox
                              title={fmtDateTime((payload[0].payload as { at: string }).at)}
                              rows={[{ key: ACCENT, label: t("detail.objectRisk"), value: payload[0].value as number }]}
                            />
                          ) : null
                        }
                      />
                      <Line type="monotone" dataKey="score" stroke={ACCENT} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "hsl(var(--card))", strokeWidth: 2 }} isAnimationActive={!reduce} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>{history[0].label}</span>
                  <span>
                    {t("account.now")} <b className="text-foreground">{history[history.length - 1].score}</b>
                  </span>
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

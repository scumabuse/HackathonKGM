import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { TrendSparkline } from "@/components/charts/TrendSparkline";
import { CodeBlock } from "@/components/CodeBlock";
import { EvidenceList, MitreTags } from "@/components/Evidence";
import { PrivilegePathGraph } from "@/components/PrivilegePathGraph";
import { RiskChip } from "@/components/RiskBadge";
import { ErrorState, isNotFound } from "@/components/States";
import { Tag } from "@/components/ui/badge";
import { Panel, PanelHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WeightBreakdown } from "@/components/WeightBreakdown";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { DUR, EASE, itemMotion, listMotion } from "@/lib/motion";
import { OBJECT_ICON } from "@/lib/risk";
import type { Finding } from "@/lib/types";
import { cn } from "@/lib/utils";

function FindingItem({ f, defaultOpen }: { f: Finding; defaultOpen: boolean }) {
  const { t, category, fmtDateTime } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-line last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors duration-fast hover:bg-fg/[0.02]"
      >
        <div className="min-w-0 flex-1">
          <div className="text-14 font-medium text-fg">{f.title}</div>
          <div className="mt-0.5 truncate text-12 text-fg-3">
            <span className="font-mono">{f.rule_id}</span> · {t("account.weight", { w: f.rule_weight.toFixed(2) })} · {category(f.category)}
          </div>
        </div>
        <ChevronDown className={cn("size-4 shrink-0 text-fg-3 transition-transform duration-fast", open && "rotate-180")} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: DUR.base, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="space-y-5 px-6 pb-6">
              <p className="max-w-[68ch] text-14 text-fg-2">{f.description}</p>
              <EvidenceList evidence={f.evidence} />
              <div>
                <h4 className="eyebrow mb-2">{t("detail.recommendation")}</h4>
                <p className="mb-3 max-w-[68ch] text-14 text-fg">{f.recommendation}</p>
                {f.remediation_command && <CodeBlock code={f.remediation_command} />}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <MitreTags ids={f.mitre} />
                <span className="text-12 text-fg-3">{t("account.firstSeen", { date: fmtDateTime(f.first_seen) })}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AccountDetail() {
  const { t, lang, objectType } = useI18n();
  const { objectId = "" } = useParams();
  const { data, error, isLoading } = useQuery({
    queryKey: ["account", objectId, lang],
    queryFn: () => api.account(objectId),
    retry: (n, e) => !isNotFound(e) && n < 2,
  });

  if (isLoading)
    return (
      <div className="mx-auto max-w-[880px] space-y-6" aria-busy>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-80 rounded-card" />
        <Skeleton className="h-40 rounded-card" />
      </div>
    );
  if (error || !data)
    return (
      <ErrorState error={error ?? "not found"}>
        <Link to="/findings" className="inline-flex items-center gap-1 text-13 text-fg-2 hover:text-fg">
          <ArrowLeft className="size-3.5" /> {t("common.backToFindings")}
        </Link>
      </ErrorState>
    );

  const e = data.entity;
  const TypeIcon = OBJECT_ICON[e.object_type];
  const pathText = e.privilege_path?.join(" → ");
  // the escalation path already has its own graph — don't state it twice in the facts
  const facts = Object.entries(e.attributes).filter(([, v]) => v !== pathText);

  return (
    <motion.div variants={listMotion} initial="hidden" animate="show" className="mx-auto max-w-[880px] space-y-6">
      <motion.div variants={itemMotion}>
        <Link to="/findings" className="inline-flex items-center gap-1.5 text-13 text-fg-2 transition-colors duration-fast hover:text-fg">
          <ArrowLeft className="size-3.5" /> {t("account.back")}
        </Link>
      </motion.div>

      {/* ---- header: who this is ---- */}
      <motion.header variants={itemMotion} className="space-y-3 pb-2">
        <div className="flex flex-wrap items-center gap-2 text-13 text-fg-3">
          <TypeIcon className="size-4" aria-hidden />
          <span>{objectType(e.object_type)}</span>
          {e.tier0 && <Tag className="font-mono">{t("account.tier0", { k: e.k })}</Tag>}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="break-all font-mono text-28 text-fg">{e.object_name}</h1>
            {e.display_name && e.display_name !== e.object_name && <div className="mt-0.5 text-14 text-fg-2">{e.display_name}</div>}
          </div>
          <RiskChip level={e.level} className="mt-1.5" />
        </div>
        <div className="break-all font-mono text-12 text-fg-3">{e.object_dn}</div>
      </motion.header>

      {/* ---- the star: why this score ---- */}
      <motion.div variants={itemMotion}>
        <Panel>
          <PanelHeader
            title={<span className="text-20">{t("account.why", { score: e.score })}</span>}
            subtitle={`${t("account.scoreCaption")} · ${t("account.whySub")}`}
          />
          <WeightBreakdown items={e.weight_breakdown} k={e.k} score={e.score} level={e.level} />
        </Panel>
      </motion.div>

      {e.privilege_path && (
        <motion.div variants={itemMotion}>
          <Panel>
            <PanelHeader title={t("account.pathTitle")} subtitle={t(e.path_edges?.includes("primaryGroupID") ? "account.pathHidden" : "account.pathSub")} />
            <div className="overflow-x-auto pb-1">
              <PrivilegePathGraph path={e.privilege_path} edges={e.path_edges} />
            </div>
          </Panel>
        </motion.div>
      )}

      <motion.div variants={itemMotion}>
        <Panel className="p-0">
          <div className="px-6 pt-6">
            <PanelHeader title={`${t("common.findings")} · ${data.findings.length}`} className="mb-2" />
          </div>
          {data.findings.map((f, i) => (
            <FindingItem key={f.id} f={f} defaultOpen={i === 0} />
          ))}
        </Panel>
      </motion.div>

      <motion.div variants={itemMotion}>
        <Panel>
          <PanelHeader title={t("account.facts")} subtitle={t("account.factsSub")} />
          <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            {facts.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[9rem_1fr] gap-3 border-b border-line py-2.5">
                <dt className="text-13 text-fg-3">{k}</dt>
                <dd className="min-w-0 break-words font-mono text-13 text-fg">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </motion.div>

      <motion.div variants={itemMotion}>
        <Panel>
          <PanelHeader title={t("account.riskOverTime")} subtitle={t("account.riskOverTimeSub")} />
          {data.history.length < 2 ? (
            <p className="text-13 text-fg-3">{t("account.onlyOneScan")}</p>
          ) : (
            <TrendSparkline points={data.history} label={t("common.objectRiskScore")} valueLabel={t("detail.objectRisk")} height={72} />
          )}
        </Panel>
      </motion.div>
    </motion.div>
  );
}

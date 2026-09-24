import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { CATEGORY_ICON, LEVEL_META, OBJECT_ICON, mitreUrl } from "@/lib/risk";
import type { Finding } from "@/lib/types";
import { CodeBlock } from "./CodeBlock";
import { PrivilegePathGraph } from "./PrivilegePathGraph";
import { RiskBadge } from "./RiskBadge";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./ui/sheet";
import { WeightBreakdown } from "./WeightBreakdown";

export function EvidenceList({ evidence }: { evidence: Finding["evidence"] }) {
  return (
    <dl className="divide-y divide-fg/[0.05] rounded-xl border border-fg/[0.07]">
      {evidence.map((e, i) => (
        <div key={i} className="grid grid-cols-1 gap-1 px-3 py-2 sm:grid-cols-[180px_1fr] sm:gap-3">
          <dt className="truncate font-mono text-[11.5px] text-primary/90" title={e.attribute}>
            {e.attribute}
          </dt>
          <dd className="min-w-0 break-words text-[13px] text-foreground/90" title={e.raw ? `raw: ${e.raw}` : undefined}>
            {e.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function MitreTags({ ids }: { ids: string[] }) {
  if (!ids.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {ids.map((id) => (
        <a
          key={id}
          href={mitreUrl(id)}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 font-mono text-[11px] text-violet-700 transition hover:border-violet-400/60 dark:text-violet-200"
        >
          ATT&CK {id} <ExternalLink className="size-3" />
        </a>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

/** Row click in the Findings table -> this side sheet (fetches the detail endpoint; row data shows instantly). */
export function FindingDetailSheet({ finding, onOpenChange }: { finding: Finding | null; onOpenChange: (open: boolean) => void }) {
  const { t, lang, category, fmtDateTime } = useI18n();
  const { data } = useQuery({
    queryKey: ["finding", finding?.id, lang],
    queryFn: () => api.finding(finding!.id),
    enabled: !!finding,
    initialData: finding ?? undefined,
  });
  const f = data ?? finding;
  const CatIcon = f ? CATEGORY_ICON[f.category] : null;
  const TypeIcon = f ? OBJECT_ICON[f.object_type] : null;

  return (
    <Sheet open={!!finding} onOpenChange={onOpenChange}>
      <SheetContent>
        {f && (
          <div className="space-y-6 p-6">
            <div className="space-y-3 pr-8">
              <div className="flex flex-wrap items-center gap-2">
                <RiskBadge level={f.level} />
                <span className="font-mono text-xs text-muted-foreground">{f.rule_id}</span>
                {CatIcon && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <CatIcon className="size-3.5" /> {category(f.category)}
                  </span>
                )}
              </div>
              <SheetTitle className="text-lg font-semibold leading-snug text-foreground">{f.title}</SheetTitle>
              <SheetDescription className="text-sm leading-relaxed text-muted-foreground">{f.description}</SheetDescription>
            </div>

            <Link
              to={`/accounts/${f.object_id}`}
              className="group flex items-center justify-between gap-3 rounded-xl border border-fg/10 bg-fg/[0.03] p-3 transition hover:border-primary/40"
            >
              <div className="flex min-w-0 items-center gap-3">
                {TypeIcon && <TypeIcon className="size-5 text-muted-foreground" />}
                <div className="min-w-0">
                  <div className="truncate font-mono text-sm text-foreground">{f.object_name}</div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">{f.object_dn}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-right">
                <div>
                  <div className="text-xl font-semibold leading-none">{f.score}</div>
                  <div className="text-[10px] text-muted-foreground">{t("detail.objectRisk")}</div>
                </div>
                <ArrowUpRight className="size-4 text-muted-foreground transition group-hover:text-primary" />
              </div>
            </Link>

            {f.privilege_path && (
              <Section title={t("detail.escalationPath")}>
                <PrivilegePathGraph path={f.privilege_path} edges={f.path_edges} compact />
              </Section>
            )}

            <Section title={t("detail.evidence")}>
              <EvidenceList evidence={f.evidence} />
            </Section>

            <Section title={t("detail.why", { score: f.score })}>
              <WeightBreakdown items={f.weight_breakdown} k={f.k} score={f.score} accent={LEVEL_META[f.level].color} />
            </Section>

            <Section title={t("detail.recommendation")}>
              <p className="text-sm leading-relaxed text-foreground/90">{f.recommendation}</p>
              {f.remediation_command && <CodeBlock code={f.remediation_command} />}
            </Section>

            {f.mitre.length > 0 && (
              <Section title={t("detail.mitre")}>
                <MitreTags ids={f.mitre} />
              </Section>
            )}
            <p className="text-[11px] text-muted-foreground">
              {t("detail.firstSeen", { date: fmtDateTime(f.first_seen) })} <span className="font-mono">{f.id}</span>
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

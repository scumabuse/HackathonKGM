import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { OBJECT_ICON } from "@/lib/risk";
import type { Finding } from "@/lib/types";
import { CodeBlock } from "./CodeBlock";
import { EvidenceList, MitreTags } from "./Evidence";
import { PrivilegePathGraph } from "./PrivilegePathGraph";
import { RiskChip } from "./RiskBadge";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./ui/sheet";
import { WeightBreakdown } from "./WeightBreakdown";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-5">
      <h3 className="eyebrow mb-3">{title}</h3>
      {children}
    </section>
  );
}

/** Row click in the Findings table → this sheet (fetches the detail endpoint; the row data shows instantly). */
export function FindingDetailSheet({ finding, onOpenChange }: { finding: Finding | null; onOpenChange: (open: boolean) => void }) {
  const { t, lang, category, objectType, fmtDateTime } = useI18n();
  const { data } = useQuery({
    queryKey: ["finding", finding?.id, lang],
    queryFn: () => api.finding(finding!.id),
    enabled: !!finding,
    initialData: finding ?? undefined,
  });
  const f = data ?? finding;
  const TypeIcon = f ? OBJECT_ICON[f.object_type] : null;

  return (
    <Sheet open={!!finding} onOpenChange={onOpenChange}>
      <SheetContent>
        {f && (
          <div className="space-y-6 p-6">
            <header className="space-y-3 pr-10">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-12 text-fg-3">
                <RiskChip level={f.level} />
                <span className="font-mono">{f.rule_id}</span>
                <span>{category(f.category)}</span>
              </div>
              <SheetTitle className="display text-28">{f.title}</SheetTitle>
              <SheetDescription className="text-14 text-fg-2">{f.description}</SheetDescription>
            </header>

            <Link
              to={`/accounts/${f.object_id}`}
              className="group flex items-center gap-3 rounded-control bg-fg/[0.04] p-3 transition-colors duration-fast hover:bg-fg/[0.07]"
            >
              {TypeIcon && <TypeIcon className="size-4 shrink-0 text-fg-3" aria-hidden />}
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-14 text-fg">{f.object_name}</div>
                <div className="truncate font-mono text-12 text-fg-3">{f.object_dn}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-20 text-fg">{f.score}</div>
                <div className="text-12 text-fg-3">{objectType(f.object_type)}</div>
              </div>
              <ArrowRight className="size-4 shrink-0 text-fg-3 transition-transform duration-fast group-hover:translate-x-0.5" aria-hidden />
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
              <WeightBreakdown items={f.weight_breakdown} k={f.k} score={f.score} level={f.level} />
            </Section>

            <Section title={t("detail.recommendation")}>
              <p className="mb-3 text-14 text-fg">{f.recommendation}</p>
              {f.remediation_command && <CodeBlock code={f.remediation_command} />}
            </Section>

            {f.mitre.length > 0 && (
              <Section title={t("detail.mitre")}>
                <MitreTags ids={f.mitre} />
              </Section>
            )}
            <p className="border-t border-line pt-4 text-12 text-fg-3">
              {t("detail.firstSeen", { date: fmtDateTime(f.first_seen) })} <span className="font-mono">{f.id}</span>
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "./api";
import { useI18n } from "./i18n";
import type { ScoringParams } from "./simulate";
import type { Finding } from "./types";

/** All findings of the latest scan + the scoring parameters — the inputs of the simulator and the path views. */
export function useScanModel() {
  const { lang } = useI18n();
  const findings = useQuery({ queryKey: ["findings", "all", lang], queryFn: () => api.findings({}), retry: false });
  const settings = useQuery({ queryKey: ["settings", lang], queryFn: api.settings });
  const rules = useQuery({ queryKey: ["rules", lang], queryFn: api.rules, staleTime: 300_000 });
  const params: ScoringParams | undefined = settings.data && {
    levels: settings.data.settings.levels,
    score_tau: settings.data.settings.score_tau,
  };
  const ruleName = useMemo(() => {
    const m = new Map((rules.data ?? []).map((r) => [r.id, r.name]));
    return (id: string) => m.get(id) ?? id;
  }, [rules.data]);
  return {
    findings: findings.data?.items,
    params,
    ruleName,
    isLoading: findings.isLoading || settings.isLoading,
    error: findings.error ?? settings.error,
  };
}

/** Findings that carry a real escalation path, riskiest first. */
export function pathFindings(findings: Finding[] | undefined): Finding[] {
  return (findings ?? [])
    .filter((f) => f.privilege_path && f.privilege_path.length > 1)
    .sort((a, b) => b.score - a.score || a.object_name.localeCompare(b.object_name));
}

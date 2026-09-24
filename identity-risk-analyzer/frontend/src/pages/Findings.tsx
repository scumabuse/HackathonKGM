import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { FindingDetailSheet } from "@/components/FindingDetailSheet";
import { ExportMenu } from "@/components/layout/Topbar";
import { RiskBadge, ScoreChip } from "@/components/RiskBadge";
import { ErrorState, NoScanYet, isNotFound } from "@/components/States";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { CATEGORIES, CATEGORY_ICON, LEVELS, LEVEL_META, OBJECT_ICON, OBJECT_TYPES } from "@/lib/risk";
import type { Finding, FindingFilters } from "@/lib/types";
import { cn } from "@/lib/utils";

const SORTS = ["score", "weight", "level", "object", "category", "rule", "first_seen"] as const;

function toggleIn(list: string[], v: string) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function Chip({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
        active ? "border-primary/50 bg-primary/10 text-foreground" : "border-fg/10 text-muted-foreground hover:border-fg/20 hover:text-foreground",
      )}
    >
      {color && <span className="size-2 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}

export default function Findings() {
  const { t, tp, lang, level: levelName, category: categoryName, objectType: objectTypeName } = useI18n();
  const [params, setParams] = useSearchParams();
  const levels = params.get("level")?.split(",").filter(Boolean) ?? [];
  const cats = params.get("category")?.split(",").filter(Boolean) ?? [];
  const objectType = params.get("object_type") ?? "";
  const ruleId = params.get("rule_id") ?? "";
  const sort = params.get("sort") ?? "score";
  const order = (params.get("order") as "asc" | "desc") ?? "desc";
  const [q, setQ] = useState(params.get("q") ?? "");
  const [selected, setSelected] = useState<Finding | null>(null);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    setParams(next, { replace: true });
  };

  // debounce the search box into the URL
  useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) update({ q: q || null });
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const filters: FindingFilters = useMemo(
    () => ({
      level: levels.join(",") || undefined,
      category: cats.join(",") || undefined,
      object_type: objectType || undefined,
      rule_id: ruleId || undefined,
      q: params.get("q") || undefined,
      sort,
      order,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params],
  );

  const { data, error, isLoading, isFetching } = useQuery({
    queryKey: ["findings", filters, lang],
    queryFn: () => api.findings(filters),
    placeholderData: keepPreviousData,
    retry: (n, e) => !isNotFound(e) && n < 2,
  });

  const anyFilter = levels.length || cats.length || objectType || ruleId || params.get("q");

  const onRowKey = (e: KeyboardEvent<HTMLTableRowElement>, i: number, f: Finding) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelected(f);
    } else if (e.key === "ArrowDown" || e.key === "j") {
      e.preventDefault();
      rowRefs.current[i + 1]?.focus();
    } else if (e.key === "ArrowUp" || e.key === "k") {
      e.preventDefault();
      rowRefs.current[i - 1]?.focus();
    }
  };

  if (error && isNotFound(error)) return <NoScanYet what="findings" />;
  if (error) return <ErrorState error={error} />;

  return (
    <div className="space-y-4">
      {/* ---- one filter row above everything it scopes ---- */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("findings.search")} className="pl-9" aria-label={t("findings.searchLabel")} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={objectType}
              onChange={(e) => update({ object_type: e.target.value || null })}
              className="h-10 rounded-xl border border-input bg-fg/[0.03] px-3 text-sm text-foreground"
              aria-label={t("findings.objectType")}
            >
              <option value="">{t("findings.allTypes")}</option>
              {OBJECT_TYPES.map((o) => (
                <option key={o} value={o}>
                  {objectTypeName(o)}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => update({ sort: e.target.value })}
              className="h-10 rounded-xl border border-input bg-fg/[0.03] px-3 text-sm text-foreground"
              aria-label={t("findings.sortBy")}
            >
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {t("findings.sortPrefix", { name: t(`findings.sort.${s}`) })}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => update({ order: order === "desc" ? "asc" : "desc" })}
              className="grid size-10 place-items-center rounded-xl border border-fg/10 text-muted-foreground transition hover:text-foreground"
              aria-label={t(order === "desc" ? "findings.orderDesc" : "findings.orderAsc")}
            >
              {order === "desc" ? <ArrowDown className="size-4" /> : <ArrowUp className="size-4" />}
            </button>
            <ExportMenu scanId={data?.scan_id} filters={anyFilter ? filters : undefined} label={t(anyFilter ? "common.exportFilter" : "common.export")} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {LEVELS.map((l) => (
            <Chip key={l} active={levels.includes(l)} onClick={() => update({ level: toggleIn(levels, l).join(",") || null })} color={LEVEL_META[l].color}>
              {levelName(l)}
            </Chip>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-fg/10 sm:block" />
          {CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICON[c];
            return (
              <Chip key={c} active={cats.includes(c)} onClick={() => update({ category: toggleIn(cats, c).join(",") || null })}>
                <Icon className="size-3.5" /> {categoryName(c)}
              </Chip>
            );
          })}
          {ruleId && (
            <span className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2 py-1 font-mono text-[11px] text-primary">
              {t("findings.rule", { id: ruleId })}
              <button type="button" onClick={() => update({ rule_id: null })} aria-label={t("findings.clearRule")}>
                <X className="size-3" />
              </button>
            </span>
          )}
          {anyFilter ? (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setParams(new URLSearchParams({ sort, order }), { replace: true });
              }}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            >
              {t("findings.clearFilters")}
            </button>
          ) : null}
          <span className="ml-auto text-xs text-muted-foreground sm:ml-2">
            {data ? tp("findings.count", data.total) : "…"}
          </span>
        </div>
      </Card>

      {/* ---- dense table (md+) ---- */}
      <Card className={cn("overflow-hidden p-0 transition-opacity", isFetching && !isLoading && "opacity-70")}>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : data && data.items.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">{t("findings.noMatch")}</div>
        ) : (
          <>
            <div className="hidden max-h-[calc(100vh-290px)] overflow-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-popover text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-fg/10">
                    <th className="px-4 py-3 font-medium">{t("findings.th.level")}</th>
                    <th className="px-2 py-3 font-medium">{t("findings.th.risk")}</th>
                    <th className="px-2 py-3 font-medium">{t("findings.th.finding")}</th>
                    <th className="px-2 py-3 font-medium">{t("findings.th.object")}</th>
                    <th className="px-2 py-3 font-medium">{t("findings.th.category")}</th>
                    <th className="px-2 py-3 font-medium">{t("findings.th.weight")}</th>
                    <th className="px-4 py-3 font-medium">{t("findings.th.mitre")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.items.map((f, i) => {
                    const TypeIcon = OBJECT_ICON[f.object_type];
                    const CatIcon = CATEGORY_ICON[f.category];
                    return (
                      <motion.tr
                        key={f.id}
                        ref={(el) => {
                          rowRefs.current[i] = el;
                        }}
                        tabIndex={0}
                        onClick={() => setSelected(f)}
                        onKeyDown={(e) => onRowKey(e, i, f)}
                        initial={i < 30 ? { opacity: 0, y: 6 } : false}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i, 30) * 0.018 }}
                        className="cursor-pointer border-b border-fg/[0.04] outline-none transition hover:bg-fg/[0.03] focus-visible:bg-primary/[0.06]"
                      >
                        <td className="px-4 py-2.5">
                          <RiskBadge level={f.level} />
                        </td>
                        <td className="px-2 py-2.5">
                          <ScoreChip score={f.score} level={f.level} />
                        </td>
                        <td className="max-w-[420px] px-2 py-2.5">
                          <div className="truncate font-medium text-foreground">{f.title}</div>
                          <div className="font-mono text-[11px] text-muted-foreground">{f.rule_id}</div>
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-2">
                            <TypeIcon className="size-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <div className="max-w-[220px] truncate font-mono text-[13px]">{f.object_name}</div>
                              <div className="text-[11px] text-muted-foreground">{objectTypeName(f.object_type)}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2.5">
                          <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                            <CatIcon className="size-3.5" /> {categoryName(f.category)}
                          </span>
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-fg/[0.06]">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${f.rule_weight * 100}%` }} />
                            </div>
                            <span className="font-mono text-[11px] text-muted-foreground num">{f.rule_weight.toFixed(2)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-violet-700/80 dark:text-violet-200/80">{f.mitre.join(", ") || "—"}</td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* ---- cards (phones) ---- */}
            <ul className="divide-y divide-fg/[0.05] md:hidden">
              {data?.items.map((f) => (
                <li key={f.id}>
                  <button type="button" onClick={() => setSelected(f)} className="w-full px-4 py-3 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <RiskBadge level={f.level} />
                      <ScoreChip score={f.score} level={f.level} />
                    </div>
                    <div className="mt-1.5 text-sm font-medium">{f.title}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {f.object_name} · {f.rule_id}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <p className="px-1 text-[11px] text-muted-foreground">
        {t("findings.tip")}
      </p>
      <FindingDetailSheet finding={selected} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}

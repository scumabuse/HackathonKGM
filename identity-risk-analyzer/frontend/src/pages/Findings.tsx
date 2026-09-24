import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronDown, Search, SearchX, X } from "lucide-react";
import { motion } from "motion/react";
import { forwardRef, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ExportMenu } from "@/components/ExportMenu";
import { FindingDetailSheet } from "@/components/FindingDetailSheet";
import { MonoDigits } from "@/components/MonoDigits";
import { RiskChip, ScoreCell } from "@/components/RiskBadge";
import { ErrorState, NoScanYet, StateBlock, isNotFound } from "@/components/States";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Panel } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useI18n, type TKey } from "@/lib/i18n";
import { DUR, EASE } from "@/lib/motion";
import { CATEGORIES, CATEGORY_ICON, LEVELS, LEVEL_META, OBJECT_ICON, OBJECT_TYPES } from "@/lib/risk";
import type { Finding, FindingFilters } from "@/lib/types";
import { cn } from "@/lib/utils";

const SORTS = ["score", "weight", "level", "object", "category", "rule", "first_seen"] as const;
type SortKey = (typeof SORTS)[number];

// Table columns; `sort` makes the header a sort control (every API sort is reachable from a header).
const COLUMNS: { key: string; label: TKey; sort: SortKey; className: string }[] = [
  { key: "level", label: "findings.th.level", sort: "level", className: "w-[9.5rem] pl-5" },
  { key: "risk", label: "findings.th.risk", sort: "score", className: "w-24" },
  { key: "finding", label: "findings.th.finding", sort: "rule", className: "" },
  { key: "object", label: "findings.th.object", sort: "object", className: "w-[13rem]" },
  { key: "category", label: "findings.th.category", sort: "category", className: "hidden w-[9.5rem] xl:table-cell" },
  { key: "weight", label: "findings.th.weight", sort: "weight", className: "hidden w-28 lg:table-cell" },
  { key: "first", label: "findings.th.firstSeen", sort: "first_seen", className: "hidden w-28 pr-5 2xl:table-cell" },
];

function toggleIn(list: string[], v: string) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/** Dropdown trigger for a filter — forwards ref/props so Radix can attach to it. */
const FilterButton = forwardRef<HTMLButtonElement, ButtonProps & { active?: boolean }>(({ children, active, className, ...p }, ref) => (
  <Button ref={ref} variant="secondary" size="sm" className={cn("h-9 gap-1.5 text-13", active && "bg-fg/[0.06]", className)} {...p}>
    {children}
    <ChevronDown className="!size-3.5 text-fg-3" />
  </Button>
));
FilterButton.displayName = "FilterButton";

export default function Findings() {
  const { t, tp, lang, level: levelName, category: categoryName, objectType: objectTypeName, fmtDate, fmtDateTime } = useI18n();
  const [params, setParams] = useSearchParams();
  const levels = params.get("level")?.split(",").filter(Boolean) ?? [];
  const cats = params.get("category")?.split(",").filter(Boolean) ?? [];
  const objectType = params.get("object_type") ?? "";
  const ruleId = params.get("rule_id") ?? "";
  const sort = (params.get("sort") as SortKey) ?? "score";
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

  const anyFilter = !!(levels.length || cats.length || objectType || ruleId || params.get("q"));
  const clearFilters = () => {
    setQ("");
    setParams(new URLSearchParams({ sort, order }), { replace: true });
  };
  const sortBy = (key: SortKey) => update(key === sort ? { order: order === "desc" ? "asc" : "desc" } : { sort: key, order: "desc" });

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-28" aria-live="polite">
          {data ? <MonoDigits text={tp("findings.count", data.total)} /> : "…"}
        </h1>
        <div className="flex items-center gap-2">
          {/* headers sort on wide screens; this menu keeps every sort reachable where columns are hidden */}
          <div className="2xl:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <FilterButton>
                  {order === "desc" ? <ArrowDown className="!size-3.5 text-fg-3" /> : <ArrowUp className="!size-3.5 text-fg-3" />}
                  {t("findings.sortPrefix", { name: t(`findings.sort.${sort}`) })}
                </FilterButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup value={sort} onValueChange={(v) => update({ sort: v })}>
                  {SORTS.map((k) => (
                    <DropdownMenuRadioItem key={k} value={k}>
                      {t(`findings.sort.${k}`)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={order} onValueChange={(v) => update({ order: v })}>
                  <DropdownMenuRadioItem value="desc">{t("findings.orderDesc")}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="asc">{t("findings.orderAsc")}</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <ExportMenu scanId={data?.scan_id} filters={anyFilter ? filters : undefined} />
        </div>
      </div>

      {/* ---- one filter row above everything it scopes ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("findings.search")} className="pl-9" aria-label={t("findings.searchLabel")} />
        </div>

        <div className="flex h-9 items-center rounded-control bg-fg/[0.05] p-0.5" role="group" aria-label={t("findings.th.level")}>
          {LEVELS.map((l) => {
            const on = levels.includes(l);
            const Icon = LEVEL_META[l].icon;
            return (
              <button
                key={l}
                type="button"
                aria-pressed={on}
                title={levelName(l)}
                onClick={() => update({ level: toggleIn(levels, l).join(",") || null })}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-inner px-2.5 text-13 transition-colors duration-fast",
                  on ? "bg-raised text-fg shadow-panel" : "text-fg-3 hover:text-fg",
                )}
              >
                <Icon className="size-3.5" style={{ color: LEVEL_META[l].color }} aria-hidden />
                {/* phones: shape-coded icons only (the label stays for screen readers and in the tooltip) */}
                <span className="sr-only sm:not-sr-only">{levelName(l)}</span>
              </button>
            );
          })}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <FilterButton active={cats.length > 0}>
              {t("findings.categories")}
              {cats.length > 0 && <span className="font-mono text-12 text-fg-2">{cats.length}</span>}
            </FilterButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {CATEGORIES.map((c) => {
              const Icon = CATEGORY_ICON[c];
              return (
                <DropdownMenuCheckboxItem key={c} checked={cats.includes(c)} onCheckedChange={() => update({ category: toggleIn(cats, c).join(",") || null })}>
                  <Icon /> {categoryName(c)}
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <FilterButton active={!!objectType}>{objectType ? objectTypeName(objectType as (typeof OBJECT_TYPES)[number]) : t("findings.allTypes")}</FilterButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup value={objectType} onValueChange={(v) => update({ object_type: v || null })}>
              <DropdownMenuRadioItem value="">{t("findings.allTypes")}</DropdownMenuRadioItem>
              {OBJECT_TYPES.map((o) => {
                const Icon = OBJECT_ICON[o];
                return (
                  <DropdownMenuRadioItem key={o} value={o}>
                    <Icon /> {objectTypeName(o)}
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {ruleId && (
          <span className="inline-flex h-9 items-center gap-1.5 rounded-control bg-fg/[0.06] pl-3 pr-1.5 font-mono text-12 text-fg">
            {ruleId}
            <button
              type="button"
              onClick={() => update({ rule_id: null })}
              aria-label={t("findings.clearRule")}
              className="grid size-6 place-items-center rounded-inner text-fg-3 hover:bg-fg/[0.08] hover:text-fg"
            >
              <X className="size-3.5" />
            </button>
          </span>
        )}
        {anyFilter && (
          <Button variant="tertiary" size="text" onClick={clearFilters} className="px-1">
            {t("findings.clearFilters")}
          </Button>
        )}

      </div>

      {/* ---- the table ---- */}
      <Panel className={cn("overflow-hidden p-0 transition-opacity duration-base", isFetching && !isLoading && "opacity-70")}>
        {isLoading ? (
          <div className="divide-y divide-line" aria-busy>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-4 w-8" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        ) : data && data.items.length === 0 ? (
          <StateBlock icon={SearchX} title={t("findings.noMatch")} text={t("findings.emptyHint")}>
            <Button variant="tertiary" size="text" onClick={clearFilters}>
              {t("findings.clearFilters")}
            </Button>
          </StateBlock>
        ) : (
          <>
            <div className="hidden max-h-[calc(100vh-15rem)] overflow-auto md:block">
              <table className="w-full table-fixed text-left text-13">
                <thead className="sticky top-0 z-10 bg-raised">
                  <tr className="border-b border-line">
                    {COLUMNS.map((c) => {
                      const active = sort === c.sort;
                      return (
                        <th
                          key={c.key}
                          className={cn("py-2.5 pr-3 font-medium", c.className)}
                          aria-sort={active ? (order === "desc" ? "descending" : "ascending") : "none"}
                        >
                          <button
                            type="button"
                            onClick={() => sortBy(c.sort)}
                            aria-label={t("findings.sortAria", { name: t(c.label) })}
                            className={cn("eyebrow inline-flex items-center gap-1 transition-colors duration-fast hover:text-fg", active && "text-fg")}
                          >
                            {t(c.label)}
                            {active && (order === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                          </button>
                        </th>
                      );
                    })}
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
                        initial={i < 14 ? { opacity: 0 } : false}
                        animate={{ opacity: 1 }}
                        transition={{ duration: DUR.base, ease: EASE, delay: Math.min(i, 14) * 0.025 }}
                        className="cursor-pointer border-b border-line outline-none transition-colors duration-fast last:border-0 hover:bg-fg/[0.03] focus-visible:bg-fg/[0.05]"
                      >
                        <td className="py-3 pl-5 pr-3 align-top">
                          <RiskChip level={f.level} />
                        </td>
                        <td className="py-3 pr-3 align-top">
                          <ScoreCell score={f.score} level={f.level} className="mt-0.5" />
                        </td>
                        <td className="py-3 pr-3 align-top">
                          <div className="truncate text-14 text-fg">{f.title}</div>
                          <div className="truncate font-mono text-12 text-fg-3">
                            {f.rule_id}
                            {f.mitre.length > 0 && ` · ${f.mitre.join(", ")}`}
                          </div>
                        </td>
                        <td className="py-3 pr-3 align-top">
                          <div className="flex min-w-0 items-start gap-2">
                            <TypeIcon className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden />
                            <div className="min-w-0">
                              <div className="truncate font-mono text-fg">{f.object_name}</div>
                              <div className="truncate text-12 text-fg-3">{objectTypeName(f.object_type)}</div>
                            </div>
                          </div>
                        </td>
                        <td className="hidden py-3 pr-3 align-top xl:table-cell">
                          <span className="inline-flex items-center gap-1.5 text-fg-2">
                            <CatIcon className="size-3.5 text-fg-3" aria-hidden /> {categoryName(f.category)}
                          </span>
                        </td>
                        <td className="hidden py-3 pr-3 align-top lg:table-cell">
                          <div className="mt-1 flex items-center gap-2">
                            <span className="h-1 w-12 overflow-hidden rounded-full bg-fg/[0.08]">
                              <span className="block h-full rounded-full bg-fg-3" style={{ width: `${f.rule_weight * 100}%` }} />
                            </span>
                            <span className="font-mono text-12 text-fg-2">{f.rule_weight.toFixed(2)}</span>
                          </div>
                        </td>
                        <td className="hidden py-3 pr-5 align-top font-mono text-12 text-fg-3 2xl:table-cell" title={fmtDateTime(f.first_seen)}>
                          <span className="mt-1 block">{fmtDate(f.first_seen)}</span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* ---- phones: the same rows as a list ---- */}
            <ul className="divide-y divide-line md:hidden">
              {data?.items.map((f) => (
                <li key={f.id}>
                  <button type="button" onClick={() => setSelected(f)} className="w-full px-4 py-3 text-left transition-colors duration-fast active:bg-fg/[0.04]">
                    <div className="flex items-center justify-between gap-2">
                      <RiskChip level={f.level} />
                      <ScoreCell score={f.score} level={f.level} />
                    </div>
                    <div className="mt-2 text-14 text-fg">{f.title}</div>
                    <div className="mt-0.5 truncate font-mono text-12 text-fg-3">
                      {f.object_name} · {f.rule_id}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
      <p className="px-1 text-12 text-fg-3">{t("findings.tip")}</p>
      <FindingDetailSheet finding={selected} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}

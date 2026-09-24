import { BarChart3, Table2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Every chart has a table-view twin (dataviz a11y rule) — toggled in the card header. */
export function ChartCard({
  title,
  subtitle,
  chart,
  table,
  className,
  extra,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  chart: ReactNode;
  table: ReactNode;
  className?: string;
  extra?: ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const { t } = useI18n();
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        title={title}
        subtitle={subtitle}
        right={
          <div className="flex items-center gap-2">
            {extra}
            <div className="flex rounded-lg border border-fg/10 p-0.5" role="group" aria-label={t("charts.view")}>
              {(["chart", "table"] as const).map((v) => {
                const Icon = v === "chart" ? BarChart3 : Table2;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    aria-pressed={view === v}
                    aria-label={t(v === "chart" ? "charts.chartView" : "charts.tableView")}
                    className={cn(
                      "rounded-md p-1 transition",
                      view === v ? "bg-fg/10 text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3.5" />
                  </button>
                );
              })}
            </div>
          </div>
        }
      />
      <div className="min-h-0 flex-1">{view === "chart" ? chart : <div className="max-h-[260px] overflow-auto">{table}</div>}</div>
    </Card>
  );
}

export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-left text-[13px]">
      <thead>
        <tr className="border-b border-fg/10 text-[11px] uppercase tracking-wider text-muted-foreground">
          {head.map((h, i) => (
            <th key={h} className={cn("py-1.5 font-medium", i > 0 && "text-right")}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-fg/[0.04]">
            {r.map((c, j) => (
              <td key={j} className={cn("py-1.5", j > 0 && "num text-right font-mono")}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Recharts tooltip body: value leads (strong), label follows; series keyed by a short line. */
export function TooltipBox({ title, rows }: { title: string; rows: { key?: string; label: string; value: ReactNode }[] }) {
  return (
    <div className="min-w-40 rounded-lg border border-fg/10 bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <div className="mb-1 text-muted-foreground">{title}</div>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-0.5">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            {r.key && <span className="h-0.5 w-3 rounded-full" style={{ background: r.key }} />}
            {r.label}
          </span>
          <span className="font-semibold text-foreground num">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

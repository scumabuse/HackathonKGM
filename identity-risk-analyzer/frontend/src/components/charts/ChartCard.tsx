import { BarChart3, Table2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Panel, PanelHeader } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Every chart has a table-view twin (dataviz a11y rule), toggled quietly in the panel header. */
export function ChartCard({
  title,
  subtitle,
  chart,
  table,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  chart: ReactNode;
  table: ReactNode;
  className?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const { t } = useI18n();
  return (
    <Panel className={cn("flex h-full flex-col", className)}>
      <PanelHeader
        title={title}
        subtitle={subtitle}
        right={
          <div className="flex gap-0.5" role="group" aria-label={t("charts.view")}>
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
                    "grid size-7 place-items-center rounded-control transition-colors duration-fast",
                    view === v ? "bg-fg/[0.08] text-fg" : "text-fg-3 hover:text-fg",
                  )}
                >
                  <Icon className="size-3.5" />
                </button>
              );
            })}
          </div>
        }
      />
      <div className="min-h-0 flex-1">{view === "chart" ? chart : <div className="max-h-[280px] overflow-auto">{table}</div>}</div>
    </Panel>
  );
}

export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-left text-13">
      <thead>
        <tr className="border-b border-line">
          {head.map((h, i) => (
            <th key={h} className={cn("eyebrow py-2 font-medium", i > 0 && "text-right")}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-line last:border-0">
            {r.map((c, j) => (
              <td key={j} className={cn("py-2 text-fg-2", j > 0 && "text-right font-mono text-fg")}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Chart tooltip: label muted, value in mono ink; a series is keyed by a short swatch, never by colored text. */
export function TooltipBox({ title, rows }: { title: string; rows: { key?: string; label: string; value: ReactNode }[] }) {
  return (
    <div className="min-w-44 rounded-control bg-overlay px-3 py-2 text-12 shadow-overlay">
      <div className="mb-1 text-fg-3">{title}</div>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-0.5">
          <span className="inline-flex items-center gap-1.5 text-fg-2">
            {r.key && <span className="size-2 rounded-full" style={{ background: r.key }} />}
            {r.label}
          </span>
          <span className="font-mono text-fg">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

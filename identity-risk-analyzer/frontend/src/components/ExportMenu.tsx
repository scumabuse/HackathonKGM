import { Download, FileJson, FileSpreadsheet, FileText, Sheet as SheetIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, download } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { FindingFilters } from "@/lib/types";

/** Export is always a secondary action. With `filters` it exports the current Findings slice. */
export function ExportMenu({ scanId, filters }: { scanId?: string; filters?: FindingFilters }) {
  const { t } = useI18n();
  const id = scanId ?? "latest";
  const go = (fmt: "csv" | "xlsx" | "html") => {
    download(api.exportUrl(id, fmt, filters));
    toast.success(t("exportMenu.started", { format: fmt.toUpperCase() }), {
      description: t(filters ? "exportMenu.filterApplied" : "exportMenu.allFindings"),
    });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" disabled={!scanId} aria-label={t(filters ? "common.exportFilter" : "common.export")}>
          <Download />
          <span className="hidden sm:inline">{t(filters ? "common.exportFilter" : "common.export")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-60">
        <DropdownMenuLabel>{t(filters ? "exportMenu.exportFilter" : "exportMenu.exportScan")}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => go("html")}>
          <FileText /> {t("exportMenu.html")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => go("xlsx")}>
          <FileSpreadsheet /> {t("exportMenu.xlsx")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => go("csv")}>
          <SheetIcon /> {t("exportMenu.csv")}
        </DropdownMenuItem>
        {!filters && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                download(api.snapshotUrl(id));
                toast.success(t("exportMenu.snapshotStarted"), { description: t("exportMenu.snapshotHint") });
              }}
            >
              <FileJson /> {t("exportMenu.snapshot")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

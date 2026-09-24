import { useQuery } from "@tanstack/react-query";
import { Download, FileJson, FileSpreadsheet, FileText, Menu, Play, Sheet as SheetIcon } from "lucide-react";
import { useState } from "react";
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
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tip } from "@/components/ui/tooltip";
import { api, download } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useScan } from "@/lib/scan";
import { cn, sourceKind } from "@/lib/utils";
import { LangSwitcher, ThemeToggle } from "./Preferences";
import { Brand, ModuleList, NavList, PostureBadge } from "./Sidebar";

export function SourceBadge({ source }: { source?: string }) {
  const { t } = useI18n();
  const kind = sourceKind(source);
  const styles = {
    mock: "border-violet-400/30 bg-violet-400/10 text-violet-700 dark:text-violet-200",
    live: "border-risk-low/40 bg-risk-low/10 text-risk-fg-low",
    snapshot: "border-sky-400/30 bg-sky-400/10 text-sky-700 dark:text-sky-200",
  }[kind];
  return (
    <Tip content={source ?? t("source.none")}>
      <span className={cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10.5px] font-semibold tracking-wider", styles)}>
        <span className={cn("size-1.5 rounded-full", kind === "live" ? "bg-risk-low" : kind === "mock" ? "bg-violet-400" : "bg-sky-400")} />
        {t(`source.${kind}`)}
      </span>
    </Tip>
  );
}

function SourceToggle() {
  const { t } = useI18n();
  const { source, setSource, running } = useScan();
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health, staleTime: 60_000 });
  const liveReady = !!health?.config.ldap_configured;
  return (
    <div className="flex rounded-xl border border-fg/10 bg-fg/[0.03] p-0.5 text-xs" role="radiogroup" aria-label={t("topbar.collector")}>
      {(["mock", "ldap"] as const).map((s) => {
        const disabled = s === "ldap" && !liveReady;
        const btn = (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={source === s}
            disabled={running || disabled}
            onClick={() => setSource(s)}
            className={cn(
              "rounded-lg px-2.5 py-1.5 font-medium transition disabled:cursor-not-allowed",
              source === s ? "bg-fg/10 text-foreground" : "text-muted-foreground hover:text-foreground",
              disabled && "opacity-40",
            )}
          >
            {t(s === "mock" ? "common.mock" : "common.liveLdap")}
          </button>
        );
        return disabled ? (
          <Tip key={s} content={t("topbar.liveNeedsConfig")}>
            <span>{btn}</span>
          </Tip>
        ) : (
          btn
        );
      })}
    </div>
  );
}

export function ExportMenu({ scanId, filters, label }: { scanId?: string; filters?: Parameters<typeof api.exportUrl>[2]; label?: string }) {
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
        <Button variant="secondary" size="default" disabled={!scanId}>
          <Download /> <span className="hidden sm:inline">{label ?? t("common.export")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
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

export function Topbar({ title }: { title: string }) {
  const { t, lang, timeAgo } = useI18n();
  const { runScan, running } = useScan();
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: dash } = useQuery({ queryKey: ["dashboard", "latest", lang], queryFn: () => api.dashboard(), retry: false });

  return (
    <header className="sticky top-0 z-30 border-b border-fg/[0.06] bg-background/70 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <button type="button" className="rounded-lg p-2 text-muted-foreground hover:bg-fg/10 lg:hidden" onClick={() => setMenuOpen(true)} aria-label={t("nav.openMenu")}>
          <Menu className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{title}</div>
          {dash && (
            <div className="hidden items-center gap-2 truncate text-[11px] text-muted-foreground sm:flex">
              <span className="font-mono text-foreground/80">{dash.scan.domain}</span>
              <span>·</span>
              <span>{t("topbar.lastScan", { time: timeAgo(dash.scan.started_at) })}</span>
              <SourceBadge source={dash.scan.source} />
            </div>
          )}
        </div>
        <div className="hidden md:block">
          <SourceToggle />
        </div>
        <div className="flex items-center">
          <LangSwitcher />
          <ThemeToggle />
        </div>
        <ExportMenu scanId={dash?.scan.scan_id} />
        <Button onClick={() => runScan()} disabled={running} className="px-3 sm:px-4">
          <Play className={cn(running && "animate-pulse")} /> <span className="hidden sm:inline">{t("common.runScan")}</span>
        </Button>
      </div>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="gap-6 p-5">
          <SheetTitle className="sr-only">{t("nav.navigation")}</SheetTitle>
          <Brand />
          <NavList onNavigate={() => setMenuOpen(false)} />
          <div className="md:hidden">
            <div className="mb-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">{t("topbar.collector")}</div>
            <SourceToggle />
          </div>
          <ModuleList />
          <div className="mt-auto">
            <PostureBadge />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}

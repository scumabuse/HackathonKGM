import { useQuery } from "@tanstack/react-query";
import { Menu, Play, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { ExportMenu } from "@/components/ExportMenu";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tip } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useScan } from "@/lib/scan";
import { cn, sourceKind } from "@/lib/utils";
import { LangSwitcher, ThemeToggle } from "./Preferences";
import { Brand, ModuleList, NavList } from "./Sidebar";

/** What the top bar shows on the current route — the page decides which action is THE primary one. */
export interface Chrome {
  run: "primary" | "secondary" | "hidden";
  export: boolean;
}

function SourceToggle() {
  const { t } = useI18n();
  const { source, setSource, running } = useScan();
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health, staleTime: 60_000 });
  const liveReady = !!health?.config.ldap_configured;
  return (
    <div className="flex h-9 items-center rounded-control bg-fg/[0.05] p-0.5 text-13" role="radiogroup" aria-label={t("topbar.collector")}>
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
              "h-8 rounded-inner px-3 transition-colors duration-fast disabled:cursor-not-allowed",
              source === s ? "bg-raised text-fg shadow-panel" : "text-fg-3 hover:text-fg",
              disabled && "opacity-50",
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

/** The ONE place the tool's safety posture is stated (details in the tooltip). */
function ReadOnlyNote() {
  const { t } = useI18n();
  const { data } = useQuery({ queryKey: ["health"], queryFn: api.health, staleTime: 60_000 });
  return (
    <Tip
      side="bottom"
      content={
        <div className="space-y-1">
          <div className="font-medium text-fg">{t("posture.tipTitle")}</div>
          <div>{t("settings.posture1")}</div>
          <div>{t("settings.posture2")}</div>
          <div>{t("settings.posture3")}</div>
          {data?.config.ldap_bind_user && (
            <div className="font-mono">
              {t("posture.bind")}: {data.config.ldap_bind_user}
            </div>
          )}
        </div>
      }
    >
      <span className="inline-flex cursor-help items-center gap-1 whitespace-nowrap">
        <ShieldCheck className="size-3.5" aria-hidden /> {t("topbar.readOnly")}
      </span>
    </Tip>
  );
}

/** Domain · last scan · source · read-only — stated once, quietly. */
function ScanMeta() {
  const { t, lang, timeAgo, fmtDateTime } = useI18n();
  const { data: dash } = useQuery({ queryKey: ["dashboard", "latest", lang], queryFn: () => api.dashboard(), retry: false });
  const sep = (
    <span className="text-fg-3/60" aria-hidden>
      ·
    </span>
  );
  return (
    <div className="flex min-w-0 items-center gap-2 overflow-hidden text-13 text-fg-3">
      {dash ? (
        <>
          <span className="truncate font-mono text-fg">{dash.scan.domain}</span>
          <span className="hidden sm:inline">{sep}</span>
          <Tip content={<span className="font-mono">{fmtDateTime(dash.scan.started_at)}</span>}>
            <span className="hidden whitespace-nowrap sm:inline">{t("topbar.lastScan", { time: timeAgo(dash.scan.started_at) })}</span>
          </Tip>
          <span className="hidden md:inline">{sep}</span>
          <Tip content={<span className="font-mono">{dash.scan.source}</span>}>
            <span className="hidden whitespace-nowrap md:inline">{t(`source.${sourceKind(dash.scan.source)}`)}</span>
          </Tip>
        </>
      ) : (
        <span className="whitespace-nowrap">{t("source.none")}</span>
      )}
      <span className="hidden md:inline">{sep}</span>
      <span className="hidden md:inline">
        <ReadOnlyNote />
      </span>
    </div>
  );
}

export function Topbar({ chrome }: { chrome: Chrome }) {
  const { t, lang } = useI18n();
  const { runScan, running } = useScan();
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: dash } = useQuery({ queryKey: ["dashboard", "latest", lang], queryFn: () => api.dashboard(), retry: false });

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-base/85 backdrop-blur-md">
      <div className="flex h-14 items-center gap-2 px-4 sm:gap-3 sm:px-8">
        <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" onClick={() => setMenuOpen(true)} aria-label={t("nav.openMenu")}>
          <Menu />
        </Button>
        <div className="min-w-0 flex-1">
          <ScanMeta />
        </div>
        <div className="hidden xl:block">
          <SourceToggle />
        </div>
        <div className="flex items-center">
          <LangSwitcher />
          <ThemeToggle />
        </div>
        {chrome.export && <ExportMenu scanId={dash?.scan.scan_id} />}
        {chrome.run !== "hidden" && (
          <Button variant={chrome.run} onClick={() => runScan()} disabled={running} aria-label={t("common.runScan")}>
            <Play />
            <span className="hidden sm:inline">{t("common.runScan")}</span>
          </Button>
        )}
      </div>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="gap-8 px-3 py-5">
          <SheetTitle className="sr-only">{t("nav.navigation")}</SheetTitle>
          <div className="px-3">
            <Brand />
          </div>
          <NavList onNavigate={() => setMenuOpen(false)} />
          <div className="px-3 xl:hidden">
            <div className="eyebrow mb-2">{t("topbar.collector")}</div>
            <SourceToggle />
          </div>
          <ModuleList onNavigate={() => setMenuOpen(false)} />
          <div className="mt-auto px-3 text-12 text-fg-3 md:hidden">
            <ReadOnlyNote />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}

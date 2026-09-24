import { useQuery } from "@tanstack/react-query";
import { Archive, Globe2, LayoutDashboard, ListFilter, Radar, ScrollText, ShieldCheck, SlidersHorizontal, Wrench } from "lucide-react";
import { NavLink } from "react-router-dom";
import { Tip } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "nav.platform", icon: Radar, end: true },
  { to: "/dashboard", label: "nav.dashboard", icon: LayoutDashboard, end: false },
  { to: "/findings", label: "nav.findings", icon: ListFilter, end: false },
  { to: "/settings", label: "nav.settings", icon: SlidersHorizontal, end: false },
] as const;

const MODULES = [
  { label: "modules.identity", icon: ShieldCheck, live: true },
  { label: "modules.certificate", icon: ScrollText, live: false },
  { label: "modules.dns", icon: Globe2, live: false },
  { label: "modules.patch", icon: Wrench, live: false },
  { label: "modules.backup", icon: Archive, live: false },
] as const;

export function Brand() {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative grid size-9 place-items-center overflow-hidden rounded-xl border border-primary/30 bg-primary/10">
        <Radar className="size-5 text-primary" />
        <span className="absolute inset-0 animate-radar-sweep bg-[conic-gradient(from_0deg,hsl(var(--primary)/0.35),transparent_70deg)]" />
      </div>
      <div className="leading-tight">
        <div className="font-display text-[13px] font-semibold tracking-wide">{t("nav.brand")}</div>
        <div className="text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">{t("nav.brandSub")}</div>
      </div>
    </div>
  );
}

export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  return (
    <nav className="space-y-1" aria-label={t("nav.main")}>
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
              isActive ? "bg-fg/[0.07] text-foreground" : "text-muted-foreground hover:bg-fg/[0.04] hover:text-foreground",
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />}
              <Icon className={cn("size-4", isActive && "text-primary")} />
              {t(label)}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export function ModuleList() {
  const { t } = useI18n();
  return (
    <div>
      <div className="mb-2 px-3 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">{t("nav.modules")}</div>
      <ul className="space-y-0.5">
        {MODULES.map(({ label, icon: Icon, live }) => (
          <li key={label} className={cn("flex items-center gap-3 rounded-lg px-3 py-1.5 text-[13px]", live ? "text-foreground" : "text-muted-foreground/50")}>
            <Icon className="size-3.5" />
            <span className="flex-1">{t(label)}</span>
            {live ? (
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
            ) : (
              <span className="text-[10px]">{t("nav.soon")}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PostureBadge() {
  const { t } = useI18n();
  const { data } = useQuery({ queryKey: ["health"], queryFn: api.health, staleTime: 60_000 });
  return (
    <Tip
      side="right"
      content={
        <div className="space-y-1">
          <div className="font-semibold">{t("posture.tipTitle")}</div>
          <div>{t("posture.tipPriv")}</div>
          <div>{t("posture.tipSecrets")}</div>
          {data?.config.ldap_bind_user && (
            <div className="font-mono">
              {t("posture.bind")}: {data.config.ldap_bind_user}
            </div>
          )}
        </div>
      }
    >
      <div className="flex cursor-help items-center gap-2.5 rounded-xl border border-risk-low/30 bg-risk-low/[0.08] px-3 py-2.5">
        <ShieldCheck className="size-4 text-risk-fg-low" />
        <div className="leading-tight">
          <div className="text-[12px] font-medium text-foreground">{t("posture.badge")}</div>
          <div className="text-[10.5px] text-muted-foreground">{t("posture.badgeSub")}</div>
        </div>
      </div>
    </Tip>
  );
}

export function Sidebar() {
  const { t } = useI18n();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 border-r border-fg/[0.06] bg-background/60 px-3 py-5 backdrop-blur-xl lg:flex">
      <div className="px-2">
        <Brand />
      </div>
      <NavList />
      <ModuleList />
      <div className="mt-auto space-y-2">
        <PostureBadge />
        <div className="px-3 text-[10.5px] text-muted-foreground/60">{t("common.version")}</div>
      </div>
    </aside>
  );
}

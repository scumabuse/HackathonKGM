import { Archive, Globe2, LayoutDashboard, ListFilter, Radar, ScrollText, ShieldCheck, SlidersHorizontal, Wrench } from "lucide-react";
import { NavLink } from "react-router-dom";
import { MonoDigits } from "@/components/MonoDigits";
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
      <Radar className="size-5 text-fg" aria-hidden />
      <div>
        <div className="text-14 font-semibold text-fg">{t("nav.brand")}</div>
        <div className="text-12 text-fg-3">{t("nav.brandSub")}</div>
      </div>
    </div>
  );
}

/** Active item = accent text + a thin accent bar. Inactive = muted, no boxes. */
export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t("nav.main")}>
      <ul className="space-y-0.5">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "relative flex h-9 items-center gap-3 rounded-control px-3 text-14 transition-colors duration-fast",
                  isActive ? "font-medium text-accent" : "text-fg-2 hover:bg-fg/[0.04] hover:text-fg",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" aria-hidden />}
                  <Icon className="size-4" aria-hidden />
                  {t(label)}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function ModuleList() {
  const { t } = useI18n();
  return (
    <div>
      <div className="eyebrow mb-2 px-3">{t("nav.modules")}</div>
      <ul className="space-y-0.5">
        {MODULES.map(({ label, icon: Icon, live }) => (
          <li key={label} className={cn("flex h-8 items-center gap-2.5 px-3 text-13", live ? "text-fg-2" : "text-fg-3/70")}>
            <Icon className="size-4" aria-hidden />
            {/* module names are untranslated brand names ending in "Radar"; under the "Modules" heading the suffix is noise */}
            <span className="flex-1 truncate">{t(label).replace(/ Radar$/, "")}</span>
            <span className={cn("text-12", live ? "text-fg-3" : "text-fg-3/70")}>{t(live ? "home.live" : "nav.soon")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Sidebar() {
  const { t } = useI18n();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-8 border-r border-line bg-base px-3 py-5 lg:flex">
      <div className="px-3">
        <Brand />
      </div>
      <NavList />
      <ModuleList />
      <MonoDigits text={t("common.version")} className="mt-auto px-3 text-12 text-fg-3" />
    </aside>
  );
}

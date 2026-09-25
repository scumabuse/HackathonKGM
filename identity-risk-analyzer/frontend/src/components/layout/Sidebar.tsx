import {
  Archive,
  FlaskConical,
  Globe2,
  LayoutDashboard,
  ListFilter,
  Radar,
  Route,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
} from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import { useId } from "react";
import { Link, NavLink } from "react-router-dom";
import { MonoDigits } from "@/components/MonoDigits";
import { Tip } from "@/components/ui/tooltip";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const NAV_GROUPS = [
  {
    label: "nav.groupOverview",
    items: [
      { to: "/", label: "nav.platform", icon: Radar, end: true },
      { to: "/dashboard", label: "nav.dashboard", icon: LayoutDashboard, end: false },
      { to: "/findings", label: "nav.findings", icon: ListFilter, end: false },
    ],
  },
  {
    label: "nav.groupAnalysis",
    items: [
      { to: "/paths", label: "nav.paths", icon: Route, end: false },
      { to: "/simulator", label: "nav.simulator", icon: FlaskConical, end: false },
    ],
  },
  {
    label: null,
    items: [{ to: "/settings", label: "nav.settings", icon: SlidersHorizontal, end: false }],
  },
] as const;

const MODULES = [
  { label: "modules.identity", icon: ShieldCheck, live: true },
  { label: "modules.certificate", icon: ScrollText, live: false },
  { label: "modules.dns", icon: Globe2, live: false },
  { label: "modules.patch", icon: Wrench, live: false },
  { label: "modules.backup", icon: Archive, live: false },
] as const;

/** Wordmark: display serif, the last word in italic ("Risk *Radar*"). */
export function Brand() {
  const { t } = useI18n();
  const name = t("nav.brand");
  const cut = name.lastIndexOf(" ");
  return (
    <div>
      <div className="display text-20">
        {cut > 0 ? (
          <>
            {name.slice(0, cut)} <em className="italic">{name.slice(cut + 1)}</em>
          </>
        ) : (
          name
        )}
      </div>
      <div className="mt-0.5 text-12 text-fg-3">{t("nav.brandSub")}</div>
    </div>
  );
}

/**
 * Grouped navigation. The active item is a raised pill with a burgundy rail; the pill glides between items
 * (shared layout animation). Inactive items stay quiet.
 */
export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const id = useId(); // separate layout group per instance (sidebar vs. mobile sheet)
  return (
    <nav aria-label={t("nav.main")} className="space-y-5">
      <LayoutGroup id={id}>
        {NAV_GROUPS.map((g, gi) => (
          <div key={gi}>
            {g.label && <div className="tech mb-1.5 px-3 text-fg-3/80">{t(g.label)}</div>}
            <ul className="space-y-0.5">
              {g.items.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        "relative flex h-9 items-center gap-3 rounded-control px-3 text-14 transition-colors duration-fast",
                        isActive ? "font-medium text-accent" : "text-fg-3 hover:bg-fg/[0.04] hover:text-fg",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.span
                            layoutId="nav-active"
                            className="absolute inset-0 rounded-control bg-raised shadow-panel"
                            transition={{ type: "spring", stiffness: 420, damping: 36 }}
                            aria-hidden
                          >
                            <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand" />
                          </motion.span>
                        )}
                        <Icon className="relative size-4" aria-hidden />
                        <span className="relative truncate">{t(label)}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </LayoutGroup>
    </nav>
  );
}

/** Platform roadmap. Only Identity exists (it opens the dashboard); the rest explain themselves on hover. */
export function ModuleList({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  return (
    <div>
      <div className="tech mb-1.5 px-3 text-fg-3/80">{t("nav.modules")}</div>
      <ul className="space-y-0.5">
        {/* demo build: only the module that exists is listed (the roadmap lives on the home page) */}
        {MODULES.filter((m) => m.live).map(({ label, icon: Icon, live }) => {
          // module names are untranslated brand names ending in "Radar"; under the "Modules" heading the suffix is noise
          const name = t(label).replace(/ Radar$/, "");
          return (
            <li key={label}>
              {live ? (
                <Link
                  to="/dashboard"
                  onClick={onNavigate}
                  className="flex h-8 items-center gap-2.5 rounded-control px-3 text-13 text-fg-2 transition-colors duration-fast hover:bg-fg/[0.04] hover:text-fg"
                >
                  <Icon className="size-4" aria-hidden />
                  <span className="flex-1 truncate">{name}</span>
                  <span className="inline-flex items-center gap-1.5 text-12 text-fg-3">
                    <span className="size-1.5 rounded-full bg-risk-low" aria-hidden />
                    {t("home.live")}
                  </span>
                </Link>
              ) : (
                <Tip side="right" content={t("nav.inDevelopment")}>
                  <div className="flex h-8 cursor-default items-center gap-2.5 px-3 text-13 text-fg-3/60" tabIndex={0}>
                    <Icon className="size-4" aria-hidden />
                    <span className="flex-1 truncate">{name}</span>
                    <span className="font-mono text-12 uppercase tracking-[0.06em]">{t("nav.soon")}</span>
                  </div>
                </Tip>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Sidebar() {
  const { t } = useI18n();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-7 overflow-y-auto border-r border-line bg-base px-3 py-5 lg:flex">
      <div className="px-3">
        <Brand />
      </div>
      <NavList />
      <ModuleList />
      <MonoDigits text={t("common.version")} className="mt-auto px-3 text-12 text-fg-3" />
    </aside>
  );
}

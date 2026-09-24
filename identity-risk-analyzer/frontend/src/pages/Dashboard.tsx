import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Crown, Minus, Timer, Users } from "lucide-react";
import { motion } from "motion/react";
import type { KeyboardEvent, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { CategoryBar } from "@/components/charts/CategoryBar";
import { RiskDonut } from "@/components/charts/RiskDonut";
import { TrendSparkline } from "@/components/charts/TrendSparkline";
import { MonoDigits } from "@/components/MonoDigits";
import { RiskChip } from "@/components/RiskBadge";
import { ScoreGauge } from "@/components/ScoreGauge";
import { ErrorState, NoScanYet, isNotFound } from "@/components/States";
import { Tag } from "@/components/ui/badge";
import { Panel, PanelHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tip } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { itemMotion, listMotion } from "@/lib/motion";
import { BAND_COLOR, OBJECT_ICON } from "@/lib/risk";
import type { Dashboard as DashboardT } from "@/lib/types";
import { cn, sourceKind } from "@/lib/utils";

// Labels live in the dictionary under dashboard.kpi.<key> and dashboard.kpi.<key>Hint.
const KPIS = [
  { key: "inactive_users", rule: "AD-USR-INACTIVE" },
  { key: "service_pne", rule: "AD-SVC-PNE" },
  { key: "disabled_privileged", rule: "AD-PRIV-DISABLED" },
  { key: "excessive_rights", rule: "AD-PRIV-NESTED" },
  { key: "hidden_admins", rule: "AD-PRIV-HIDDEN-PGID" },
  { key: "kerberoastable", rule: "AD-SVC-KERBEROAST" },
] as const;

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-12 gap-4 lg:gap-6" aria-busy>
      <Skeleton className="col-span-12 h-24 rounded-card" />
      <Skeleton className="col-span-12 h-[520px] rounded-card lg:col-span-5" />
      <Skeleton className="col-span-12 h-[520px] rounded-card lg:col-span-7" />
      <Skeleton className="col-span-12 h-[300px] rounded-card lg:col-span-7" />
      <Skeleton className="col-span-12 h-[300px] rounded-card lg:col-span-5" />
      <Skeleton className="col-span-12 h-[420px] rounded-card lg:col-span-8" />
      <Skeleton className="col-span-12 h-[420px] rounded-card lg:col-span-4" />
    </div>
  );
}

/** Page masthead: what this is (kicker), which domain (serif title), when and from where (mono line). */
function Masthead({ d }: { d: DashboardT }) {
  const { t, timeAgo, fmtDateTime } = useI18n();
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
      <div className="min-w-0">
        <div className="kicker">{t("titles.dashboard")}</div>
        <h1 className="display mt-3 truncate text-40 leading-[1.1]">{d.scan.domain}</h1>
      </div>
      <div className="tech flex flex-wrap items-center gap-x-3 gap-y-1 pb-1">
        <Tip content={<span className="font-mono">{fmtDateTime(d.scan.started_at)}</span>}>
          <span>{t("topbar.lastScan", { time: timeAgo(d.scan.started_at) })}</span>
        </Tip>
        <span aria-hidden>·</span>
        <span>{t(`source.${sourceKind(d.scan.source)}`)}</span>
      </div>
    </header>
  );
}

/** Row 1, left — the focal point: domain health, its verdict and its history. */
function ScorePanel({ d }: { d: DashboardT }) {
  const { t, num } = useI18n();
  const band = d.score_band;
  const delta = d.diff?.score_delta;
  const DeltaIcon = delta == null || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <Panel className="flex h-full flex-col">
      <div className="tech">{t("common.adSecurityScore")}</div>
      <p className="mt-1 text-13 text-fg-3">{t("dashboard.domainHealth")}</p>
      <div className="mt-6 px-2">
        <ScoreGauge score={d.ad_security_score} />
      </div>
      <div className="mt-1 flex flex-col items-center gap-1.5 pb-6 text-center">
        <div className="inline-flex items-center gap-2 text-16 font-medium text-fg">
          <span className="size-2 rounded-full" style={{ background: BAND_COLOR[band] }} aria-hidden />
          {t(`bands.${band}`)}
        </div>
        <p className="max-w-xs text-13 text-fg-2">{t(`bandBlurb.${band}`)}</p>
        {delta != null && (
          <p className="inline-flex items-center gap-1 font-mono text-12 text-fg-3">
            <DeltaIcon className="size-3.5" aria-hidden />
            {delta === 0 ? t("dashboard.noChange") : t("dashboard.vsPrevious", { delta: `${delta > 0 ? "+" : "−"}${num(Math.abs(delta))}` })}
          </p>
        )}
      </div>
      {d.trend.length > 1 && (
        <div className="mt-auto border-t border-line pt-5">
          <TrendSparkline points={d.trend} label={t("dashboard.history")} valueLabel={t("common.adSecurityScore")} height={96} />
        </div>
      )}
    </Panel>
  );
}

/** Row 1, right — every at-risk object by level: one ring + legend (it replaces four separate counters). */
function LevelsPanel({ d }: { d: DashboardT }) {
  const { t, tp } = useI18n();
  const critical = d.level_counts.Critical;
  return (
    <RiskDonut
      counts={d.level_counts}
      title={t("dashboard.objectsAtRisk")}
      subtitle={t("dashboard.objectsAtRiskSub")}
      footer={
        critical > 0 && (
          <Link
            to="/findings?level=Critical"
            className="group flex items-center gap-3 rounded-control bg-risk-critical/[0.07] px-4 py-3 text-13 text-fg transition-colors duration-fast hover:bg-risk-critical/[0.12]"
          >
            <span className="size-2 shrink-0 rounded-full bg-risk-critical" aria-hidden />
            <span className="flex-1">{tp("dashboard.criticalCallout", critical)}</span>
            <ArrowRight className="size-4 text-fg-3 transition-transform duration-base group-hover:translate-x-0.5" aria-hidden />
          </Link>
        )
      }
    />
  );
}

/** Row 2, left — the headline indicators from the brief as a quiet 3×2 grid, each a shortcut to its rule. */
function IndicatorsPanel({ d }: { d: DashboardT }) {
  const { t } = useI18n();
  return (
    <Panel className="h-full">
      <PanelHeader title={t("dashboard.keyIndicators")} className="mb-4" />
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {KPIS.map((k) => {
          const n = d.counts[k.key] ?? 0;
          return (
            <li key={k.key}>
              <Tip content={t(`dashboard.kpi.${k.key}Hint`)}>
                <Link
                  to={`/findings?rule_id=${k.rule}`}
                  className="group flex h-full flex-col rounded-control bg-fg/[0.025] p-4 transition-colors duration-fast hover:bg-fg/[0.06]"
                >
                  <AnimatedCounter value={n} className={cn("font-mono text-28 leading-none", n > 0 ? "text-fg" : "text-fg-3")} />
                  <span className="mt-2 text-13 leading-snug text-fg-2 group-hover:text-fg">{t(`dashboard.kpi.${k.key}`)}</span>
                </Link>
              </Tip>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/** Row 3 — the attention list: the riskiest objects as a tight, clickable table. */
function TopRiskPanel({ d }: { d: DashboardT }) {
  const { t, objectType } = useI18n();
  const navigate = useNavigate();
  const open = (id: string) => navigate(`/accounts/${id}`);
  return (
    <Panel className="p-0">
      <div className="px-6 pt-6">
        <PanelHeader
          title={t("dashboard.mostRisky")}
          subtitle={t("dashboard.mostRiskySub")}
          right={
            <Link to="/findings" className="inline-flex items-center gap-1 text-13 text-fg-2 transition-colors duration-fast hover:text-fg">
              {t("common.allFindings")} <ArrowRight className="size-3.5" />
            </Link>
          }
          className="mb-4"
        />
      </div>
      {d.top_risky.length === 0 ? (
        <p className="px-6 pb-6 text-13 text-fg-3">{t("dashboard.noRisky")}</p>
      ) : (
        <table className="w-full table-fixed text-13">
          <thead>
            <tr className="border-y border-line text-left">
              <th className="eyebrow w-[10rem] py-2 pl-6 font-medium">{t("findings.th.level")}</th>
              <th className="eyebrow w-[34%] py-2 pr-3 font-medium">{t("findings.th.object")}</th>
              <th className="eyebrow hidden py-2 pr-3 font-medium md:table-cell">{t("dashboard.topFinding")}</th>
              <th className="eyebrow w-16 py-2 pr-6 text-right font-medium">{t("findings.th.risk")}</th>
            </tr>
          </thead>
          <motion.tbody variants={listMotion} initial="hidden" animate="show">
            {d.top_risky.map((e) => {
              const Icon = OBJECT_ICON[e.object_type];
              return (
                <motion.tr
                  key={e.object_id}
                  variants={itemMotion}
                  role="link"
                  tabIndex={0}
                  onClick={() => open(e.object_id)}
                  onKeyDown={(ev: KeyboardEvent) => ev.key === "Enter" && open(e.object_id)}
                  className="cursor-pointer border-b border-line outline-none transition-colors duration-fast last:border-0 hover:bg-fg/[0.03] focus-visible:bg-fg/[0.05]"
                >
                  <td className="py-3 pl-6 align-top">
                    <RiskChip level={e.level} />
                  </td>
                  <td className="py-3 pr-3 align-top">
                    <div className="flex min-w-0 items-start gap-2">
                      <Icon className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden />
                      <div className="min-w-0">
                        <div className="truncate font-mono text-fg">{e.object_name}</div>
                        <div className="truncate text-12 text-fg-3">
                          {objectType(e.object_type)}
                          {e.tier0 && " · Tier-0"}
                          {e.enabled === false && ` · ${t("common.disabledLower")}`}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden py-3 pr-3 align-top md:table-cell">
                    <div className="truncate text-fg-2">
                      {e.top_title}
                      {e.finding_count > 1 && <span className="text-fg-3"> · {t("common.moreCount", { n: e.finding_count - 1 })}</span>}
                    </div>
                    {e.privilege_path && <div className="truncate font-mono text-12 text-fg-3">{e.privilege_path.join(" → ")}</div>}
                  </td>
                  <td className="py-3 pr-6 text-right align-top font-mono text-16 text-fg">{e.score}</td>
                </motion.tr>
              );
            })}
          </motion.tbody>
        </table>
      )}
    </Panel>
  );
}

function DiffPanel({ d }: { d: DashboardT }) {
  const { t } = useI18n();
  const diff = d.diff;
  return (
    <Panel>
      <PanelHeader title={t("dashboard.sinceLast")} subtitle={t(diff ? "dashboard.sinceLastSub" : "dashboard.firstScan")} />
      {!diff ? (
        <p className="text-13 text-fg-3">{t("dashboard.runAnother")}</p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-4">
            {(
              [
                [t("dashboard.new"), diff.new],
                [t("dashboard.resolved"), diff.resolved],
                [t("dashboard.worsened"), diff.worsened],
              ] as const
            ).map(([label, v]) => (
              <div key={label}>
                <dt className="text-12 text-fg-3">{label}</dt>
                <dd className="mt-1 font-mono text-20 text-fg">{v}</dd>
              </div>
            ))}
          </dl>
          {diff.top_new.length > 0 && (
            <ul className="mt-5 space-y-0.5 border-t border-line pt-4">
              {diff.top_new.map((n) => (
                <li key={n.finding_id}>
                  <Link
                    to={`/accounts/${n.object_id}`}
                    className="-mx-2 flex h-9 items-center gap-2 rounded-control px-2 text-13 transition-colors duration-fast hover:bg-fg/[0.04]"
                  >
                    <Tag className="h-5">{t("dashboard.newBadge")}</Tag>
                    <span className="min-w-0 flex-1 truncate text-fg-2">{n.title}</span>
                    <span className="shrink-0 font-mono text-12 text-fg-3">{n.object_name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}

function SignalRow({ icon: Icon, label, children }: { icon: typeof Activity; label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="inline-flex items-center gap-2 text-fg-3">
        <Icon className="size-4 self-center" aria-hidden /> {label}
      </dt>
      <dd className="text-right text-fg">{typeof children === "string" ? <MonoDigits text={children} /> : children}</dd>
    </div>
  );
}

function SignalsPanel({ d }: { d: DashboardT }) {
  const { t, tp, num } = useI18n();
  const ev = d.eventlog;
  const ok = ev.status === "ok";
  return (
    <Panel>
      <PanelHeader title={t("dashboard.collection")} />
      <dl className="space-y-3 text-13">
        <SignalRow icon={Activity} label={t("dashboard.eventLog")}>
          {ok ? tp("dashboard.events", ev.events ?? 0) : <span className="text-fg-2">{t("dashboard.notAvailable")}</span>}
        </SignalRow>
        {!ok && (
          <p className="text-12 text-fg-3" title={ev.detail ?? undefined}>
            {t("dashboard.eventLogSkipped")}
          </p>
        )}
        <SignalRow icon={Crown} label={t("dashboard.privilegedAccounts")}>
          <span className="font-mono">{d.counts.privileged}</span> · Tier-0 <span className="font-mono">{d.counts.tier0}</span>
        </SignalRow>
        <SignalRow icon={Users} label={t("dashboard.objects")}>
          {t("dashboard.objectCounts", { users: d.counts.users, computers: d.counts.computers, groups: d.counts.groups })}
        </SignalRow>
        <SignalRow icon={Timer} label={t("dashboard.scanTime")}>
          {t("dashboard.ms", { n: num(d.scan.duration_ms) })}
        </SignalRow>
      </dl>
      {d.warnings.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-line pt-3 text-12 text-fg-2">
          {d.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default function Dashboard() {
  const { lang } = useI18n();
  const { data: d, error, isLoading } = useQuery({
    queryKey: ["dashboard", "latest", lang],
    queryFn: () => api.dashboard(),
    placeholderData: keepPreviousData,
    retry: (n, e) => !isNotFound(e) && n < 2,
  });

  if (isLoading) return <DashboardSkeleton />;
  if (error && isNotFound(error)) return <NoScanYet />;
  if (error || !d) return <ErrorState error={error} />;

  return (
    <motion.div variants={listMotion} initial="hidden" animate="show" className="grid grid-cols-12 gap-4 lg:gap-6">
      <motion.div variants={itemMotion} className="col-span-12 min-w-0">
        <Masthead d={d} />
      </motion.div>
      <motion.div variants={itemMotion} className="col-span-12 min-w-0 lg:col-span-5" data-tour="score">
        <ScorePanel d={d} />
      </motion.div>
      <motion.div variants={itemMotion} className="col-span-12 min-w-0 lg:col-span-7">
        <LevelsPanel d={d} />
      </motion.div>
      <motion.div variants={itemMotion} className="col-span-12 min-w-0 lg:col-span-7">
        <IndicatorsPanel d={d} />
      </motion.div>
      <motion.div variants={itemMotion} className="col-span-12 min-w-0 lg:col-span-5">
        <CategoryBar scores={d.category_scores} matrix={d.category_matrix} />
      </motion.div>
      <motion.div variants={itemMotion} className="col-span-12 min-w-0 lg:col-span-8">
        <TopRiskPanel d={d} />
      </motion.div>
      <motion.div variants={itemMotion} className="col-span-12 min-w-0 space-y-4 lg:col-span-4 lg:space-y-6">
        <DiffPanel d={d} />
        <SignalsPanel d={d} />
      </motion.div>
    </motion.div>
  );
}

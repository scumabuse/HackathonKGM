import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Clock3,
  Crown,
  EyeOff,
  GitBranch,
  KeyRound,
  Server,
  ShieldAlert,
  Timer,
  UserX,
} from "lucide-react";
import { motion } from "motion/react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { CategoryBar } from "@/components/charts/CategoryBar";
import { RiskDonut } from "@/components/charts/RiskDonut";
import { TrendArea } from "@/components/charts/TrendArea";
import { FindingCard } from "@/components/FindingCard";
import { SourceBadge } from "@/components/layout/Topbar";
import { RiskBadge } from "@/components/RiskBadge";
import { ScoreGauge } from "@/components/ScoreGauge";
import { ErrorState, NoScanYet, isNotFound } from "@/components/States";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tip } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { BAND_COLOR, LEVELS, LEVEL_META, tint } from "@/lib/risk";
import type { Dashboard as DashboardT } from "@/lib/types";
import { cn } from "@/lib/utils";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } } };

// Labels live in the dictionary under dashboard.kpi.<key> and dashboard.kpi.<key>Hint.
const KPIS = [
  { key: "inactive_users", icon: Clock3, rule: "AD-USR-INACTIVE" },
  { key: "service_pne", icon: Server, rule: "AD-SVC-PNE" },
  { key: "disabled_privileged", icon: UserX, rule: "AD-PRIV-DISABLED" },
  { key: "excessive_rights", icon: GitBranch, rule: "AD-PRIV-NESTED" },
  { key: "hidden_admins", icon: EyeOff, rule: "AD-PRIV-HIDDEN-PGID" },
  { key: "kerberoastable", icon: KeyRound, rule: "AD-SVC-KERBEROAST" },
] as const;

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <Skeleton className="h-[330px] lg:col-span-4" />
      <Skeleton className="h-[330px] lg:col-span-8" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-[280px] lg:col-span-4" />
      ))}
    </div>
  );
}

function LevelCounter({ level, value }: { level: (typeof LEVELS)[number]; value: number }) {
  const { t, level: levelName } = useI18n();
  const m = LEVEL_META[level];
  const Icon = m.icon;
  return (
    <Link
      to={`/findings?level=${level}`}
      className="group relative overflow-hidden rounded-2xl border border-fg/[0.07] bg-fg/[0.02] p-4 transition hover:border-fg/15 hover:bg-fg/[0.04]"
    >
      <span className="absolute inset-y-3 left-0 w-1 rounded-r-full" style={{ background: m.color }} aria-hidden />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{t("dashboard.levelObjects", { level: levelName(level) })}</span>
        <Icon className="size-4" style={{ color: m.color }} aria-hidden />
      </div>
      <AnimatedCounter value={value} className="mt-2 block text-4xl font-semibold tracking-tight" />
      <span className="text-[11px] text-muted-foreground">{t("dashboard.risk", { range: m.range })}</span>
      <ArrowUpRight className="absolute bottom-3 right-3 size-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
    </Link>
  );
}

function KpiTile({ kpi, value }: { kpi: (typeof KPIS)[number]; value: number }) {
  const { t } = useI18n();
  const Icon = kpi.icon;
  return (
    <Tip content={t(`dashboard.kpi.${kpi.key}Hint`)}>
      <Link
        to={`/findings?rule_id=${kpi.rule}`}
        className="group flex items-center gap-3 rounded-xl border border-fg/[0.06] bg-fg/[0.02] px-3 py-2.5 transition hover:border-primary/30 hover:bg-primary/[0.04]"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-fg/[0.05]">
          <Icon className="size-4 text-primary" />
        </span>
        <div className="min-w-0">
          <AnimatedCounter value={value} className="block text-xl font-semibold leading-tight" />
          <div className="line-clamp-2 text-[11.5px] leading-tight text-muted-foreground">{t(`dashboard.kpi.${kpi.key}`)}</div>
        </div>
      </Link>
    </Tip>
  );
}

function DiffCard({ d }: { d: DashboardT }) {
  const { t } = useI18n();
  const diff = d.diff;
  return (
    <Card>
      <CardHeader title={t("dashboard.sinceLast")} subtitle={t(diff ? "dashboard.sinceLastSub" : "dashboard.firstScan")} />
      {!diff ? (
        <p className="text-sm text-muted-foreground">{t("dashboard.runAnother")}</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: t("dashboard.new"), v: diff.new, cls: "text-risk-fg-critical" },
              { label: t("dashboard.resolved"), v: diff.resolved, cls: "text-risk-fg-low" },
              { label: t("dashboard.worsened"), v: diff.worsened, cls: "text-risk-fg-high" },
            ].map((x) => (
              <div key={x.label} className="rounded-xl border border-fg/[0.06] bg-fg/[0.02] py-2">
                <div className={cn("text-xl font-semibold", x.cls)}>{x.v}</div>
                <div className="text-[11px] text-muted-foreground">{x.label}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">
            {diff.score_delta < 0 ? <ArrowDownRight className="size-4 text-risk-fg-critical" /> : <ArrowUpRight className="size-4 text-risk-fg-low" />}
            <span className="text-muted-foreground">{t("common.adSecurityScore")}</span>
            <span className="font-semibold">
              {diff.score_delta > 0 ? "+" : ""}
              {diff.score_delta}
            </span>
          </div>
          {diff.top_new.length > 0 && (
            <ul className="space-y-1.5">
              {diff.top_new.map((n) => (
                <li key={n.finding_id}>
                  <Link to={`/accounts/${n.object_id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition hover:bg-fg/[0.04]">
                    <span className="rounded bg-risk-critical/15 px-1.5 text-[10px] font-semibold text-risk-fg-critical">{t("dashboard.newBadge")}</span>
                    <span className="truncate">{n.title}</span>
                    <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">{n.object_name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

function SignalsCard({ d }: { d: DashboardT }) {
  const { t, tp, num } = useI18n();
  const ev = d.eventlog;
  const ok = ev.status === "ok";
  return (
    <Card>
      <CardHeader title={t("dashboard.collection")} />
      <dl className="space-y-2.5 text-[13px]">
        <div className="flex items-center justify-between gap-2">
          <dt className="inline-flex items-center gap-2 text-muted-foreground">
            <Activity className="size-4" /> {t("dashboard.eventLog")}
          </dt>
          <dd className={cn("text-right", ok ? "text-risk-fg-low" : "text-risk-fg-medium")}>
            {ok ? tp("dashboard.events", ev.events ?? 0) : t("dashboard.notAvailable")}
          </dd>
        </div>
        {!ok && (
          <p className="rounded-lg bg-risk-medium/[0.07] px-2.5 py-2 text-xs text-muted-foreground" title={ev.detail ?? undefined}>
            {t("dashboard.eventLogSkipped")}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <dt className="inline-flex items-center gap-2 text-muted-foreground">
            <ShieldAlert className="size-4" /> {t("dashboard.access")}
          </dt>
          <dd className="text-right">{d.security_posture.read_only ? t("dashboard.readOnly") : "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="inline-flex items-center gap-2 text-muted-foreground">
            <Crown className="size-4" /> {t("dashboard.privilegedAccounts")}
          </dt>
          <dd className="text-right font-mono">{d.counts.privileged} · Tier-0 {d.counts.tier0}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="inline-flex items-center gap-2 text-muted-foreground">
            <Timer className="size-4" /> {t("dashboard.scanTime")}
          </dt>
          <dd className="text-right font-mono">{t("dashboard.ms", { n: num(d.scan.duration_ms) })}</dd>
        </div>
        <div className="flex items-center justify-between gap-2 text-muted-foreground">
          <dt>{t("dashboard.objects")}</dt>
          <dd className="text-right font-mono text-foreground/90">
            {t("dashboard.objectCounts", { users: d.counts.users, computers: d.counts.computers, groups: d.counts.groups })}
          </dd>
        </div>
      </dl>
      {d.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-risk-fg-medium">
          {d.warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function Dashboard() {
  const { t, lang, trigger, fmtDateTime } = useI18n();
  const navigate = useNavigate();
  const { data: d, error, isLoading } = useQuery({
    queryKey: ["dashboard", "latest", lang],
    queryFn: () => api.dashboard(),
    placeholderData: keepPreviousData,
    retry: (n, e) => !isNotFound(e) && n < 2,
  });

  if (isLoading) return <DashboardSkeleton />;
  if (error && isNotFound(error)) return <NoScanYet />;
  if (error || !d) return <ErrorState error={error} />;

  const bandColor = BAND_COLOR[d.score_band];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      {/* ---- hero: domain health gauge ---- */}
      <motion.div variants={item} className="min-w-0 lg:col-span-4">
        <Card className="relative h-full overflow-hidden">
          <div className="absolute -right-16 -top-16 size-48 rounded-full blur-3xl" style={{ background: tint(bandColor, 13) }} />
          <div className="relative flex items-start justify-between">
            <div>
              <div className="eyebrow">{t("common.adSecurityScore")}</div>
              <div className="mt-1 text-xs text-muted-foreground">{t("dashboard.domainHealth")}</div>
            </div>
            <SourceBadge source={d.scan.source} />
          </div>
          <div className="relative mt-3">
            <ScoreGauge score={d.ad_security_score} delta={d.diff?.score_delta ?? null} />
          </div>
          <p className="relative mt-1 text-center text-sm text-muted-foreground">{t(`bandBlurb.${d.score_band}`)}</p>
          <p className="relative mt-3 text-center font-mono text-[11px] text-muted-foreground/80">
            {d.scan.domain} · {fmtDateTime(d.scan.started_at)}
            {d.scan.trigger !== "manual" && ` · ${trigger(d.scan.trigger)}`}
          </p>
        </Card>
      </motion.div>

      {/* ---- level counters + key indicators ---- */}
      <motion.div variants={item} className="min-w-0 lg:col-span-8">
        <Card className="h-full">
          <CardHeader title={t("dashboard.objectsAtRisk")} subtitle={t("dashboard.objectsAtRiskSub")} />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {LEVELS.map((l) => (
              <LevelCounter key={l} level={l} value={d.level_counts[l]} />
            ))}
          </div>
          <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {KPIS.map((k) => (
              <KpiTile key={k.key} kpi={k} value={d.counts[k.key] ?? 0} />
            ))}
          </div>
        </Card>
      </motion.div>

      {/* ---- charts ---- */}
      <motion.div variants={item} className="min-w-0 lg:col-span-4">
        <RiskDonut counts={d.level_counts} />
      </motion.div>
      <motion.div variants={item} className="min-w-0 lg:col-span-4">
        <CategoryBar scores={d.category_scores} matrix={d.category_matrix} />
      </motion.div>
      <motion.div variants={item} className="min-w-0 lg:col-span-4">
        <TrendArea trend={d.trend} />
      </motion.div>

      {/* ---- most risky objects ---- */}
      <motion.div variants={item} className="min-w-0 lg:col-span-8">
        <Card>
          <CardHeader
            title={t("dashboard.mostRisky")}
            subtitle={t("dashboard.mostRiskySub")}
            right={
              <button type="button" onClick={() => navigate("/findings")} className="text-xs text-primary hover:underline">
                {t("common.allFindings")}
              </button>
            }
          />
          <motion.div variants={container} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2">
            {d.top_risky.map((e) => (
              <motion.div key={e.object_id} variants={item}>
                <FindingCard entity={e} />
              </motion.div>
            ))}
          </motion.div>
          {d.top_risky.length === 0 && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <RiskBadge level="Low" /> {t("dashboard.noRisky")}
            </div>
          )}
        </Card>
      </motion.div>
      <motion.div variants={item} className="min-w-0 space-y-4 lg:col-span-4">
        <DiffCard d={d} />
        <SignalsCard d={d} />
      </motion.div>
    </motion.div>
  );
}

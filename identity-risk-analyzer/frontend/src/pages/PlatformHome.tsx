import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  ArrowRight,
  Database,
  FileDown,
  Gauge,
  Globe2,
  Lightbulb,
  Play,
  ScanSearch,
  ScrollText,
  ShieldCheck,
  WifiOff,
  Wrench,
} from "lucide-react";
import { motion } from "motion/react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { Button } from "@/components/ui/button";
import { Marquee } from "@/components/ui/marquee";
import { RadarSweep } from "@/components/ui/radar-sweep";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { BAND_COLOR, CATEGORY_ICON, LEVELS, LEVEL_META } from "@/lib/risk";
import { useScan } from "@/lib/scan";
import { cn } from "@/lib/utils";

const SOON = [
  { name: "modules.certificate", icon: ScrollText, blurb: "modules.certificateBlurb" },
  { name: "modules.dns", icon: Globe2, blurb: "modules.dnsBlurb" },
  { name: "modules.patch", icon: Wrench, blurb: "modules.patchBlurb" },
  { name: "modules.backup", icon: Archive, blurb: "modules.backupBlurb" },
] as const;

const STEPS = [
  { icon: Database, title: "home.steps.collect", text: "home.steps.collectText" },
  { icon: ScanSearch, title: "home.steps.analyze", text: "home.steps.analyzeText" },
  { icon: Gauge, title: "home.steps.score", text: "home.steps.scoreText" },
  { icon: Lightbulb, title: "home.steps.explain", text: "home.steps.explainText" },
  { icon: FileDown, title: "home.steps.fix", text: "home.steps.fixText" },
] as const;

const fade = (delay = 0) => ({ initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.6, ease: [0.16, 1, 0.3, 1] as const } });

export default function PlatformHome() {
  const { t, tp, lang, level } = useI18n();
  const navigate = useNavigate();
  const { runScan, running } = useScan();
  const { data: d } = useQuery({ queryKey: ["dashboard", "latest", lang], queryFn: () => api.dashboard(), retry: false });
  const { data: rules } = useQuery({ queryKey: ["rules", lang], queryFn: api.rules, staleTime: 300_000 });

  return (
    <div className="space-y-10 pb-6">
      {/* ---------------------------------------------------------------- hero */}
      <section className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <motion.div {...fade(0)} className="eyebrow">
            {t("home.eyebrow")}
          </motion.div>
          <motion.h1 {...fade(0.05)} className="font-display text-3xl font-semibold leading-[1.15] tracking-tight sm:text-5xl">
            {t("home.heroA")}
            <span className="bg-gradient-to-r from-primary to-sky-600 bg-clip-text text-transparent dark:to-sky-300">{t("home.heroB")}</span>
            {t("home.heroC")}
          </motion.h1>
          <motion.p {...fade(0.12)} className="max-w-xl text-base leading-relaxed text-muted-foreground">
            {t("home.heroText")}
          </motion.p>
          <motion.div {...fade(0.18)} className="flex flex-wrap gap-3">
            <Button size="lg" onClick={() => runScan()} disabled={running}>
              <Play /> {t("home.runIdentityScan")}
            </Button>
            <Button size="lg" variant="secondary" onClick={() => navigate("/dashboard")}>
              {t("home.openDashboard")} <ArrowRight />
            </Button>
          </motion.div>
          <motion.ul {...fade(0.24)} className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
            <li className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-risk-fg-low" /> {t("home.readOnly")}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <WifiOff className="size-4 text-primary" /> {t("home.offline")}
            </li>
          </motion.ul>
        </div>
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} className="relative mx-auto w-full max-w-[420px]">
          <RadarSweep entities={d?.top_risky ?? []} />
          {d && (
            <motion.div
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.9 }}
              className="glass absolute -bottom-2 right-0 px-4 py-3 sm:-right-4"
            >
              <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">{t("common.adSecurityScore")}</div>
              <div className="flex items-baseline gap-2">
                <AnimatedCounter value={d.ad_security_score} className="text-3xl font-semibold" />
                <span className="text-xs" style={{ color: BAND_COLOR[d.score_band] }}>
                  ● {t(`bands.${d.score_band}`)}
                </span>
              </div>
            </motion.div>
          )}
          {d && (
            <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.05 }} className="glass absolute left-0 top-4 px-3 py-2 sm:-left-6">
              <div className="flex items-center gap-2 text-sm">
                <span className="size-2 rounded-full" style={{ background: LEVEL_META.Critical.color }} />
                <b>{d.level_counts.Critical}</b> <span className="text-muted-foreground">{tp("home.criticalObjects", d.level_counts.Critical)}</span>
              </div>
            </motion.div>
          )}
        </motion.div>
      </section>

      {/* ---------------------------------------------------------------- bento of modules */}
      <section className="grid auto-rows-[minmax(150px,auto)] gap-4 md:grid-cols-4">
        <motion.div {...fade(0.1)} className="md:col-span-2 md:row-span-2">
          <SpotlightCard className="glow-primary h-full p-6" onClick={() => navigate(d ? "/dashboard" : "/")}>
            <div className="flex items-start justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-70" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
                  </span>
                  {t("home.live")}
                </div>
                <h2 className="mt-3 font-display text-2xl font-semibold">{t("modules.identity")}</h2>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("home.identityText")}</p>
              </div>
              <ShieldCheck className="size-10 text-primary/80" />
            </div>
            {d ? (
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {LEVELS.map((l) => (
                  <div key={l} className="rounded-xl border border-fg/[0.07] bg-inset/70 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="size-2 rounded-full" style={{ background: LEVEL_META[l].color }} />
                      {level(l)}
                    </div>
                    <AnimatedCounter value={d.level_counts[l]} className="mt-1 block text-2xl font-semibold" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-6 text-sm text-muted-foreground">{t("home.noScanTile")}</p>
            )}
            {d && (
              <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-4">
                {(
                  [
                    [t("home.inactiveUsers"), d.counts.inactive_users],
                    [t("home.servicePne"), d.counts.service_pne],
                    [t("home.disabledPrivileged"), d.counts.disabled_privileged],
                    [t("home.excessiveRights"), d.counts.excessive_rights],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <div className="text-lg font-semibold">{v}</div>
                    <div className="text-muted-foreground">{k}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-primary">
              {t("home.openIdentity")} <ArrowRight className="size-4" />
            </div>
          </SpotlightCard>
        </motion.div>
        {SOON.map((m, i) => (
          <motion.div key={m.name} {...fade(0.15 + i * 0.06)}>
            <SpotlightCard glow="148 163 184" className="h-full p-5 opacity-70 grayscale transition hover:opacity-90">
              <div className="flex items-center justify-between">
                <m.icon className="size-6 text-muted-foreground" />
                <span className="rounded-full border border-fg/10 px-2 py-0.5 text-[10.5px] text-muted-foreground">{t("home.comingSoon")}</span>
              </div>
              <h3 className="mt-4 font-semibold">{t(m.name)}</h3>
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{t(m.blurb)}</p>
            </SpotlightCard>
          </motion.div>
        ))}
      </section>

      {/* ---------------------------------------------------------------- how it works */}
      <section>
        <div className="eyebrow mb-4">{t("home.howItWorks")}</div>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s, i) => (
            <motion.li key={s.title} {...fade(0.1 + i * 0.07)} className="glass relative p-4">
              <span className="absolute right-4 top-3 font-mono text-[11px] text-muted-foreground/60">0{i + 1}</span>
              <s.icon className="size-5 text-primary" />
              <div className="mt-3 font-semibold">{t(s.title)}</div>
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{t(s.text)}</p>
            </motion.li>
          ))}
        </ol>
      </section>

      {/* ---------------------------------------------------------------- marquee of checks */}
      {rules && rules.length > 0 && (
        <section>
          <div className="eyebrow mb-3">{tp("home.checks", rules.length)}</div>
          <Marquee>
            {rules.map((r) => {
              const Icon = CATEGORY_ICON[r.category] ?? ShieldCheck;
              return (
                <Link
                  key={r.id}
                  to={`/findings?rule_id=${r.id}`}
                  className={cn("inline-flex shrink-0 items-center gap-2 rounded-full border border-fg/10 bg-fg/[0.03] px-3 py-1.5 text-[13px] text-foreground/90 transition hover:border-primary/40")}
                >
                  <Icon className="size-3.5 text-primary" />
                  {r.name}
                  <span className="font-mono text-[10.5px] text-muted-foreground">{r.id}</span>
                </Link>
              );
            })}
          </Marquee>
        </section>
      )}
    </div>
  );
}

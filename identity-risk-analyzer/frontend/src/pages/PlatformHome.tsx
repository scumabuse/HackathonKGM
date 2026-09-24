import { useQuery } from "@tanstack/react-query";
import { Archive, ArrowRight, Globe2, Play, ScrollText, ShieldCheck, Wrench } from "lucide-react";
import { motion } from "motion/react";
import { Link, useNavigate } from "react-router-dom";
import { MonoDigits } from "@/components/MonoDigits";
import { Button } from "@/components/ui/button";
import { RadarSweep } from "@/components/ui/radar-sweep";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { itemMotion, listMotion } from "@/lib/motion";
import { BAND_COLOR, CATEGORIES, CATEGORY_ICON, LEVELS, LEVEL_META } from "@/lib/risk";
import { useScan } from "@/lib/scan";
import { cn } from "@/lib/utils";

const MODULES = [
  { name: "modules.identity", icon: ShieldCheck, blurb: "home.identityText", live: true },
  { name: "modules.certificate", icon: ScrollText, blurb: "modules.certificateBlurb", live: false },
  { name: "modules.dns", icon: Globe2, blurb: "modules.dnsBlurb", live: false },
  { name: "modules.patch", icon: Wrench, blurb: "modules.patchBlurb", live: false },
  { name: "modules.backup", icon: Archive, blurb: "modules.backupBlurb", live: false },
] as const;

const STEPS = [
  { title: "home.steps.collect", text: "home.steps.collectText" },
  { title: "home.steps.analyze", text: "home.steps.analyzeText" },
  { title: "home.steps.score", text: "home.steps.scoreText" },
  { title: "home.steps.explain", text: "home.steps.explainText" },
  { title: "home.steps.fix", text: "home.steps.fixText" },
] as const;

/** The vision screen: one statement, one primary action, a radar that shows the real scan. */
export default function PlatformHome() {
  const { t, tp, lang, level } = useI18n();
  const navigate = useNavigate();
  const { runScan, running } = useScan();
  const { data: d } = useQuery({ queryKey: ["dashboard", "latest", lang, "radar"], queryFn: () => api.dashboard("latest", 50), retry: false });
  const { data: rules } = useQuery({ queryKey: ["rules", lang], queryFn: api.rules, staleTime: 300_000 });
  const totalAtRisk = d ? LEVELS.reduce((s, l) => s + d.level_counts[l], 0) : 0;

  return (
    <motion.div variants={listMotion} initial="hidden" animate="show" className="space-y-20 pb-8">
      {/* ------------------------------------------------------------ hero */}
      <section className="relative grid items-center gap-12 overflow-x-clip pt-4 lg:grid-cols-[1.05fr_0.95fr] lg:pt-10">
        <motion.div variants={itemMotion} className="max-w-xl">
          <div className="eyebrow">{t("home.eyebrow")}</div>
          <h1 className="mt-4 text-40 font-semibold text-fg">
            {t("home.heroA")}
            {t("home.heroB")}
            {t("home.heroC")}
          </h1>
          <p className="mt-5 max-w-[56ch] text-16 text-fg-2">{t("home.heroText")}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" onClick={() => runScan()} disabled={running}>
              <Play /> {t("home.runIdentityScan")}
            </Button>
            <Button variant="secondary" size="lg" onClick={() => navigate("/dashboard")}>
              {t("home.openDashboard")} <ArrowRight />
            </Button>
          </div>
          <p className="mt-5 text-13 text-fg-3">{t("home.offline")}</p>
        </motion.div>

        <motion.figure variants={itemMotion} className="relative mx-auto w-full max-w-[400px]">
          {/* a very soft, neutral glow behind the scope — never competing with the data */}
          <div className="pointer-events-none absolute -inset-16 -z-10 bg-[radial-gradient(closest-side,rgb(var(--fg)/0.05),transparent)]" aria-hidden />
          <RadarSweep entities={d?.top_risky ?? []} className="mx-auto max-w-[340px]" />
          <figcaption className="mt-8">
            {d ? (
              <div className="space-y-4 border-t border-line pt-5">
                <div className="flex items-end justify-between gap-6">
                  <div>
                    <div className="eyebrow">{t("common.adSecurityScore")}</div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="font-mono text-28 text-fg">{d.ad_security_score}</span>
                      <span className="inline-flex items-center gap-1.5 text-13 text-fg-2">
                        <span className="size-2 rounded-full" style={{ background: BAND_COLOR[d.score_band] }} aria-hidden />
                        {t(`bands.${d.score_band}`)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-28 text-fg">{totalAtRisk}</div>
                    <div className="text-12 text-fg-3">{tp("charts.objectsAtRisk", totalAtRisk)}</div>
                  </div>
                </div>
                <ul className="flex flex-wrap gap-x-5 gap-y-1">
                  {LEVELS.map((l) => (
                    <li key={l} className="flex items-center gap-2 text-13">
                      <span className={cn("size-2 rounded-full", LEVEL_META[l].dot)} aria-hidden />
                      <span className="text-fg-2">{level(l)}</span>
                      <span className="font-mono text-fg">{d.level_counts[l]}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-12 text-fg-3">{t("home.radarLegend")}</p>
              </div>
            ) : (
              <p className="border-t border-line pt-5 text-center text-13 text-fg-3">{t("home.noScanTile")}</p>
            )}
          </figcaption>
        </motion.figure>
      </section>

      {/* ------------------------------------------------------------ modules: uniform cards */}
      <motion.section variants={itemMotion}>
        <h2 className="eyebrow mb-4">{t("home.modulesTitle")}</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {MODULES.map((m) => {
            const body = (
              <>
                <div className="flex items-center justify-between">
                  <m.icon className={cn("size-5", m.live ? "text-fg" : "text-fg-3")} aria-hidden />
                  <span className="inline-flex items-center gap-1.5 text-12 text-fg-3">
                    {m.live && <span className="size-1.5 rounded-full bg-accent" aria-hidden />}
                    {t(m.live ? "home.live" : "home.comingSoon")}
                  </span>
                </div>
                <h3 className={cn("mt-5 text-14 font-semibold", m.live ? "text-fg" : "text-fg-2")}>{t(m.name)}</h3>
                <p className="mt-1.5 text-13 text-fg-3">{t(m.blurb)}</p>
              </>
            );
            return (
              <li key={m.name}>
                {m.live ? (
                  <Link
                    to="/dashboard"
                    className="panel group block h-full p-5 transition-[transform,background-color] duration-base ease-out hover:-translate-y-0.5 hover:bg-overlay"
                  >
                    {body}
                    <span className="mt-4 inline-flex items-center gap-1 text-13 text-fg-2 transition-colors duration-fast group-hover:text-fg">
                      {t("home.openIdentity")} <ArrowRight className="size-3.5" />
                    </span>
                  </Link>
                ) : (
                  <div className="panel h-full p-5 opacity-60">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </motion.section>

      {/* ------------------------------------------------------------ how it works */}
      <motion.section variants={itemMotion}>
        <h2 className="eyebrow mb-4">{t("home.howItWorks")}</h2>
        <ol className="grid gap-x-8 gap-y-6 border-t border-line pt-6 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="font-mono text-12 text-fg-3">0{i + 1}</span>
              <div className="mt-2 text-14 font-medium text-fg">{t(s.title)}</div>
              <p className="mt-1 text-13 text-fg-3">{t(s.text)}</p>
            </li>
          ))}
        </ol>
      </motion.section>

      {/* ------------------------------------------------------------ what is checked */}
      {rules && rules.length > 0 && (
        <motion.section variants={itemMotion}>
          <h2 className="eyebrow mb-4">
            <MonoDigits text={tp("home.checks", rules.length)} />
          </h2>
          <ul className="grid gap-x-8 border-t border-line pt-2 sm:grid-cols-2 lg:grid-cols-5">
            {CATEGORIES.map((c) => {
              const Icon = CATEGORY_ICON[c];
              const n = rules.filter((r) => r.category === c).length;
              return (
                <li key={c}>
                  <Link
                    to={`/findings?category=${c}`}
                    className="-mx-2 flex items-start gap-3 rounded-control px-2 py-3 transition-colors duration-fast hover:bg-fg/[0.04] [&>svg]:mt-0.5"
                  >
                    <Icon className="size-4 shrink-0 text-fg-3" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-14 text-fg-2">{t(`categories.${c}`)}</span>
                      <MonoDigits text={tp("home.checksN", n)} className="block text-13 text-fg-3" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </motion.section>
      )}
    </motion.div>
  );
}

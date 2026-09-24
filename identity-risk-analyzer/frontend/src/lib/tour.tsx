import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useI18n } from "./i18n";
import { EASE } from "./motion";

/**
 * Presentation mode: a guided walk through the product for a jury. Each step names a route and an element
 * (`data-tour="…"`), spotlights it and captions it; some steps also trigger the page's own action through a
 * window event (the pages listen — the tour never fakes a result).
 */
const STEPS = [
  { key: "headline", route: "/", target: "headline" },
  { key: "radar", route: "/", target: "radar" },
  { key: "kpis", route: "/", target: "kpis" },
  { key: "path", route: "/paths", target: "featured", event: "tour:replay" },
  { key: "sim", route: "/simulator", target: "sim", event: "tour:sim-top3" },
  { key: "score", route: "/dashboard", target: "score" },
] as const;

const PAD = 10;
const TOP_GAP = 88; // room for the sticky top bar above a spotlighted element

interface TourCtx {
  start: () => void;
  active: boolean;
}
const Ctx = createContext<TourCtx | null>(null);

export function useTour() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTour outside TourProvider");
  return c;
}

export function TourProvider({ children }: { children: ReactNode }) {
  const [index, setIndex] = useState<number | null>(null);
  const start = useCallback(() => setIndex(0), []);
  return (
    <Ctx.Provider value={{ start, active: index != null }}>
      {children}
      <AnimatePresence>{index != null && <TourOverlay index={index} setIndex={setIndex} />}</AnimatePresence>
    </Ctx.Provider>
  );
}

function TourOverlay({ index, setIndex }: { index: number; setIndex: (i: number | null) => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const step = STEPS[index];
  const [rect, setRect] = useState<DOMRect | null>(null);
  const last = index === STEPS.length - 1;

  const go = useCallback((i: number) => (i < 0 ? undefined : i >= STEPS.length ? setIndex(null) : setIndex(i)), [setIndex]);

  // route, find the element (pages render async), bring it into view, fire the step's action
  useEffect(() => {
    if (pathname !== step.route) {
      navigate(step.route);
      return;
    }
    let cancelled = false;
    let fired = false;
    const t0 = performance.now();
    const find = () => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!el) {
        if (performance.now() - t0 < 5000) setTimeout(find, 120);
        return;
      }
      const top = el.getBoundingClientRect().top + window.scrollY - TOP_GAP;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      if ("event" in step && !fired) {
        fired = true;
        setTimeout(() => !cancelled && window.dispatchEvent(new Event(step.event)), 700);
      }
    };
    setRect(null);
    find();
    return () => {
      cancelled = true;
    };
  }, [index, pathname, navigate, step]);

  // keep the spotlight glued to the element while the page scrolls, resizes or animates
  useEffect(() => {
    let raf = 0;
    const track = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      setRect((prev) => {
        const r = el?.getBoundingClientRect() ?? null;
        if (!r || !prev) return r;
        return Math.abs(r.top - prev.top) + Math.abs(r.left - prev.left) + Math.abs(r.width - prev.width) + Math.abs(r.height - prev.height) < 0.5 ? prev : r;
      });
      raf = requestAnimationFrame(track);
    };
    raf = requestAnimationFrame(track);
    return () => cancelAnimationFrame(raf);
  }, [step.target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIndex(null);
      else if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, setIndex]);

  const title = t(`tour.steps.${step.key}.title`);
  const text = t(`tour.steps.${step.key}.text`);

  return (
    <motion.div className="pointer-events-none fixed inset-0 z-[80]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
      {/* spotlight: a transparent window cut into a dim veil via one huge shadow */}
      <motion.div
        className="absolute rounded-[18px] ring-1 ring-white/25"
        style={{ boxShadow: "0 0 0 200vmax rgb(10 9 8 / 0.62)" }}
        initial={false}
        animate={
          rect
            ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, opacity: 1 }
            : { top: "50%", left: "50%", width: 0, height: 0, opacity: 0.6 }
        }
        transition={{ duration: 0.45, ease: EASE }}
      />

      {/* caption: the instrument card, docked to the bottom */}
      <div className="absolute inset-x-0 bottom-0 flex justify-center p-4 sm:p-6" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            role="dialog"
            aria-live="polite"
            aria-label={title}
            className="instrument pointer-events-auto w-full max-w-xl rounded-card bg-raised p-5 shadow-overlay sm:p-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="kicker">
                {t("tour.start")} · {String(index + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
              </span>
              <button
                type="button"
                onClick={() => setIndex(null)}
                aria-label={t("tour.exit")}
                className="grid size-7 place-items-center rounded-control text-fg-3 transition-colors duration-fast hover:bg-fg/[0.08] hover:text-fg"
              >
                <X className="size-4" />
              </button>
            </div>
            <h2 className="display mt-3 text-28 leading-tight">{title}</h2>
            <p className="mt-2 text-14 text-fg-2">{text}</p>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-1.5" aria-hidden>
                {STEPS.map((s, i) => (
                  <span key={s.key} className={i === index ? "h-1.5 w-5 rounded-full bg-fg" : "size-1.5 rounded-full bg-fg/25"} />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="mr-2 hidden font-mono text-12 text-fg-3 sm:inline">{t("tour.keys")}</span>
                <Button variant="ghost" size="sm" onClick={() => go(index - 1)} disabled={index === 0}>
                  <ArrowLeft /> {t("tour.back")}
                </Button>
                <Button variant="primary" size="sm" onClick={() => go(index + 1)}>
                  {t(last ? "tour.finish" : "tour.next")} {!last && <ArrowRight />}
                </Button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

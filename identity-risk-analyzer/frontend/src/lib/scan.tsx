import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "./api";
import { useI18n } from "./i18n";
import type { Dashboard, Source } from "./types";

export const SCAN_STEPS = ["collecting", "analyzing", "scoring", "persisting", "done"] as const;
export type ScanStep = (typeof SCAN_STEPS)[number];
const MIN_STEP_MS = 480; // stages are real (polled from the job); we only pace their display for readability

const REVEAL_MS = 4200; // how long the finished scan is shown before moving on (skippable)

interface ScanCtx {
  source: Source;
  setSource: (s: Source) => void;
  running: boolean;
  step: ScanStep | null;
  /** the finished scan, shown by the scan scene before it closes */
  result: Dashboard | null;
  /** end the reveal early (button / Esc) */
  dismiss: () => void;
  runScan: (source?: Source) => Promise<void>;
}

const Ctx = createContext<ScanCtx | null>(null);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Demo build: the source switch is not shown in the UI, so every scan runs on the demo domain (mock).
// (Live LDAP stays available through the API / .env; a stale "ldap" choice in storage must not stick.)
function readSource(): Source {
  return "mock";
}

export function ScanProvider({ children }: { children: ReactNode }) {
  const [source, setSourceState] = useState<Source>(readSource);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState<ScanStep | null>(null);
  const [result, setResult] = useState<Dashboard | null>(null);
  const busy = useRef(false);
  const release = useRef<(() => void) | null>(null);
  const dismiss = useCallback(() => release.current?.(), []);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { t } = useI18n();

  const setSource = useCallback((s: Source) => {
    setSourceState(s);
    try {
      localStorage.setItem("ira.source", s);
    } catch {
      /* storage unavailable — keep in memory */
    }
  }, []);

  const runScan = useCallback(
    async (src?: Source) => {
      if (busy.current) return;
      busy.current = true;
      setRunning(true);
      setStep("collecting");
      try {
        const job = await api.startScan(src ?? source);
        let shown = 0;
        let shownAt = performance.now();
        let scanId: string | null = null;
        for (let guard = 0; guard < 600; guard++) {
          await sleep(160);
          const j = await api.job(job.job_id);
          if (j.stage === "failed") throw new Error(j.error ?? "scan failed");
          scanId = j.scan_id;
          const reached = SCAN_STEPS.indexOf((j.stage === "queued" ? "collecting" : j.stage) as ScanStep);
          if (shown < reached && performance.now() - shownAt >= MIN_STEP_MS) {
            shown += 1;
            shownAt = performance.now();
            setStep(SCAN_STEPS[shown]);
          }
          if (SCAN_STEPS[shown] === "done") break;
        }
        await sleep(450);
        await qc.invalidateQueries();
        const dash = scanId ? await api.dashboard(scanId, 50) : null;
        if (dash) {
          // reveal: the scene shows the new scan's blips and score, until the timer or the user moves on
          setResult(dash);
          await Promise.race([sleep(REVEAL_MS), new Promise<void>((r) => (release.current = r))]);
          release.current = null;
        }
        toast.success(t("scan.complete"), {
          description: dash
            ? t("scan.completeDesc", { score: dash.ad_security_score, findings: dash.counts.findings, objects: dash.counts.objects_at_risk })
            : undefined,
        });
        navigate("/dashboard");
      } catch (e) {
        toast.error(t("scan.failed"), { description: e instanceof Error ? e.message : String(e) });
      } finally {
        busy.current = false;
        release.current = null;
        setRunning(false);
        setStep(null);
        setResult(null);
      }
    },
    [navigate, qc, source, t],
  );

  return <Ctx.Provider value={{ source, setSource, running, step, result, dismiss, runScan }}>{children}</Ctx.Provider>;
}

export function useScan() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useScan outside ScanProvider");
  return c;
}

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "./api";
import { useI18n } from "./i18n";
import type { Source } from "./types";

export const SCAN_STEPS = ["collecting", "analyzing", "scoring", "persisting", "done"] as const;
export type ScanStep = (typeof SCAN_STEPS)[number];
const MIN_STEP_MS = 480; // stages are real (polled from the job); we only pace their display for readability

interface ScanCtx {
  source: Source;
  setSource: (s: Source) => void;
  running: boolean;
  step: ScanStep | null;
  runScan: (source?: Source) => Promise<void>;
}

const Ctx = createContext<ScanCtx | null>(null);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function readSource(): Source {
  try {
    const v = localStorage.getItem("ira.source");
    return v === "ldap" ? "ldap" : "mock";
  } catch {
    return "mock";
  }
}

export function ScanProvider({ children }: { children: ReactNode }) {
  const [source, setSourceState] = useState<Source>(readSource);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState<ScanStep | null>(null);
  const busy = useRef(false);
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
        const dash = scanId ? await api.dashboard(scanId) : null;
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
        setRunning(false);
        setStep(null);
      }
    },
    [navigate, qc, source, t],
  );

  return <Ctx.Provider value={{ source, setSource, running, step, runScan }}>{children}</Ctx.Provider>;
}

export function useScan() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useScan outside ScanProvider");
  return c;
}

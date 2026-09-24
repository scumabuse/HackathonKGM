import { AlertTriangle, Play, Radar, SearchX, WifiOff, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useScan } from "@/lib/scan";
import { Button } from "./ui/button";

/** Designed empty/error block: a quiet icon, a title, one line of help, at most one action. */
export function StateBlock({ icon: Icon, title, text, children }: { icon: LucideIcon; title: string; text?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-fg/[0.06]">
        <Icon className="size-5 text-fg-2" aria-hidden />
      </span>
      <h2 className="mt-5 text-16 font-semibold text-fg">{title}</h2>
      {text && <p className="mt-1.5 text-14 text-fg-2">{text}</p>}
      {children && <div className="mt-6 flex flex-col items-center gap-3">{children}</div>}
    </div>
  );
}

/** First run. The top bar already carries the primary "Run scan", so this action is secondary. */
export function NoScanYet({ what = "dashboard" }: { what?: "dashboard" | "findings" }) {
  const { runScan, running } = useScan();
  const { t } = useI18n();
  return (
    <StateBlock
      icon={Radar}
      title={t("states.noScanTitle")}
      text={t("states.noScanText", { what: t(what === "findings" ? "states.whatFindings" : "states.whatDashboard") })}
    >
      <Button onClick={() => runScan()} disabled={running}>
        <Play /> {t("common.runFirstScan")}
      </Button>
    </StateBlock>
  );
}

export function ErrorState({ error, children }: { error: unknown; children?: ReactNode }) {
  const { t } = useI18n();
  const offline = error instanceof ApiError && error.status === 0;
  const notFound = error instanceof ApiError && error.status === 404;
  const msg = offline ? t("states.apiUnreachable") : error instanceof Error ? error.message : String(error);
  return (
    <StateBlock
      icon={offline ? WifiOff : notFound ? SearchX : AlertTriangle}
      title={t(offline ? "states.backendUnreachable" : notFound ? "states.notFound" : "states.somethingWrong")}
      text={msg}
    >
      {offline && <code className="rounded-control bg-fg/[0.06] px-3 py-2 font-mono text-12 text-fg-2">cd backend && uvicorn app.main:app --port 8000</code>}
      {children}
    </StateBlock>
  );
}

export const isNotFound = (e: unknown) => e instanceof ApiError && e.status === 404;

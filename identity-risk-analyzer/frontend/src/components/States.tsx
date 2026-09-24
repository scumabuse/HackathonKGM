import { AlertTriangle, Play, Radar } from "lucide-react";
import type { ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useScan } from "@/lib/scan";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { RadarSweep } from "./ui/radar-sweep";

export function NoScanYet({ what = "dashboard" }: { what?: "dashboard" | "findings" }) {
  const { runScan, running } = useScan();
  const { t } = useI18n();
  return (
    <Card className="mx-auto flex max-w-xl flex-col items-center gap-5 py-12 text-center">
      <RadarSweep className="w-40" />
      <div>
        <h2 className="text-xl font-semibold">{t("states.noScanTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("states.noScanText", { what: t(what === "findings" ? "states.whatFindings" : "states.whatDashboard") })}
        </p>
      </div>
      <Button size="lg" onClick={() => runScan()} disabled={running}>
        <Play /> {t("common.runFirstScan")}
      </Button>
    </Card>
  );
}

export function ErrorState({ error, children }: { error: unknown; children?: ReactNode }) {
  const { t } = useI18n();
  const offline = error instanceof ApiError && error.status === 0;
  const msg = offline ? t("states.apiUnreachable") : error instanceof Error ? error.message : String(error);
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <Card className="mx-auto flex max-w-xl flex-col items-center gap-3 py-10 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-risk-critical/15">
        {offline ? <Radar className="size-6 text-risk-fg-critical" /> : <AlertTriangle className="size-6 text-risk-fg-critical" />}
      </div>
      <h2 className="text-lg font-semibold">{t(offline ? "states.backendUnreachable" : notFound ? "states.notFound" : "states.somethingWrong")}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{msg}</p>
      {offline && (
        <code className="rounded-lg bg-inset px-3 py-2 font-mono text-xs text-primary">cd backend && uvicorn app.main:app --port 8000</code>
      )}
      {children}
    </Card>
  );
}

export const isNotFound = (e: unknown) => e instanceof ApiError && e.status === 404;

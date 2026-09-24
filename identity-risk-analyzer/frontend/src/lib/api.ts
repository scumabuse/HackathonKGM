import type {
  AccountDetail,
  AnalysisSettings,
  AuditEntry,
  Dashboard,
  Finding,
  FindingFilters,
  FindingsPage,
  Health,
  RuleInfo,
  ScanJob,
  ScanSummary,
  SettingsPayload,
  Source,
} from "./types";

const BASE = "/api";

// Response language for localized endpoints (findings text, rule names, exports). Set by I18nProvider.
let apiLang = "ru";
export function setApiLang(lang: string) {
  apiLang = lang;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...rest,
      headers: { Accept: "application/json", ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...rest.headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, "API unreachable");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const api = {
  health: () => req<Health>("/health"),
  dashboard: (scanId = "latest") => req<Dashboard>(`/dashboard/${scanId}${qs({ lang: apiLang })}`),
  scans: () => req<ScanSummary[]>("/scans?limit=60"),
  findings: (f: FindingFilters & { limit?: number }, scanId = "latest") =>
    req<FindingsPage>(`/findings${qs({ scan_id: scanId, limit: 2000, ...f, lang: apiLang })}`),
  finding: (id: string, scanId = "latest") => req<Finding>(`/findings/${id}${qs({ scan_id: scanId, lang: apiLang })}`),
  account: (objectId: string, scanId = "latest") =>
    req<AccountDetail>(`/accounts/${objectId}${qs({ scan_id: scanId, lang: apiLang })}`),
  startScan: (source: Source) => req<ScanJob>("/scan", { method: "POST", json: { source, wait: false } }),
  job: (jobId: string) => req<ScanJob>(`/scan/jobs/${jobId}`),
  rescore: (scanId = "latest") => req<{ scan_id: string }>(`/scans/${scanId}/rescore`, { method: "POST" }),
  settings: () => req<SettingsPayload>(`/settings${qs({ lang: apiLang })}`),
  saveSettings: (s: AnalysisSettings, rescore: boolean) =>
    req<SettingsPayload>(`/settings${qs({ rescore: rescore ? "true" : undefined, lang: apiLang })}`, { method: "PUT", json: s }),
  resetSettings: () => req<SettingsPayload>(`/settings/reset${qs({ lang: apiLang })}`, { method: "POST" }),
  rules: () => req<RuleInfo[]>(`/rules${qs({ lang: apiLang })}`),
  audit: (limit = 25) => req<AuditEntry[]>(`/audit${qs({ limit })}`),
  exportUrl: (scanId: string, format: "csv" | "xlsx" | "html", f: FindingFilters = {}) =>
    `${BASE}/export/${scanId}${qs({ format, level: f.level, category: f.category, object_type: f.object_type, rule_id: f.rule_id, q: f.q, lang: apiLang })}`,
  snapshotUrl: (scanId: string) => `${BASE}/scans/${scanId}/snapshot`,
};

/** Browser download without leaving the SPA. The server writes the audit-log entry. */
export function download(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

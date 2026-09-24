// Mirrors backend/app/core/models.py and the API payloads. Keep in sync with the pydantic models.

export type RiskLevel = "Critical" | "High" | "Medium" | "Low";
export type Category = "Stale" | "Privileged" | "Passwords" | "Service" | "Config";
export type ObjectType = "user" | "computer" | "serviceAccount" | "group" | "domain" | "policy" | "host";
export type Source = "mock" | "ldap" | "snapshot";

export interface Evidence {
  attribute: string;
  value: string;
  raw?: string | null;
}

export interface WeightItem {
  rule: string;
  title: string;
  weight: number;
  matched: boolean;
}

export interface Finding {
  id: string;
  module: string;
  rule_id: string;
  category: Category;
  object_type: ObjectType;
  object_id: string;
  object_name: string;
  object_dn: string;
  title: string;
  description: string;
  recommendation: string;
  remediation_command: string | null;
  level: RiskLevel;
  score: number;
  rule_weight: number;
  k: number;
  weight_breakdown: WeightItem[];
  evidence: Evidence[];
  privilege_path: string[] | null;
  path_edges: string[] | null;
  mitre: string[];
  first_seen: string;
  last_seen: string;
}

export interface Entity {
  object_id: string;
  object_name: string;
  object_dn: string;
  object_type: ObjectType;
  display_name: string | null;
  enabled: boolean | null;
  tier0: boolean;
  privileged: boolean;
  score: number;
  level: RiskLevel;
  k: number;
  categories: Category[];
  rule_ids: string[];
  finding_count: number;
  top_title: string;
  privilege_path: string[] | null;
  path_edges: string[] | null;
  weight_breakdown: WeightItem[];
  attributes: Record<string, string>;
}

export type Counts = Record<string, number>;

export interface ScanSummary {
  scan_id: string;
  started_at: string;
  finished_at: string;
  source: string;
  domain: string;
  trigger: string;
  parent_scan_id: string | null;
  ad_security_score: number;
  counts: Counts;
  duration_ms: number;
}

export interface DiffItem {
  finding_id: string;
  rule_id: string;
  title: string;
  object_name: string;
  object_id: string;
  level: RiskLevel;
  score: number;
  previous_score?: number;
}

export interface Dashboard {
  scan: Pick<ScanSummary, "scan_id" | "started_at" | "finished_at" | "source" | "domain" | "trigger" | "parent_scan_id" | "duration_ms">;
  ad_security_score: number;
  score_band: "Good" | "Fair" | "Poor" | "Critical";
  level_counts: Record<RiskLevel, number>;
  counts: Counts;
  category_scores: Record<Category, number>;
  category_matrix: ({ category: Category; total: number } & Record<RiskLevel, number>)[];
  top_risky: Entity[];
  trend: { scan_id: string; at: string; score: number; trigger: string; findings: number }[];
  diff: null | {
    previous_scan_id: string;
    score_delta: number;
    new: number;
    resolved: number;
    worsened: number;
    improved: number;
    top_new: DiffItem[];
    top_resolved: DiffItem[];
  };
  eventlog: { status?: string; source?: string | null; detail?: string | null; events?: number };
  warnings: string[];
  timings: Record<string, number>;
  security_posture: {
    read_only: boolean;
    bind_user: string | null;
    privileges: string;
    secrets_collected: boolean;
    live_mode_available: boolean;
  };
}

export interface FindingsPage {
  scan_id: string;
  total: number;
  limit: number;
  offset: number;
  items: Finding[];
}

export interface AccountDetail {
  scan_id: string;
  domain: string;
  source: string;
  entity: Entity;
  findings: Finding[];
  mitre: string[];
  history: { scan_id: string; at: string; score: number; trigger: string }[];
}

export interface Thresholds {
  inactive_days: number;
  pwd_max_age_days: number;
  svc_pwd_max_age_days: number;
  computer_inactive_days: number;
  krbtgt_max_age_days: number;
  da_max_members: number;
  min_pwd_length: number;
  spray_min_accounts: number;
  spray_window_minutes: number;
  spray_max_attempts_per_account: number;
  brute_min_failures: number;
}

export interface AnalysisSettings {
  thresholds: Thresholds;
  levels: { critical: number; high: number; medium: number };
  service: { name_prefixes: string[]; ou_markers: string[]; spn_on_user: boolean; include_gmsa: boolean };
  k_tier0: number;
  rule_weights: Record<string, number>;
  rule_enabled: Record<string, boolean>;
  score_tau: number;
}

export interface RuleSetting {
  id: string;
  name: string;
  category: Category;
  default_weight: number;
  weight: number;
  enabled: boolean;
  mitre: string[];
  applies_to: ObjectType[];
}

export interface SettingsPayload {
  settings: AnalysisSettings;
  defaults: AnalysisSettings;
  rules: RuleSetting[];
  rescored?: { scan_id: string; ad_security_score: number; parent_scan_id: string };
}

export interface ScanJob {
  job_id: string;
  source: string;
  trigger: string;
  stage: "queued" | "collecting" | "analyzing" | "scoring" | "persisting" | "done" | "failed";
  stages: string[];
  stages_seen: string[];
  scan_id: string | null;
  error: string | null;
}

export interface Health {
  status: string;
  version: string;
  scans: number;
  read_only: boolean;
  least_privilege: string;
  config: {
    source: Source;
    ldap_configured: boolean;
    ldap_url: string | null;
    ldap_auth: string;
    ldap_bind_user: string | null;
    ldap_tls: boolean;
    eventlog_mode: string;
    schedule_interval_minutes: number;
  };
}

export interface AuditEntry {
  id: number;
  ts: string;
  actor: string;
  action: string;
  target: string | null;
  client_ip: string | null;
  details: Record<string, unknown>;
}

export interface FindingFilters {
  level?: string;
  category?: string;
  object_type?: string;
  rule_id?: string;
  q?: string;
  sort?: string;
  order?: "asc" | "desc";
}

export interface RuleInfo {
  id: string;
  name: string;
  category: Category;
  weight: number;
  default_weight: number;
  level_hint: RiskLevel;
  title: string;
  mitre: string[];
  applies_to: ObjectType[];
  enabled: boolean;
}

"""Single source of truth for the platform data model.

Every Infrastructure Risk Radar module (identity today; certificate/dns/patch/backup later)
emits `Finding`s and `ScanResult`s in exactly this shape.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class RiskLevel(str, Enum):
    CRITICAL = "Critical"  # score >= 80
    HIGH = "High"  # 60-79
    MEDIUM = "Medium"  # 30-59
    LOW = "Low"  # < 30


LEVEL_ORDER = {RiskLevel.CRITICAL: 3, RiskLevel.HIGH: 2, RiskLevel.MEDIUM: 1, RiskLevel.LOW: 0}

Category = Literal["Stale", "Privileged", "Passwords", "Service", "Config"]
ObjectType = Literal["user", "computer", "serviceAccount", "group", "domain", "policy", "host"]


class Evidence(BaseModel):
    attribute: str  # e.g. "pwdLastSet"
    value: str  # human-readable, e.g. "730 days ago (2024-01-15)"
    raw: str | None = None  # raw attribute value for auditors
    attribute_i18n: dict[str, str] = {}  # {"ru": ..., "kk": ...} when the label is translatable
    value_i18n: dict[str, str] = {}


class WeightItem(BaseModel):
    rule: str
    title: str
    weight: float
    matched: bool
    title_i18n: dict[str, str] = {}


class Finding(BaseModel):
    id: str  # stable hash(rule_id + object_dn)
    module: str = "identity"  # future: "certificate", "dns"...
    rule_id: str  # e.g. "AD-SVC-PNE"
    category: Category
    object_type: ObjectType
    object_id: str  # stable hash(object_dn) -> used in URLs
    object_name: str  # sAMAccountName
    object_dn: str
    title: str
    description: str
    recommendation: str
    remediation_command: str | None = None  # PowerShell TEXT ONLY, never executed
    level: RiskLevel  # level of the object cluster this finding belongs to
    score: int  # 0-100 object risk score (this object, this finding cluster)
    rule_weight: float  # weight of this single rule (after settings overrides)
    k: float = 1.0  # criticality multiplier applied to the object
    weight_breakdown: list[WeightItem]  # the "why 85" panel
    evidence: list[Evidence]
    privilege_path: list[str] | None = None  # ["ivanov","IT-Support","Helpdesk-L2","Domain Admins"]
    path_edges: list[str] | None = None  # edge labels between path nodes: "member" | "primaryGroupID"
    mitre: list[str] = []
    first_seen: datetime
    last_seen: datetime
    # {"ru": {"title", "description", "recommendation"}, "kk": {...}} — English is in the main fields
    i18n: dict[str, dict[str, str]] = {}


class Entity(BaseModel):
    """A scored object (account, computer, group, policy...) — the per-object roll-up."""

    object_id: str
    object_name: str
    object_dn: str
    object_type: ObjectType
    display_name: str | None = None
    enabled: bool | None = None
    tier0: bool = False
    privileged: bool = False
    score: int
    level: RiskLevel
    k: float = 1.0
    categories: list[str]
    rule_ids: list[str]
    finding_count: int
    top_title: str
    top_title_i18n: dict[str, str] = {}
    privilege_path: list[str] | None = None
    path_edges: list[str] | None = None
    weight_breakdown: list[WeightItem] = []
    attributes: dict[str, str] = {}  # safe, human-readable header facts (no secrets)
    attributes_i18n: dict[str, dict[str, str]] = {}  # {"ru": {label: value}, "kk": {...}}


class ScanResult(BaseModel):
    scan_id: str
    started_at: datetime
    finished_at: datetime
    source: str  # "mock" | "ldap://dc.lab.local" | "snapshot:<id>"
    domain: str
    ad_security_score: int  # 0-100, HIGHER IS BETTER (domain health)
    counts: dict[str, int]
    category_scores: dict[str, float]  # penalty per category (0..20)
    findings: list[Finding]
    entities: list[Entity] = []
    trigger: str = "manual"  # manual | rescore | scheduled | seed | replay
    parent_scan_id: str | None = None
    meta: dict[str, Any] = {}


# ---------------------------------------------------------------------------------
# Rules & runtime (tunable) analysis settings
# ---------------------------------------------------------------------------------
class RuleText(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    title: str | None = None
    description: str | None = None
    recommendation: str | None = None


class RuleDef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[A-Z0-9]+(-[A-Z0-9]+)+$")
    name: str  # short static label (catalog, "why this score" panel)
    category: Category
    weight: float = Field(ge=0.0, le=1.0)
    level_hint: RiskLevel
    title: str  # may contain {placeholders}
    description: str
    recommendation: str
    remediation_command: str | None = None
    mitre: list[str] = []
    applies_to: list[ObjectType]
    enabled: bool = True
    listed_when_unmatched: bool = True  # show as "not matched" in the breakdown of every applicable object
    analyzer: str  # users | service | privileges | passwords | extra (set from the YAML file header)
    i18n: dict[str, RuleText] = {}  # translations from rules/i18n/<lang>.yaml


class Thresholds(BaseModel):
    inactive_days: int = Field(90, ge=1, le=3650)
    pwd_max_age_days: int = Field(365, ge=1, le=3650)
    svc_pwd_max_age_days: int = Field(365, ge=1, le=3650)
    computer_inactive_days: int = Field(90, ge=1, le=3650)
    krbtgt_max_age_days: int = Field(180, ge=1, le=3650)
    da_max_members: int = Field(5, ge=1, le=500)
    min_pwd_length: int = Field(12, ge=1, le=128)
    spray_min_accounts: int = Field(10, ge=2, le=1000)
    spray_window_minutes: int = Field(30, ge=1, le=1440)
    spray_max_attempts_per_account: int = Field(2, ge=1, le=20)
    brute_min_failures: int = Field(15, ge=2, le=10000)


class LevelCutoffs(BaseModel):
    critical: int = Field(80, ge=1, le=100)
    high: int = Field(60, ge=1, le=100)
    medium: int = Field(30, ge=1, le=100)

    @model_validator(mode="after")
    def _ordered(self) -> "LevelCutoffs":
        if not (self.critical > self.high > self.medium):
            raise ValueError("level cutoffs must satisfy critical > high > medium")
        return self


class ServiceHeuristics(BaseModel):
    name_prefixes: list[str] = ["svc_", "svc-", "sa_", "srv_"]
    ou_markers: list[str] = ["OU=Service Accounts"]
    spn_on_user: bool = True
    include_gmsa: bool = True

    @field_validator("name_prefixes", "ou_markers")
    @classmethod
    def _strip(cls, v: list[str]) -> list[str]:
        return [x.strip() for x in v if x and x.strip()]


class AnalysisSettings(BaseModel):
    thresholds: Thresholds = Thresholds()
    levels: LevelCutoffs = LevelCutoffs()
    service: ServiceHeuristics = ServiceHeuristics()
    k_tier0: float = Field(1.2, ge=1.0, le=2.0)
    rule_weights: dict[str, float] = {}  # rule_id -> weight override (0..1)
    rule_enabled: dict[str, bool] = {}  # rule_id -> enabled override
    score_tau: float = Field(6.0, gt=0.0, le=100.0)  # AD Security Score saturation constant

    @field_validator("rule_weights")
    @classmethod
    def _weights_in_range(cls, v: dict[str, float]) -> dict[str, float]:
        for rid, w in v.items():
            if not 0.0 <= float(w) <= 1.0:
                raise ValueError(f"weight for {rid} must be within 0..1")
        return {k: float(w) for k, w in v.items()}


class RuleHit(BaseModel):
    """Internal: what an analyzer emits before the risk engine scores it."""

    rule_id: str
    object_type: ObjectType
    object_name: str
    object_dn: str
    evidence: list[Evidence] = []
    privilege_path: list[str] | None = None
    path_edges: list[str] | None = None
    template_vars: dict[str, str | dict[str, str]] = {}  # dict value = per-language text {"en","ru","kk"}

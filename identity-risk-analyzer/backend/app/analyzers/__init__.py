"""Identity module (Active Directory) — plugs into the generic pipeline in core/pipeline.py.

A future Radar module (certificates, DNS, ...) provides the same four hooks:
`analyze`, `object_meta`, `counts` and `domain_of`.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from ..core.constants import UAC
from ..core.i18n import TRANSLATED, Localized, ago, join, lit, tr
from ..core.models import AnalysisSettings, RuleHit
from . import extra_analyzer, password_analyzer, privilege_analyzer, service_analyzer, user_analyzer
from .context import AnalysisContext

ANALYZERS = {
    "users": user_analyzer.analyze,
    "service": service_analyzer.analyze,
    "privileges": privilege_analyzer.analyze,
    "passwords": password_analyzer.analyze,
    "extra": extra_analyzer.analyze,
}


@dataclass
class ObjectMeta:
    k_tier0: bool = False
    tier0: bool = False
    privileged: bool = False
    enabled: bool | None = None
    display_name: str | None = None
    object_sid: str | None = None
    attributes: dict[str, str] = field(default_factory=dict)
    attributes_i18n: dict[str, dict[str, str]] = field(default_factory=dict)


def _facts(pairs: list[tuple[str, Localized | str]]) -> tuple[dict[str, str], dict[str, dict[str, str]]]:
    """[(fact-key, value)] -> (English {label: value}, {lang: {label: value}})."""
    en: dict[str, str] = {}
    other: dict[str, dict[str, str]] = {lang: {} for lang in TRANSLATED}
    for key, value in pairs:
        label = tr(key)
        val = value if isinstance(value, dict) else lit(value)
        en[label["en"]] = val["en"]
        for lang in TRANSLATED:
            other[lang][label[lang]] = val[lang]
    return en, other


def _uac_flags(uac: int) -> str:
    return ", ".join(n for n, bit in UAC.items() if uac & bit and n != "NORMAL_ACCOUNT")


class IdentityModule:
    module = "identity"

    def __init__(self, snapshot: dict[str, Any], settings: AnalysisSettings, now=None) -> None:
        self.ctx = AnalysisContext(snapshot, settings, now=now)

    def analyze(self) -> list[RuleHit]:
        hits: list[RuleHit] = []
        for fn in ANALYZERS.values():
            hits.extend(fn(self.ctx))
        return hits

    def domain_of(self) -> str:
        return self.ctx.domain

    def template_base(self) -> dict[str, str]:
        return {"domain": self.ctx.domain, "domain_dn": self.ctx.domain_dn,
                **{k: str(v) for k, v in self.ctx.t.model_dump().items()}}

    def object_meta(self, dn: str, object_type: str) -> ObjectMeta:
        ctx = self.ctx
        p = ctx.principal_by_dn.get(dn.lower())
        if p is not None:
            best = ctx.best_path(p)
            days, never = ctx.inactivity(p)
            tier = "val.tier0" if p.tier0 else ("val.privileged" if p.privileged else "val.standard")
            facts: list[tuple[str, Localized | str]] = [
                ("fact.status", tr("val.enabled" if p.enabled else "val.disabled")),
                ("fact.tier", tr(tier)),
                ("fact.last_logon", tr("never") if never else ago(p.last_logon, ctx.now)),
                ("fact.pwd_last_set", ago(p.pwd_last_set, ctx.now) if p.rec.get("pwdLastSet") else tr("val.must_change")),
                ("fact.created", p.when_created.date().isoformat() if p.when_created else tr("unknown")),
                ("fact.ou", ctx.ou_path(p.dn)),
                ("fact.uac_flags", _uac_flags(p.uac) or tr("none")),
            ]
            pg = ctx.group_by_sid.get(f"{ctx.domain_sid}-{p.rec.get('primaryGroupID')}")
            if pg is not None:
                facts.append(("fact.primary_group", f"{pg.get('sAMAccountName')} ({p.rec.get('primaryGroupID')})"))
            if p.service_reasons:
                facts.append(("fact.service_detection", join(p.service_reasons)))
            if p.crit:
                facts.append(("fact.critical_groups", ", ".join(sorted({m.group_name for m in p.crit.values()}))))
            if best is not None:
                facts.append(("fact.escalation_path", best.text))
            for key, label in (("department", "fact.department"), ("title", "fact.title"), ("operatingSystem", "fact.os"),
                               ("dNSHostName", "fact.dns_name")):
                if p.rec.get(key):
                    facts.append((label, str(p.rec[key])))
            if p.rec.get("servicePrincipalName"):
                facts.append(("fact.spns", str(len(p.rec["servicePrincipalName"]))))
            en, other = _facts(facts)
            return ObjectMeta(k_tier0=p.tier0, tier0=p.tier0, privileged=p.privileged, enabled=p.enabled,
                              display_name=p.display_name, object_sid=p.sid, attributes=en, attributes_i18n=other)
        g = ctx.group_by_dn.get(dn.lower())
        if g is not None:
            sid = g.get("objectSid")
            crit = ctx.critical.get(sid)
            tier0 = bool(crit and crit[0] in (512, 518, 519, 544))
            facts = [("fact.type", tr("val.critical_group" if crit else "val.group")),
                     ("fact.ou", ctx.ou_path(g["distinguishedName"])),
                     ("fact.direct_members", str(len(g.get("member") or [])))]
            if crit:
                facts.append(("fact.effective_members", str(len(ctx.group_members_effective(sid)))))
            en, other = _facts(facts)
            return ObjectMeta(k_tier0=tier0, tier0=tier0, privileged=bool(crit), display_name=g.get("sAMAccountName"),
                              object_sid=sid, attributes=en, attributes_i18n=other)
        if object_type == "domain":
            d = ctx.domain_rec
            en, other = _facts([
                ("fact.type", tr("val.domain_root")),
                ("fact.functional_level", str(d.get("msDS-Behavior-Version"))),
            ])
            for attr in ("minPwdLength", "lockoutThreshold", "pwdHistoryLength"):  # LDAP names stay untranslated
                en[attr] = str(d.get(attr))
                for lang in other:
                    other[lang][attr] = str(d.get(attr))
            return ObjectMeta(k_tier0=True, tier0=True, display_name=ctx.domain, object_sid=ctx.domain_sid,
                              attributes=en, attributes_i18n=other)
        if object_type == "policy":
            en, other = _facts([("fact.type", tr("val.pso"))])
            return ObjectMeta(display_name=dn.split(",")[0].split("=", 1)[-1], attributes=en, attributes_i18n=other)
        if object_type == "host":
            en, other = _facts([("fact.type", tr("val.auth_source"))])
            return ObjectMeta(display_name=dn.removeprefix("ip:"), attributes=en, attributes_i18n=other)
        return ObjectMeta()

    def counts(self, rule_objects: dict[str, set[str]]) -> dict[str, int]:
        ctx = self.ctx

        def n(rule_id: str) -> int:
            return len(rule_objects.get(rule_id, set()))

        stale = set().union(*(rule_objects.get(r, set()) for r in
                              ("AD-USR-INACTIVE", "AD-CMP-INACTIVE", "AD-SVC-UNUSED", "AD-PRIV-INACTIVE")))
        accounts = [p for p in ctx.principals if p.kind != "computers"]
        return {
            "stale": len(stale),
            "service": len(ctx.service_accounts()),
            "privileged": sum(1 for p in accounts if p.privileged),
            "computers": len(ctx.computers()),
            "users": len(ctx.users()),
            "groups": len(ctx.groups),
            "tier0": sum(1 for p in accounts if p.tier0),
            "inactive_users": n("AD-USR-INACTIVE"),
            "service_pne": n("AD-SVC-PNE"),
            "disabled_privileged": n("AD-PRIV-DISABLED"),
            "excessive_rights": n("AD-PRIV-NESTED"),
            "hidden_admins": n("AD-PRIV-HIDDEN-PGID"),
            "asrep_roastable": n("AD-PWD-ASREP"),
            "kerberoastable": n("AD-SVC-KERBEROAST"),
            "inactive_computers": n("AD-CMP-INACTIVE"),
            "spray_sources": n("AD-AUTH-SPRAY"),
            "brute_force_targets": n("AD-AUTH-BRUTE"),
        }

    def meta(self) -> dict[str, Any]:
        snap = self.ctx.snapshot
        auth = snap.get("auth_events") or {}
        return {
            "collector": {k: v for k, v in (snap.get("collector") or {}).items()},
            "collected_at": snap.get("collected_at"),
            "analysis_now": self.ctx.now.isoformat(),
            "warnings": self.ctx.warnings,
            "eventlog": {"status": auth.get("status", "unavailable"), "source": auth.get("source"),
                         "detail": auth.get("detail"), "events": len(auth.get("events") or [])},
            "in_chain_crosscheck": self.ctx.in_chain_available,
        }

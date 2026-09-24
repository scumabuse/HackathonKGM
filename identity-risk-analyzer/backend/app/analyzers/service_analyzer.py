"""Service accounts — spec 2.3.2.

There is no native "service account" flag, so detection is heuristic (configurable): SPN on a
user object, name prefixes (svc_/sa_/srv_), a designated OU, or the gMSA object class.
gMSAs have 120-char auto-rotated passwords, so password/Kerberoast rules do not apply to them.
"""
from __future__ import annotations

from ..core.constants import INTERACTIVE_LOGON_TYPES
from ..core.i18n import ago, ev, join, tr
from ..core.models import Evidence, RuleHit
from .context import AnalysisContext, Principal
from .user_analyzer import logon_evidence, uac_evidence


def _hit(rule_id: str, p: Principal, evidence: list[Evidence], path=None, edges=None, **vars: object) -> RuleHit:
    return RuleHit(rule_id=rule_id, object_type="serviceAccount", object_name=p.sam, object_dn=p.dn,
                   evidence=evidence, privilege_path=path, path_edges=edges,
                   template_vars={k: v if isinstance(v, dict) else str(v) for k, v in vars.items()})


def interactive_logons(ctx: AnalysisContext) -> dict[str, list[dict]]:
    """4624 events with LogonType 2 (interactive) / 10 (RDP), keyed by lower-case account."""
    out: dict[str, list[dict]] = {}
    for e in (ctx.snapshot.get("auth_events") or {}).get("events", []):
        if e.get("event_id") == 4624 and e.get("logon_type") in INTERACTIVE_LOGON_TYPES:
            out.setdefault((e.get("target_user") or "").lower(), []).append(e)
    return out


def analyze(ctx: AnalysisContext) -> list[RuleHit]:
    t = ctx.t
    hits: list[RuleHit] = []
    observed = interactive_logons(ctx)
    for p in ctx.service_accounts():
        if not p.enabled:
            continue
        detect_ev = ev(tr("attr.detection"), tr("svc_detection", reasons=join(p.service_reasons)))

        spns = p.rec.get("servicePrincipalName") or []
        if spns and not p.is_gmsa:
            enc = p.rec.get("msDS-SupportedEncryptionTypes")
            hits.append(_hit("AD-SVC-KERBEROAST", p, [
                ev("servicePrincipalName", ", ".join(spns[:4]) + (" …" if len(spns) > 4 else ""), raw="; ".join(spns)),
                ev("msDS-SupportedEncryptionTypes", str(enc) if enc else tr("enc_not_set")),
                detect_ev], spn=spns[0]))

        if not p.is_gmsa:
            seen = observed.get(p.sam.lower(), [])
            workstations = p.rec.get("userWorkstations")
            if seen or not workstations:
                evid = [ev("userWorkstations", workstations or tr("workstations_empty"))]
                reason = tr("interactive_reason_ldap")
                if seen:
                    last = seen[-1]
                    evid.append(ev(tr("attr.security_log_4624"), tr(
                        "interactive_seen", n=len(seen), type=last.get("logon_type"),
                        src=last.get("workstation") or last.get("source_ip"), time=last.get("time", "")[:16])))
                    reason = tr("interactive_reason_log", n=len(seen), type=last.get("logon_type"))
                hits.append(_hit("AD-SVC-INTERACTIVE", p, evid, interactive_reason=reason))

        path = ctx.best_path(p)
        if path is not None:
            groups = sorted({m.group_name for m in p.crit.values()})
            hits.append(_hit("AD-SVC-PRIV", p, [
                ev(tr("attr.effective_membership"), path.text, raw=" | ".join(path.dns)),
                ev(tr("attr.critical_groups"), ", ".join(groups)),
                ev("adminCount", str(p.rec.get("adminCount") or 0))],
                path=path.nodes, edges=path.edges, target_group=path.group_name,
                via_group=path.nodes[1] if len(path.nodes) > 1 else path.group_name, path_text=path.text))

        if p.flag("DONT_EXPIRE_PASSWD") and not p.is_gmsa:
            hits.append(_hit("AD-SVC-PNE", p, [uac_evidence(p, "DONT_EXPIRE_PASSWD"), detect_ev]))

        age = ctx.pwd_age_days(p)
        if age is not None and age > t.svc_pwd_max_age_days and not p.is_gmsa:
            hits.append(_hit("AD-SVC-PWD-OLD", p, [ev("pwdLastSet", ago(p.pwd_last_set, ctx.now),
                                                      raw=str(p.rec.get("pwdLastSet")))], pwd_age_days=age))

        if not p.is_gmsa and not (p.rec.get("managedBy") or p.rec.get("manager")):
            hits.append(_hit("AD-SVC-NO-OWNER", p, [ev("managedBy / manager", tr("empty"))]))

        days, _never = ctx.inactivity(p)
        if days is not None and days > t.inactive_days:
            hits.append(_hit("AD-SVC-UNUSED", p, logon_evidence(ctx, p), days_inactive=days))
    return hits

"""User account hygiene — spec 2.3.1.

Population: enabled human user accounts (service accounts and krbtgt are handled elsewhere).
Privileged users are excluded from the plain "inactive" rule because the privilege analyzer
flags them with the heavier AD-PRIV-INACTIVE rule instead.
"""
from __future__ import annotations

from ..collectors.adtypes import days_since, filetime_to_datetime
from ..core.constants import UAC, UAC_COMPUTED
from ..core.i18n import Localized, ago, concat, ev, tr
from ..core.models import Evidence, RuleHit
from .context import AnalysisContext, Principal


def _hit(rule_id: str, p: Principal, evidence: list[Evidence], **vars: object) -> RuleHit:
    return RuleHit(rule_id=rule_id, object_type=p.object_type, object_name=p.sam, object_dn=p.dn,
                   evidence=evidence, template_vars={k: v if isinstance(v, dict) else str(v) for k, v in vars.items()})


def logon_evidence(ctx: AnalysisContext, p: Principal) -> list[Evidence]:
    days, never = ctx.inactivity(p)
    if never:
        return [
            ev("lastLogonTimestamp", tr("never_logged_on"), raw=str(p.rec.get("lastLogonTimestamp"))),
            ev("whenCreated", ago(p.when_created, ctx.now), raw=p.rec.get("whenCreated")),
        ]
    return [ev("lastLogonTimestamp", concat(ago(p.last_logon, ctx.now), tr("replication_note")),
               raw=str(p.rec.get("lastLogonTimestamp")))]


def flag_value(flag: str, bit: int) -> Localized:
    return tr("flag_set", flag=flag, hex=f"{bit:X}")


def uac_evidence(p: Principal, flag: str) -> Evidence:
    return ev("userAccountControl", flag_value(flag, UAC[flag]), raw=f"{p.uac} (0x{p.uac:X})")


def analyze(ctx: AnalysisContext) -> list[RuleHit]:
    t = ctx.t
    hits: list[RuleHit] = []
    for p in ctx.regular_users():
        if not p.enabled:
            continue

        days, never = ctx.inactivity(p)
        if not p.privileged and days is not None and days > t.inactive_days:
            hits.append(_hit("AD-USR-INACTIVE", p, logon_evidence(ctx, p), days_inactive=days))

        if p.flag("DONT_EXPIRE_PASSWD"):
            hits.append(_hit("AD-USR-PNE", p, [uac_evidence(p, "DONT_EXPIRE_PASSWD")]))

        age = ctx.pwd_age_days(p)
        if age is not None and age > t.pwd_max_age_days:
            hits.append(_hit("AD-USR-PWD-OLD", p, [ev("pwdLastSet", ago(p.pwd_last_set, ctx.now),
                                                      raw=str(p.rec.get("pwdLastSet")))], pwd_age_days=age))

        computed = int(p.rec.get("msDS-User-Account-Control-Computed") or 0)
        lockout_time = filetime_to_datetime(p.rec.get("lockoutTime"))
        if computed & UAC_COMPUTED["LOCKOUT"]:
            evid = [ev("msDS-User-Account-Control-Computed", flag_value("LOCKOUT", UAC_COMPUTED["LOCKOUT"]), raw=str(computed))]
            if lockout_time:
                evid.append(ev("lockoutTime", lockout_time.strftime("%Y-%m-%d %H:%M UTC"), raw=str(p.rec.get("lockoutTime"))))
            if p.rec.get("badPwdCount"):
                evid.append(ev("badPwdCount", str(p.rec.get("badPwdCount"))))
            hits.append(_hit("AD-USR-LOCKED", p, evid))

        if computed & UAC_COMPUTED["PASSWORD_EXPIRED"] and not p.flag("DONT_EXPIRE_PASSWD"):
            hits.append(_hit("AD-USR-PWD-EXPIRED", p, [
                ev("msDS-User-Account-Control-Computed", flag_value("PASSWORD_EXPIRED", UAC_COMPUTED["PASSWORD_EXPIRED"]),
                   raw=str(computed)),
                ev("pwdLastSet", ago(p.pwd_last_set, ctx.now))]))

        expires = filetime_to_datetime(p.rec.get("accountExpires"))
        if expires is not None and expires < ctx.now:
            hits.append(_hit("AD-USR-EXPIRED", p, [ev("accountExpires", ago(expires, ctx.now),
                                                      raw=str(p.rec.get("accountExpires")))],
                             expired_days=days_since(expires, ctx.now)))
    return hits

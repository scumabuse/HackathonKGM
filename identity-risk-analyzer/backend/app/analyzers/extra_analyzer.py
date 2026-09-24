"""Extra checks — spec 2.3.5 (P2, all five implemented).

Inactive computers, sIDHistory, unconstrained delegation on non-DCs, krbtgt password age,
duplicate SPNs.
"""
from __future__ import annotations

from collections import defaultdict

from ..core.constants import RID_KRBTGT
from ..core.i18n import ago, ev, tr
from ..core.models import RuleHit
from .context import AnalysisContext
from .user_analyzer import logon_evidence, uac_evidence


def analyze(ctx: AnalysisContext) -> list[RuleHit]:
    t = ctx.t
    hits: list[RuleHit] = []

    for c in ctx.computers():
        if not c.enabled or c.is_dc:
            continue
        days, _never = ctx.inactivity(c)
        if days is not None and days > t.computer_inactive_days:
            hits.append(RuleHit(rule_id="AD-CMP-INACTIVE", object_type="computer", object_name=c.sam, object_dn=c.dn,
                                evidence=[*logon_evidence(ctx, c),
                                          ev("operatingSystem", c.rec.get("operatingSystem") or tr("unknown"))],
                                template_vars={"days_inactive": str(days)}))

    for rec_owner in [*ctx.principals]:
        if rec_owner.rec.get("sIDHistory"):
            sids = rec_owner.rec["sIDHistory"]
            hits.append(RuleHit(rule_id="AD-EXT-SIDHISTORY", object_type=rec_owner.object_type, object_name=rec_owner.sam,
                                object_dn=rec_owner.dn,
                                evidence=[ev("sIDHistory", ", ".join(sids))],
                                template_vars={"sid_history": sids[0]}))
    for g in ctx.groups:
        if g.get("sIDHistory"):
            hits.append(RuleHit(rule_id="AD-EXT-SIDHISTORY", object_type="group", object_name=g.get("sAMAccountName") or "",
                                object_dn=g["distinguishedName"],
                                evidence=[ev("sIDHistory", ", ".join(g["sIDHistory"]))],
                                template_vars={"sid_history": g["sIDHistory"][0]}))

    for p in ctx.principals:
        if p.enabled and p.flag("TRUSTED_FOR_DELEGATION") and not p.is_dc:
            hits.append(RuleHit(rule_id="AD-EXT-UNCONSTRAINED", object_type=p.object_type, object_name=p.sam, object_dn=p.dn,
                                evidence=[uac_evidence(p, "TRUSTED_FOR_DELEGATION"),
                                          ev(tr("attr.domain_controller"), tr("no"))]))

    for p in ctx.users():
        if p.rid == RID_KRBTGT:
            age = ctx.pwd_age_days(p)
            if age is not None and age > t.krbtgt_max_age_days:
                hits.append(RuleHit(rule_id="AD-EXT-KRBTGT-OLD", object_type="user", object_name=p.sam, object_dn=p.dn,
                                    evidence=[ev("pwdLastSet", ago(p.pwd_last_set, ctx.now), raw=str(p.rec.get("pwdLastSet")))],
                                    template_vars={"pwd_age_days": str(age)}))

    holders: dict[str, list] = defaultdict(list)
    for p in ctx.principals:
        for spn in p.rec.get("servicePrincipalName") or []:
            holders[spn.lower()].append((spn, p))
    for _key, items in holders.items():
        owners = {p.dn.lower(): (spn, p) for spn, p in items}
        if len(owners) < 2:
            continue
        for spn, p in owners.values():
            others = ", ".join(sorted(o.sam for s, o in owners.values() if o.dn != p.dn))
            hits.append(RuleHit(rule_id="AD-EXT-DUP-SPN", object_type=p.object_type, object_name=p.sam, object_dn=p.dn,
                                evidence=[ev("servicePrincipalName", spn), ev(tr("attr.also_registered"), others)],
                                template_vars={"spn": spn, "other_holders": others}))
    return hits

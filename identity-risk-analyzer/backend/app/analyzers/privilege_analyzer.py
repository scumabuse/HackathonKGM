"""Privileged access — spec 2.3.3 (the core of the tool).

Critical groups are resolved by RID/SID; membership is resolved by walking the group graph
(so we can show the escalation path) AND cross-checked against LDAP_IN_CHAIN results.
Hidden membership via primaryGroupID — invisible in the group's `member` attribute — is
detected explicitly.
"""
from __future__ import annotations

from ..core.constants import RID_ADMINISTRATOR, RID_ADMINISTRATORS, RID_DOMAIN_ADMINS, RID_KRBTGT
from ..core.i18n import LANGS, Localized, concat, ev, lit, tr
from ..core.models import Evidence, RuleHit
from .context import AnalysisContext, MembershipPath, Principal
from .user_analyzer import flag_value, logon_evidence


def _hit(rule_id: str, p: Principal, evidence: list[Evidence], path: MembershipPath | None = None, **vars: object) -> RuleHit:
    if path is not None:
        vars.setdefault("target_group", path.group_name)
        vars.setdefault("via_group", path.nodes[1] if len(path.nodes) > 1 else path.group_name)
        vars.setdefault("path_text", path.text)
    return RuleHit(rule_id=rule_id, object_type=p.object_type, object_name=p.sam, object_dn=p.dn,
                   evidence=evidence, privilege_path=path.nodes if path else None,
                   path_edges=path.edges if path else None,
                   template_vars={k: v if isinstance(v, dict) else str(v) for k, v in vars.items()})


def _path_evidence(p: Principal, path: MembershipPath) -> list[Evidence]:
    groups = sorted({m.group_name for m in p.crit.values()})
    return [ev(tr("attr.effective_membership"), path.text, raw=" | ".join(d for d in path.dns if d)),
            ev(tr("attr.critical_groups_reached"), ", ".join(groups))]


def analyze(ctx: AnalysisContext) -> list[RuleHit]:
    t = ctx.t
    hits: list[RuleHit] = []
    accounts = [p for p in ctx.users() + [x for x in ctx.principals if x.kind == "gmsa"] if p.rid != RID_KRBTGT]

    for p in accounts:
        path = ctx.best_path(p)

        # --- hidden membership via primaryGroupID -------------------------------------------
        pgid = p.rec.get("primaryGroupID")
        pg_sid = f"{ctx.domain_sid}-{pgid}" if pgid else None
        if p.enabled and pg_sid in ctx.critical:
            pg_path = p.crit.get(pg_sid)
            _, group = ctx.critical[pg_sid]
            listed = any(m.lower() == p.dn.lower() for m in group.get("member") or [])
            if not listed and pg_path is not None:
                hits.append(_hit("AD-PRIV-HIDDEN-PGID", p, [
                    ev("primaryGroupID", f"{pgid} → {pg_path.group_name}", raw=str(pgid)),
                    ev(f"{pg_path.group_name}.member", tr("not_listed")),
                    ev("LDAP_IN_CHAIN", tr("in_chain_misses")),
                ], path=pg_path, pgid=pgid))

        if path is None:
            # --- orphaned AdminSDHolder protection ---------------------------------------------
            if p.enabled and int(p.rec.get("adminCount") or 0) == 1 and not p.is_gmsa:
                hits.append(_hit("AD-PRIV-ADMINCOUNT-ORPHAN", p, [
                    ev("adminCount", "1", raw="1"),
                    ev(tr("attr.effective_membership"), tr("no_protected_group"))]))
            continue

        # --- disabled but still privileged ------------------------------------------------------
        if not p.enabled:
            hits.append(_hit("AD-PRIV-DISABLED", p, [
                ev("userAccountControl", flag_value("ACCOUNTDISABLE", 0x2), raw=str(p.uac)),
                *_path_evidence(p, path)], path=path))
            continue

        if p.is_service:
            continue  # service accounts: elevated rights handled by AD-SVC-PRIV

        # --- nested-group escalation (no direct admin membership at all) -------------------------
        has_direct = any(m.direct or m.via_primary_group for m in p.crit.values())
        if not has_direct and path.nested:
            member_of = ", ".join(sorted(ctx._name(g.lower()) for g in p.rec.get("memberOf") or [])) or "—"
            hits.append(_hit("AD-PRIV-NESTED", p, [
                *_path_evidence(p, path),
                ev(tr("attr.direct_admin"), tr("rights_only_nesting")),
                ev("memberOf", member_of)],
                path=path, escalation_group=path.nodes[-2], target_sid=path.group_sid))

        # --- inactive privileged account ----------------------------------------------------------
        days, _never = ctx.inactivity(p)
        if days is not None and days > t.inactive_days:
            hits.append(_hit("AD-PRIV-INACTIVE", p, [*logon_evidence(ctx, p), *_path_evidence(p, path)],
                             path=path, days_inactive=days))

        # --- stacked admin roles --------------------------------------------------------------------
        if p.rid != RID_ADMINISTRATOR:
            direct = sorted({m.group_name for m in p.crit.values() if m.direct and m.group_rid != RID_ADMINISTRATORS})
            if len(direct) >= 2:
                hits.append(_hit("AD-PRIV-MULTI", p, [ev(tr("attr.direct_admin"), ", ".join(direct))],
                                 group_count=len(direct), group_list=", ".join(direct)))

    # --- oversized Domain Admins ----------------------------------------------------------------
    da_sid = ctx.critical_sid(RID_DOMAIN_ADMINS)
    if da_sid:
        _, da = ctx.critical[da_sid]
        members = ctx.group_members_effective(da_sid)
        if len(members) > t.da_max_members:
            def how(m: Principal) -> Localized:
                mp = m.crit[da_sid]
                kind = tr("kind_pgid") if mp.via_primary_group else tr("kind_nested" if mp.nested else "kind_direct")
                return concat(f"{m.sam} (", kind, tr("kind_disabled") if not m.enabled else lit(""), ")")

            parts = [how(m) for m in sorted(members, key=lambda x: x.sam.lower())]
            listing = {lang: ", ".join(x[lang] for x in parts) for lang in LANGS}
            hits.append(RuleHit(
                rule_id="AD-PRIV-DA-OVERSIZED", object_type="group", object_name=da.get("sAMAccountName") or "Domain Admins",
                object_dn=da["distinguishedName"],
                evidence=[ev(tr("attr.effective_members"), str(len(members))), ev(tr("attr.members"), listing)],
                template_vars={"member_count": str(len(members)), "object_sid": da_sid}))
    return hits

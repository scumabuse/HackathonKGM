"""Shared, precomputed view of a snapshot that every AD analyzer reads.

Builds the group graph once, resolves critical groups by RID/SID (locale-proof), computes each
principal's effective critical memberships with the *shortest escalation path*, and cross-checks
the graph walk against LDAP_IN_CHAIN results.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from ..collectors.adtypes import (
    days_since,
    dn_rdn_value,
    dn_to_domain,
    filetime_to_datetime,
    parse_iso,
    rid_of,
    split_dn,
)
from ..core.constants import (
    BUILTIN_RIDS,
    CRITICAL_GROUP_RIDS,
    CRITICAL_PREFERENCE,
    DNSADMINS_SAM,
    RID_ADMINISTRATOR,
    RID_DOMAIN_CONTROLLERS,
    RID_KRBTGT,
    TIER0_GROUP_RIDS,
    UAC,
)
from ..core.i18n import Localized, tr
from ..core.models import AnalysisSettings

DNSADMINS_RID = -1  # pseudo-RID used internally for DnsAdmins (no fixed RID)


@dataclass
class MembershipPath:
    group_sid: str
    group_rid: int  # canonical RID (-1 for DnsAdmins)
    group_name: str  # the name as it exists in this directory (may be localized)
    nodes: list[str]  # display names: principal -> ... -> critical group
    dns: list[str]
    edges: list[str]  # len(nodes)-1 labels: member | primaryGroupID | in_chain

    @property
    def direct(self) -> bool:
        return len(self.nodes) == 2 and self.edges == ["member"]

    @property
    def via_primary_group(self) -> bool:
        return "primaryGroupID" in self.edges

    @property
    def nested(self) -> bool:
        return len(self.nodes) > 2

    @property
    def text(self) -> str:
        return " → ".join(self.nodes)


@dataclass
class Principal:
    rec: dict[str, Any]
    kind: str  # users | computers | gmsa
    dn: str
    sam: str
    sid: str | None
    rid: int | None
    uac: int
    object_type: str  # user | serviceAccount | computer
    service_reasons: list[Localized]  # why it is considered a service account (per language)
    last_logon: datetime | None
    pwd_last_set: datetime | None
    when_created: datetime | None
    crit: dict[str, MembershipPath] = field(default_factory=dict)

    @property
    def enabled(self) -> bool:
        return not (self.uac & UAC["ACCOUNTDISABLE"])

    @property
    def is_service(self) -> bool:
        return bool(self.service_reasons)

    @property
    def is_gmsa(self) -> bool:
        return self.kind == "gmsa"

    @property
    def is_dc(self) -> bool:
        return bool(self.uac & UAC["SERVER_TRUST_ACCOUNT"]) or self.rec.get("primaryGroupID") == RID_DOMAIN_CONTROLLERS

    @property
    def privileged(self) -> bool:
        return bool(self.crit)

    @property
    def tier0(self) -> bool:
        if self.rid in (RID_ADMINISTRATOR, RID_KRBTGT) or self.is_dc:
            return True
        return any(p.group_rid in TIER0_GROUP_RIDS for p in self.crit.values())

    @property
    def display_name(self) -> str:
        return self.rec.get("displayName") or self.sam

    def flag(self, name: str) -> bool:
        return bool(self.uac & UAC[name])


class AnalysisContext:
    def __init__(self, snapshot: dict[str, Any], settings: AnalysisSettings, now: datetime | None = None) -> None:
        self.snapshot = snapshot
        self.settings = settings
        self.t = settings.thresholds
        self.now: datetime = now or parse_iso(snapshot["collected_at"])
        self.warnings: list[str] = list(snapshot.get("collector", {}).get("warnings", []))

        dom = snapshot["domain"]
        self.domain_dn: str = dom.get("distinguishedName") or ""
        self.domain: str = dn_to_domain(self.domain_dn) or (dom.get("name") or "unknown")
        self.domain_sid: str = dom.get("objectSid") or ""
        self.domain_rec = dom

        self.groups: list[dict[str, Any]] = snapshot.get("groups", [])
        self.group_by_dn = {g["distinguishedName"].lower(): g for g in self.groups}
        self.group_by_sid = {g["objectSid"]: g for g in self.groups if g.get("objectSid")}

        self.principals: list[Principal] = []
        for kind in ("users", "gmsa", "computers"):
            for rec in snapshot.get(kind, []):
                self.principals.append(self._make_principal(kind, rec))
        self.principal_by_dn = {p.dn.lower(): p for p in self.principals}

        self.critical: dict[str, tuple[int, dict[str, Any]]] = self._resolve_critical_groups()
        self._build_graph()
        self._compute_memberships()

    # ------------------------------------------------------------------------------------
    def _make_principal(self, kind: str, rec: dict[str, Any]) -> Principal:
        sid = rec.get("objectSid")
        p = Principal(
            rec=rec,
            kind=kind,
            dn=rec["distinguishedName"],
            sam=rec.get("sAMAccountName") or dn_rdn_value(rec["distinguishedName"]),
            sid=sid,
            rid=rid_of(sid),
            uac=int(rec.get("userAccountControl") or 0),
            object_type="computer" if kind == "computers" else "user",
            service_reasons=[],
            last_logon=filetime_to_datetime(rec.get("lastLogonTimestamp")),
            pwd_last_set=filetime_to_datetime(rec.get("pwdLastSet")),
            when_created=parse_iso(rec.get("whenCreated")),
        )
        if kind == "gmsa" and self.settings.service.include_gmsa:
            p.service_reasons.append(tr("svc_reason_gmsa"))
        elif kind == "users" and p.rid != RID_KRBTGT:
            h = self.settings.service
            if h.spn_on_user and rec.get("servicePrincipalName"):
                p.service_reasons.append(tr("svc_reason_spn"))
            sam_l = p.sam.lower()
            for prefix in h.name_prefixes:
                if sam_l.startswith(prefix.lower()):
                    p.service_reasons.append(tr("svc_reason_prefix", prefix=prefix))
                    break
            dn_l = p.dn.lower()
            for marker in h.ou_markers:
                if marker.lower() in dn_l:
                    p.service_reasons.append(tr("svc_reason_ou", marker=marker))
                    break
        if p.service_reasons:
            p.object_type = "serviceAccount"
        return p

    def _resolve_critical_groups(self) -> dict[str, tuple[int, dict[str, Any]]]:
        """{group SID: (canonical RID, group record)} — by SID/RID, never by display name."""
        out: dict[str, tuple[int, dict[str, Any]]] = {}
        for rid in CRITICAL_GROUP_RIDS:
            sid = f"S-1-5-32-{rid}" if rid in BUILTIN_RIDS else f"{self.domain_sid}-{rid}"
            g = self.group_by_sid.get(sid)
            if g is not None:
                out[sid] = (rid, g)
            else:
                self.warnings.append(f"critical group RID {rid} ({CRITICAL_GROUP_RIDS[rid]}) not found in snapshot")
        # DnsAdmins has no well-known RID: resolve by sAMAccountName (not localized by Windows).
        for g in self.groups:
            if (g.get("sAMAccountName") or "").lower() == DNSADMINS_SAM.lower() and g.get("objectSid"):
                out[g["objectSid"]] = (DNSADMINS_RID, g)
        return out

    def _build_graph(self) -> None:
        """Reverse edges: member DN -> groups that contain it (from `member`, plus `memberOf` backfill)."""
        parents: dict[str, set[str]] = {}
        for g in self.groups:
            gdn = g["distinguishedName"].lower()
            for m in g.get("member") or []:
                parents.setdefault(m.lower(), set()).add(gdn)
        for rec in [*self.groups, *(p.rec for p in self.principals)]:
            for parent in rec.get("memberOf") or []:
                if parent.lower() in self.group_by_dn:
                    parents.setdefault(rec["distinguishedName"].lower(), set()).add(parent.lower())
        self.parents = parents

    def _name(self, dn_l: str) -> str:
        g = self.group_by_dn.get(dn_l)
        if g is not None:
            return g.get("sAMAccountName") or dn_rdn_value(g["distinguishedName"])
        p = self.principal_by_dn.get(dn_l)
        return p.sam if p else dn_rdn_value(dn_l)

    def _dn(self, dn_l: str) -> str:
        g = self.group_by_dn.get(dn_l)
        if g is not None:
            return g["distinguishedName"]
        p = self.principal_by_dn.get(dn_l)
        return p.dn if p else dn_l

    def _compute_memberships(self) -> None:
        crit_by_dn = {g["distinguishedName"].lower(): (sid, rid, g) for sid, (rid, g) in self.critical.items()}
        for p in self.principals:
            start = p.dn.lower()
            queue: deque[tuple[str, list[str], list[str]]] = deque()
            seen = {start}
            for parent in sorted(self.parents.get(start, ())):
                queue.append((parent, [start, parent], ["member"]))
            pgid = p.rec.get("primaryGroupID")
            if pgid and self.domain_sid:
                pg = self.group_by_sid.get(f"{self.domain_sid}-{pgid}")
                if pg is not None and pg["distinguishedName"].lower() not in self.parents.get(start, set()):
                    queue.append((pg["distinguishedName"].lower(), [start, pg["distinguishedName"].lower()], ["primaryGroupID"]))
            while queue:
                node, path, edges = queue.popleft()
                if node in seen:
                    continue
                seen.add(node)
                if node in crit_by_dn:
                    sid, rid, g = crit_by_dn[node]
                    if sid not in p.crit:
                        p.crit[sid] = MembershipPath(
                            group_sid=sid, group_rid=rid, group_name=self._name(node),
                            nodes=[self._name(x) for x in path], dns=[self._dn(x) for x in path], edges=edges,
                        )
                for parent in sorted(self.parents.get(node, ())):
                    if parent not in seen:
                        queue.append((parent, [*path, parent], [*edges, "member"]))

        # Cross-check with LDAP_IN_CHAIN (server-side transitive expansion).
        in_chain = self.snapshot.get("in_chain") or {}
        mismatches = 0
        for sid, members in in_chain.items():
            if sid not in self.critical:
                continue
            rid, g = self.critical[sid]
            for m in members:
                p = self.principal_by_dn.get(m.lower())
                if p is None or sid in p.crit:
                    continue
                mismatches += 1
                p.crit[sid] = MembershipPath(
                    group_sid=sid, group_rid=rid, group_name=g.get("sAMAccountName") or dn_rdn_value(g["distinguishedName"]),
                    nodes=[p.sam, "(nested — resolved via LDAP_IN_CHAIN)", g.get("sAMAccountName") or "?"],
                    dns=[p.dn, "", g["distinguishedName"]], edges=["in_chain", "in_chain"],
                )
        if mismatches:
            self.warnings.append(f"{mismatches} membership(s) found only via LDAP_IN_CHAIN (unreadable intermediate groups?)")
        self.in_chain_available = bool(in_chain)

    # ------------------------------------------------------------------------------------
    # helpers used by analyzers
    # ------------------------------------------------------------------------------------
    def users(self) -> list[Principal]:
        return [p for p in self.principals if p.kind == "users"]

    def service_accounts(self) -> list[Principal]:
        return [p for p in self.principals if p.is_service]

    def regular_users(self) -> list[Principal]:
        """Human user accounts: not service accounts, not krbtgt."""
        return [p for p in self.users() if not p.is_service and p.rid != RID_KRBTGT]

    def computers(self) -> list[Principal]:
        return [p for p in self.principals if p.kind == "computers"]

    def inactivity(self, p: Principal) -> tuple[int | None, bool]:
        """(days since last logon — or since creation if never logged on, never_logged_on)."""
        if p.last_logon is not None:
            return days_since(p.last_logon, self.now), False
        return days_since(p.when_created, self.now), True

    def pwd_age_days(self, p: Principal) -> int | None:
        raw = p.rec.get("pwdLastSet")
        if raw in (None, 0):  # 0 = must change at next logon
            return None
        return days_since(p.pwd_last_set, self.now)

    def best_path(self, p: Principal) -> MembershipPath | None:
        """The most critical target to show: DA > EA > SA > Administrators > operators; then shortest."""
        if not p.crit:
            return None
        order = {rid: i for i, rid in enumerate(CRITICAL_PREFERENCE)}
        return sorted(p.crit.values(), key=lambda m: (order.get(m.group_rid, 99), len(m.nodes)))[0]

    def group_members_effective(self, group_sid: str) -> list[Principal]:
        return [p for p in self.principals if group_sid in p.crit and p.kind != "computers"]

    def critical_sid(self, rid: int) -> str | None:
        for sid, (r, _) in self.critical.items():
            if r == rid:
                return sid
        return None

    def ou_path(self, dn: str) -> str:
        return "/".join(reversed([x.split("=", 1)[1] for x in split_dn(dn)[1:] if x.upper().startswith(("OU=", "CN="))]))

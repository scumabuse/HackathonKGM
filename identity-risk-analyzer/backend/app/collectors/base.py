"""Collector contract + the normalized identity snapshot shape.

Every identity collector (mock, live LDAP, snapshot replay) returns *exactly* this structure,
so analyzers, the risk engine, API and UI run the same code path regardless of the source:

    {
      "schema": "ira.identity.snapshot/v1",
      "source": "mock" | "ldap://dc01.corp.local:636" | "snapshot:<scan_id>",
      "collected_at": ISO-8601 UTC,
      "collector": {"name", "bind_user", "read_only": true, "warnings": [...]},
      "domain":    {<domain-root policy attributes>},
      "users":     [<user record>...],        # objectCategory=person, objectClass=user
      "computers": [<computer record>...],
      "groups":    [<group record>...],
      "gmsa":      [<gMSA record>...],
      "psos":      [<fine-grained password policy>...],
      "in_chain":  {<critical group SID>: [<member DN>...]},   # LDAP_IN_CHAIN results
      "auth_events": {"status": "ok"|"unavailable"|"error", "source", "detail", "events": [...]}
    }

Records keep raw AD semantics (userAccountControl ints, FILETIME ints, SID strings, DN lists).
Future Radar modules implement their own `Collector` subclass with their own snapshot schema.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from ..core.constants import FORBIDDEN_ATTRIBUTES

SNAPSHOT_SCHEMA = "ira.identity.snapshot/v1"

# Attribute allow-lists — the collector NEVER requests "*".
_COMMON = ["distinguishedName", "objectClass", "objectSid", "sAMAccountName", "whenCreated", "whenChanged"]
USER_ATTRIBUTES = _COMMON + [
    "userPrincipalName", "displayName", "title", "department",
    "userAccountControl", "msDS-User-Account-Control-Computed", "primaryGroupID", "adminCount",
    "lastLogonTimestamp", "pwdLastSet", "accountExpires", "lockoutTime", "badPwdCount", "logonCount",
    "memberOf", "servicePrincipalName", "managedBy", "manager", "userWorkstations",
    "sIDHistory", "msDS-SupportedEncryptionTypes",
]
COMPUTER_ATTRIBUTES = _COMMON + [
    "dNSHostName", "operatingSystem", "operatingSystemVersion",
    "userAccountControl", "primaryGroupID", "lastLogonTimestamp", "pwdLastSet",
    "memberOf", "servicePrincipalName", "managedBy", "sIDHistory", "msDS-SupportedEncryptionTypes",
]
GMSA_ATTRIBUTES = _COMMON + [
    "dNSHostName", "userAccountControl", "primaryGroupID", "lastLogonTimestamp", "pwdLastSet",
    "memberOf", "servicePrincipalName", "managedBy", "msDS-ManagedPasswordInterval",
]
GROUP_ATTRIBUTES = _COMMON + ["member", "memberOf", "groupType", "adminCount", "managedBy", "sIDHistory"]
DOMAIN_ATTRIBUTES = [
    "distinguishedName", "objectSid", "name", "minPwdLength", "maxPwdAge", "minPwdAge",
    "lockoutThreshold", "lockoutDuration", "lockOutObservationWindow", "pwdProperties",
    "pwdHistoryLength", "msDS-Behavior-Version",
]
PSO_ATTRIBUTES = [
    "distinguishedName", "name", "msDS-PasswordSettingsPrecedence", "msDS-MinimumPasswordLength",
    "msDS-PasswordComplexityEnabled", "msDS-PasswordReversibleEncryptionEnabled",
    "msDS-LockoutThreshold", "msDS-MaximumPasswordAge", "msDS-PSOAppliesTo",
]

ATTRIBUTES_BY_KIND = {
    "users": USER_ATTRIBUTES,
    "computers": COMPUTER_ATTRIBUTES,
    "gmsa": GMSA_ATTRIBUTES,
    "groups": GROUP_ATTRIBUTES,
    "domain": DOMAIN_ATTRIBUTES,
    "psos": PSO_ATTRIBUTES,
}

INT_ATTRIBUTES = {
    "userAccountControl", "msDS-User-Account-Control-Computed", "primaryGroupID", "adminCount",
    "lastLogonTimestamp", "pwdLastSet", "accountExpires", "lockoutTime", "badPwdCount", "logonCount",
    "groupType", "msDS-SupportedEncryptionTypes", "minPwdLength", "maxPwdAge", "minPwdAge",
    "lockoutThreshold", "lockoutDuration", "lockOutObservationWindow", "pwdProperties",
    "pwdHistoryLength", "msDS-Behavior-Version", "msDS-PasswordSettingsPrecedence",
    "msDS-MinimumPasswordLength", "msDS-LockoutThreshold", "msDS-MaximumPasswordAge",
    "msDS-ManagedPasswordInterval",
}
BOOL_ATTRIBUTES = {"msDS-PasswordComplexityEnabled", "msDS-PasswordReversibleEncryptionEnabled"}
LIST_ATTRIBUTES = {"objectClass", "memberOf", "member", "servicePrincipalName", "sIDHistory", "msDS-PSOAppliesTo"}
SID_ATTRIBUTES = {"objectSid"}
SID_LIST_ATTRIBUTES = {"sIDHistory"}
TIME_ATTRIBUTES = {"whenCreated", "whenChanged"}  # stored as ISO-8601 strings
FILETIME_ATTRIBUTES = {"lastLogonTimestamp", "pwdLastSet", "accountExpires", "lockoutTime"}

FORBIDDEN_ALLOWLISTED = [a for attrs in ATTRIBUTES_BY_KIND.values() for a in attrs if a.lower() in FORBIDDEN_ATTRIBUTES]
assert not FORBIDDEN_ALLOWLISTED, f"secret attributes in allow-list: {FORBIDDEN_ALLOWLISTED}"


def _coerce_bool(v: Any) -> bool | None:
    if v is None or v == "":
        return None
    if isinstance(v, bool):
        return v
    return str(v).strip().upper() in ("TRUE", "1")


def normalize_record(kind: str, rec: dict[str, Any]) -> dict[str, Any]:
    """Project a record onto the kind's allow-list with canonical types and defaults.

    Unknown and forbidden attributes are dropped; missing ones become None / [].
    """
    allowed = ATTRIBUTES_BY_KIND[kind]
    out: dict[str, Any] = {}
    lower_map = {k.lower(): k for k in rec}
    for attr in allowed:
        src = lower_map.get(attr.lower())
        v = rec.get(src) if src is not None else None
        if attr in LIST_ATTRIBUTES:
            if v is None:
                v = []
            elif not isinstance(v, list):
                v = [v]
            out[attr] = [str(x) for x in v]
        elif attr in INT_ATTRIBUTES:
            out[attr] = int(v) if v not in (None, "") else None
        elif attr in BOOL_ATTRIBUTES:
            out[attr] = _coerce_bool(v)
        else:
            out[attr] = str(v) if v not in (None, "") else None
    return out


def sanitize_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Defence in depth: re-normalize every record so no secret attribute can ever survive."""
    for kind in ("users", "computers", "gmsa", "groups", "psos"):
        snapshot[kind] = [normalize_record(kind, r) for r in snapshot.get(kind, [])]
    snapshot["domain"] = normalize_record("domain", snapshot.get("domain", {}))
    snapshot.setdefault("in_chain", {})
    snapshot.setdefault("auth_events", {"status": "unavailable", "source": None, "detail": "not collected", "events": []})
    snapshot.setdefault("collector", {})
    snapshot["collector"].setdefault("warnings", [])
    snapshot["schema"] = SNAPSHOT_SCHEMA
    return snapshot


class CollectorError(RuntimeError):
    """Raised when a collector cannot produce a snapshot (connection, bind, file...)."""


class Collector(ABC):
    """Base class for every Infrastructure Risk Radar collector.

    Implementations must be READ-ONLY and must never request secret attributes.
    """

    name: str = "base"
    module: str = "identity"

    @abstractmethod
    def collect(self) -> dict[str, Any]:
        """Return a normalized snapshot (see module docstring)."""

    @abstractmethod
    def describe_source(self) -> str:
        """Short source label, e.g. 'mock' or 'ldap://dc01.corp.local:636'."""

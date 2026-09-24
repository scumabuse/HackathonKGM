"""Live, READ-ONLY Active Directory collection with ldap3.

Least privilege: works as a plain Domain Users account (LDAPS + simple bind by default).
 * Only allow-listed attributes are requested (never "*"); secrets are never requested.
 * Every write operation is blocked client-side by ReadOnlyConnection — ldap3's own
   read_only flag does not cover add(), so we enforce it ourselves.
 * Output is normalized to exactly the snapshot shape the mock collector returns.
"""
from __future__ import annotations

import logging
import re
import ssl
from datetime import UTC, datetime
from typing import Any

from ldap3 import BASE, DSA, NTLM, SIMPLE, SUBTREE, Connection, Server, Tls
from ldap3.core.exceptions import LDAPException
from ldap3.utils.conv import escape_filter_chars

from ..core.constants import LDAP_IN_CHAIN
from .adtypes import dn_to_domain, generalized_time_to_iso, sid_bytes_to_str
from .base import (
    BOOL_ATTRIBUTES,
    COMPUTER_ATTRIBUTES,
    DOMAIN_ATTRIBUTES,
    GMSA_ATTRIBUTES,
    GROUP_ATTRIBUTES,
    INT_ATTRIBUTES,
    LIST_ATTRIBUTES,
    PSO_ATTRIBUTES,
    SID_ATTRIBUTES,
    SID_LIST_ATTRIBUTES,
    SNAPSHOT_SCHEMA,
    TIME_ATTRIBUTES,
    USER_ATTRIBUTES,
    Collector,
    CollectorError,
    normalize_record,
    sanitize_snapshot,
)
from .eventlog_collector import EventLogCollector

log = logging.getLogger("ira.ldap")

FILTERS = {
    "users": "(&(objectCategory=person)(objectClass=user))",
    "computers": "(objectCategory=computer)",
    "gmsa": "(objectClass=msDS-GroupManagedServiceAccount)",
    "groups": "(objectCategory=group)",
}
ATTRS = {"users": USER_ATTRIBUTES, "computers": COMPUTER_ATTRIBUTES, "gmsa": GMSA_ATTRIBUTES, "groups": GROUP_ATTRIBUTES}
_RANGE = re.compile(r"^(?P<attr>[^;]+);range=(?P<lo>\d+)-(?P<hi>\d+|\*)$", re.I)


class ReadOnlyViolation(PermissionError):
    pass


class ReadOnlyConnection(Connection):
    """ldap3 Connection that refuses every directory write, whatever the caller does."""

    def _deny(self, *_a: Any, **_k: Any) -> bool:
        raise ReadOnlyViolation("Identity Risk Analyzer is read-only: directory writes are blocked")

    add = modify = delete = modify_dn = _deny  # type: ignore[assignment]


def _decode(v: bytes | str) -> str:
    return v.decode("utf-8", errors="replace") if isinstance(v, bytes) else str(v)


def convert_raw(raw: dict[str, list]) -> dict[str, Any]:
    """ldap3 raw_attributes (lists of bytes) -> typed values, before normalize_record()."""
    out: dict[str, Any] = {}
    for key, values in raw.items():
        m = _RANGE.match(key)
        attr = m.group("attr") if m else key
        values = values or []
        if attr in SID_ATTRIBUTES:
            out[attr] = sid_bytes_to_str(values[0]) if values else None
        elif attr in SID_LIST_ATTRIBUTES:
            out[attr] = [sid_bytes_to_str(v) for v in values]
        elif attr in LIST_ATTRIBUTES:
            out[attr] = [*out.get(attr, []), *(_decode(v) for v in values)]
        elif attr in INT_ATTRIBUTES:
            out[attr] = int(_decode(values[0])) if values else None
        elif attr in BOOL_ATTRIBUTES:
            out[attr] = _decode(values[0]).upper() == "TRUE" if values else None
        elif attr in TIME_ATTRIBUTES:
            out[attr] = generalized_time_to_iso(values[0]) if values else None
        else:
            out[attr] = _decode(values[0]) if values else None
    return out


class LdapCollector(Collector):
    name = "ldap"

    def __init__(self, *, server: str, port: int | None = None, use_ssl: bool = True, start_tls: bool = False,
                 validate_cert: bool = True, ca_cert: str | None = None, auth: str = "SIMPLE",
                 user: str | None = None, password: str | None = None, base_dn: str | None = None,
                 timeout: int = 15, page_size: int = 500, eventlog: EventLogCollector | None = None,
                 connection_factory=None) -> None:
        self.server, self.use_ssl, self.start_tls = server, use_ssl, start_tls
        self.port = port or (636 if use_ssl else 389)
        self.validate_cert, self.ca_cert, self.auth = validate_cert, ca_cert, auth
        self.user, self._password = user, password  # password lives only in memory, never logged
        self.base_dn, self.timeout, self.page_size = base_dn, timeout, page_size
        self.eventlog = eventlog
        self._connection_factory = connection_factory
        self.warnings: list[str] = []

    @classmethod
    def from_config(cls, cfg) -> LdapCollector:
        if not cfg.ldap_configured:
            raise CollectorError("LDAP is not configured (LDAP_SERVER / LDAP_BIND_USER / LDAP_BIND_PASSWORD)")
        return cls(server=cfg.LDAP_SERVER, port=cfg.LDAP_PORT, use_ssl=cfg.LDAP_USE_SSL, start_tls=cfg.LDAP_START_TLS,
                   validate_cert=cfg.LDAP_VALIDATE_CERT, ca_cert=str(cfg.LDAP_CA_CERT) if cfg.LDAP_CA_CERT else None,
                   auth=cfg.LDAP_AUTH, user=cfg.LDAP_BIND_USER,
                   password=cfg.LDAP_BIND_PASSWORD.get_secret_value() if cfg.LDAP_BIND_PASSWORD else None,
                   base_dn=cfg.LDAP_BASE_DN, timeout=cfg.LDAP_TIMEOUT, page_size=cfg.LDAP_PAGE_SIZE,
                   eventlog=EventLogCollector(cfg.EVENTLOG_MODE, cfg.EVENTLOG_PATH, cfg.EVENTLOG_DC, cfg.EVENTLOG_HOURS))

    def describe_source(self) -> str:
        return f"{'ldaps' if self.use_ssl else 'ldap'}://{self.server}:{self.port}"

    # ------------------------------------------------------------------------------ connection
    def connect(self) -> Connection:
        tls = None
        if self.use_ssl or self.start_tls:
            tls = Tls(validate=ssl.CERT_REQUIRED if self.validate_cert else ssl.CERT_NONE, ca_certs_file=self.ca_cert)
            if not self.validate_cert:
                self.warnings.append("TLS certificate validation is DISABLED (LDAP_VALIDATE_CERT=false)")
        elif self.auth == "SIMPLE":
            self.warnings.append("simple bind without TLS sends the password in clear text — use LDAPS")
        srv = Server(self.server, port=self.port, use_ssl=self.use_ssl, tls=tls, get_info=DSA,
                     connect_timeout=self.timeout)
        conn = ReadOnlyConnection(srv, user=self.user, password=self._password,
                                  authentication=NTLM if self.auth == "NTLM" else SIMPLE,
                                  read_only=True, receive_timeout=self.timeout, auto_referrals=False)
        try:
            conn.open()
            if self.start_tls and not self.use_ssl:
                conn.start_tls()
            if not conn.bind():
                raise CollectorError(f"LDAP bind failed for {self.user}: {conn.result.get('description')}")
        except LDAPException as exc:
            raise CollectorError(f"cannot connect to {self.describe_source()}: {type(exc).__name__}: {exc}") from exc
        return conn

    # ------------------------------------------------------------------------------ searches
    def _complete_ranges(self, conn: Connection, dn: str, raw: dict[str, list]) -> dict[str, list]:
        """Follow AD ranged retrieval (member;range=0-1499) until the '*' terminator."""
        for key in list(raw):
            m = _RANGE.match(key)
            if not m or m.group("hi") == "*":
                continue
            attr, hi = m.group("attr"), int(m.group("hi"))
            values = list(raw.pop(key))
            while True:
                lo = hi + 1
                conn.search(dn, "(objectClass=*)", BASE, attributes=[f"{attr};range={lo}-*"])
                if not conn.response:
                    break
                part = conn.response[0].get("raw_attributes", {})
                nxt = next(((k, v) for k, v in part.items() if _RANGE.match(k)), None)
                if nxt is None:
                    break
                values.extend(nxt[1])
                m2 = _RANGE.match(nxt[0])
                if m2.group("hi") == "*":
                    break
                hi = int(m2.group("hi"))
            raw[attr] = values
        return raw

    def _paged(self, conn: Connection, base: str, kind: str) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        gen = conn.extend.standard.paged_search(base, FILTERS[kind], SUBTREE, attributes=ATTRS[kind],
                                                paged_size=self.page_size, generator=True)
        for entry in gen:
            if entry.get("type") != "searchResEntry":
                continue
            raw = self._complete_ranges(conn, entry["dn"], dict(entry.get("raw_attributes") or {}))
            rec = convert_raw(raw)
            rec["distinguishedName"] = rec.get("distinguishedName") or entry["dn"]
            out.append(normalize_record(kind, rec))
        return out

    def _base_entry(self, conn: Connection, dn: str, attrs: list[str]) -> dict[str, Any] | None:
        if not conn.search(dn, "(objectClass=*)", BASE, attributes=attrs) or not conn.response:
            return None
        e = conn.response[0]
        rec = convert_raw(dict(e.get("raw_attributes") or {}))
        rec["distinguishedName"] = rec.get("distinguishedName") or e["dn"]
        return rec

    def _psos(self, conn: Connection, base: str) -> list[dict[str, Any]]:
        container = f"CN=Password Settings Container,CN=System,{base}"
        try:
            ok = conn.search(container, "(objectClass=msDS-PasswordSettings)", SUBTREE, attributes=PSO_ATTRIBUTES)
        except LDAPException as exc:
            self.warnings.append(f"fine-grained password policies not readable: {exc}")
            return []
        if not ok and conn.result.get("result") not in (0, 32):
            self.warnings.append("fine-grained password policies not readable with current privileges "
                                 "(by default only Domain Admins can read PSOs) — domain policy still checked")
        psos = []
        for e in conn.response or []:
            if e.get("type") == "searchResEntry":
                rec = convert_raw(dict(e.get("raw_attributes") or {}))
                rec["distinguishedName"] = rec.get("distinguishedName") or e["dn"]
                psos.append(normalize_record("psos", rec))
        return psos

    def _in_chain(self, conn: Connection, base: str, groups: list[dict[str, Any]], domain_sid: str) -> dict[str, list[str]]:
        from ..core.constants import BUILTIN_RIDS, CRITICAL_GROUP_RIDS, DNSADMINS_SAM

        wanted = {f"S-1-5-32-{r}" if r in BUILTIN_RIDS else f"{domain_sid}-{r}" for r in CRITICAL_GROUP_RIDS}
        crit = [g for g in groups if g.get("objectSid") in wanted
                or (g.get("sAMAccountName") or "").lower() == DNSADMINS_SAM.lower()]
        out: dict[str, list[str]] = {}
        for g in crit:
            flt = f"(memberOf:{LDAP_IN_CHAIN}:={escape_filter_chars(g['distinguishedName'])})"
            try:
                gen = conn.extend.standard.paged_search(base, flt, SUBTREE, attributes=["distinguishedName"],
                                                        paged_size=self.page_size, generator=True)
                found = sorted(e["dn"] for e in gen if e.get("type") == "searchResEntry")
            except LDAPException as exc:
                self.warnings.append(f"LDAP_IN_CHAIN query unsupported/failed ({exc}); relying on graph walk only")
                return {}
            # Sanity check: every direct member must be in the transitive result. If not, the server
            # ignored the matching rule — an empty answer would otherwise look like "no members".
            direct = {m.lower() for m in g.get("member") or []}
            if direct and not direct <= {d.lower() for d in found}:
                self.warnings.append("LDAP_IN_CHAIN results inconsistent with direct membership "
                                     f"(group {g.get('sAMAccountName')}); relying on graph walk only")
                return {}
            out[g["objectSid"]] = found
        return out

    # ------------------------------------------------------------------------------ collect
    def collect(self) -> dict[str, Any]:
        self.warnings = []
        conn = self._connection_factory() if self._connection_factory else self.connect()
        try:
            base = self.base_dn
            if not base:
                info = conn.server.info
                nc = (info.other.get("defaultNamingContext") if info else None) or []
                if not nc:
                    raise CollectorError("could not discover defaultNamingContext; set LDAP_BASE_DN")
                base = nc[0]
            domain = self._base_entry(conn, base, DOMAIN_ATTRIBUTES)
            if domain is None:
                raise CollectorError(f"base DN {base} not readable")
            snapshot: dict[str, Any] = {
                "schema": SNAPSHOT_SCHEMA,
                "source": self.describe_source(),
                "collected_at": datetime.now(UTC).replace(microsecond=0).isoformat(),
                "domain": normalize_record("domain", domain),
            }
            for kind in ("users", "computers", "gmsa", "groups"):
                snapshot[kind] = self._paged(conn, base, kind)
            snapshot["psos"] = self._psos(conn, base)
            snapshot["in_chain"] = self._in_chain(conn, base, snapshot["groups"], snapshot["domain"].get("objectSid") or "")
            log.info("collected %s users, %s computers, %s groups from %s", len(snapshot["users"]),
                     len(snapshot["computers"]), len(snapshot["groups"]), dn_to_domain(base))
        except LDAPException as exc:
            raise CollectorError(f"LDAP collection failed: {type(exc).__name__}: {exc}") from exc
        finally:
            try:
                conn.unbind()
            except Exception:  # noqa: BLE001 — best effort
                pass
        snapshot["auth_events"] = (self.eventlog.collect() if self.eventlog else
                                   {"status": "unavailable", "source": None, "detail": "event log collection disabled",
                                    "events": []})
        snapshot["collector"] = {"name": "ldap", "bind_user": self.user, "read_only": True,
                                 "auth": self.auth, "tls": self.use_ssl or self.start_tls, "warnings": self.warnings}
        return sanitize_snapshot(snapshot)

"""Converters for AD wire formats: FILETIME, intervals, SIDs, GeneralizedTime. Unit-tested."""
from __future__ import annotations

import re
import struct
from datetime import UTC, datetime, timedelta

from ..core.constants import FILETIME_EPOCH_DIFF_SECONDS, FILETIME_NEVER, FILETIME_TICKS_PER_SECOND

_EPOCH_1601 = datetime(1601, 1, 1, tzinfo=UTC)


def filetime_to_datetime(value: int | str | None) -> datetime | None:
    """100-ns intervals since 1601-01-01 UTC -> aware datetime.

    0 and 0x7FFFFFFFFFFFFFFF mean "not set / never" and map to None.
    """
    if value is None or value == "":
        return None
    v = int(value)
    if v <= 0 or v >= FILETIME_NEVER:
        return None
    return _EPOCH_1601 + timedelta(microseconds=v // 10)


def datetime_to_filetime(dt: datetime) -> int:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    delta = dt - _EPOCH_1601
    return (delta.days * 86400 + delta.seconds) * FILETIME_TICKS_PER_SECOND + delta.microseconds * 10


def interval_to_timedelta(value: int | str | None) -> timedelta | None:
    """AD policy intervals (maxPwdAge, lockoutDuration...) are NEGATIVE 100-ns counts.

    -9223372036854775808 (0x8000000000000000) means "never"/"forever" -> None.
    """
    if value is None or value == "":
        return None
    v = int(value)
    if v == -(2**63) or v == 0:
        return None
    return timedelta(microseconds=abs(v) // 10)


def days_since(then: datetime | None, now: datetime) -> int | None:
    if then is None:
        return None
    return max(0, (now - then).days)


def sid_bytes_to_str(raw: bytes) -> str:
    """Binary SID (MS-DTYP 2.4.2.2) -> 'S-1-5-21-...'."""
    if len(raw) < 8:
        raise ValueError("SID too short")
    revision = raw[0]
    sub_count = raw[1]
    authority = int.from_bytes(raw[2:8], "big")
    if len(raw) != 8 + 4 * sub_count:
        raise ValueError("SID length mismatch")
    subs = struct.unpack("<" + "I" * sub_count, raw[8 : 8 + 4 * sub_count])
    return "S-" + "-".join([str(revision), str(authority), *map(str, subs)])


def sid_str_to_bytes(sid: str) -> bytes:
    parts = sid.split("-")
    if len(parts) < 3 or parts[0].upper() != "S":
        raise ValueError(f"not a SID: {sid!r}")
    revision, authority = int(parts[1]), int(parts[2])
    subs = [int(p) for p in parts[3:]]
    return bytes([revision, len(subs)]) + authority.to_bytes(6, "big") + struct.pack("<" + "I" * len(subs), *subs)


def rid_of(sid: str | None) -> int | None:
    if not sid:
        return None
    try:
        return int(sid.rsplit("-", 1)[1])
    except (IndexError, ValueError):
        return None


def generalized_time_to_iso(value: str | bytes | None) -> str | None:
    """'20240115123000.0Z' -> '2024-01-15T12:30:00+00:00'."""
    if value in (None, "", b""):
        return None
    s = value.decode() if isinstance(value, bytes) else str(value)
    s = s.strip()
    base = s.split(".")[0].rstrip("Z")
    dt = datetime.strptime(base[:14], "%Y%m%d%H%M%S").replace(tzinfo=UTC)
    return dt.isoformat()


def iso_to_generalized_time(value: str) -> str:
    return parse_iso(value).strftime("%Y%m%d%H%M%S.0Z")


def parse_iso(value: str | datetime | None) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def fmt_ago(then: datetime | None, now: datetime) -> str:
    """Human-readable evidence value, e.g. '730 days ago (2024-01-15)'."""
    if then is None:
        return "never"
    d = days_since(then, now) or 0
    return f"{d} day{'' if d == 1 else 's'} ago ({then.date().isoformat()})"


_DN_SPLIT = re.compile(r"(?<!\\),")


def split_dn(dn: str) -> list[str]:
    """Split a DN into RDNs, honouring escaped commas ('CN=Smith\\, John,OU=...')."""
    return [p.strip() for p in _DN_SPLIT.split(dn) if p.strip()]


def dn_to_domain(dn: str) -> str:
    return ".".join(p.split("=", 1)[1] for p in split_dn(dn) if p.upper().startswith("DC="))


def dn_rdn_value(dn: str) -> str:
    first = split_dn(dn)[0] if dn else ""
    value = first.split("=", 1)[1] if "=" in first else first
    return value.replace("\\,", ",")

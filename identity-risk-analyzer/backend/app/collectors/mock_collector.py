"""Offline collectors: the demo dataset and replay of any saved snapshot.

Both return the identical normalized snapshot the live LDAP collector emits.
"""
from __future__ import annotations

import copy
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from .adtypes import datetime_to_filetime, filetime_to_datetime, parse_iso
from .base import FILETIME_ATTRIBUTES, TIME_ATTRIBUTES, Collector, CollectorError, sanitize_snapshot


def load_snapshot_file(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise CollectorError(f"snapshot file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise CollectorError(f"snapshot file is not valid JSON: {path}: {exc}") from exc
    if not isinstance(data, dict) or "users" not in data or "domain" not in data:
        raise CollectorError(f"{path} is not an identity snapshot")
    return data


def rebase_snapshot(snapshot: dict[str, Any], new_now: datetime) -> dict[str, Any]:
    """Shift every timestamp so the snapshot looks as if it was collected at `new_now`.

    Keeps relative ages ("730 days ago") intact, so demo numbers never drift over time.
    """
    snap = copy.deepcopy(snapshot)
    old_now = parse_iso(snap["collected_at"])
    delta: timedelta = new_now - old_now

    def shift_record(rec: dict[str, Any]) -> None:
        for attr in FILETIME_ATTRIBUTES:
            v = rec.get(attr)
            dt = filetime_to_datetime(v) if isinstance(v, int) else None
            if dt is not None:
                rec[attr] = datetime_to_filetime(dt + delta)
        for attr in TIME_ATTRIBUTES:
            if rec.get(attr):
                rec[attr] = (parse_iso(rec[attr]) + delta).isoformat()

    for kind in ("users", "computers", "gmsa", "groups"):
        for rec in snap.get(kind, []):
            shift_record(rec)
    for event in snap.get("auth_events", {}).get("events", []):
        event["time"] = (parse_iso(event["time"]) + delta).isoformat()
    snap["collected_at"] = new_now.isoformat()
    return snap


def demo_history_variant(snapshot: dict[str, Any], weeks_ago: int) -> dict[str, Any]:
    """An *earlier state* of the demo domain, for seeding the trend chart (clearly labelled "seed").

    Issues are "introduced" over time so the radar shows a deteriorating domain:
      >=1 week ago: no password-spray / brute-force activity yet
      >=2 weeks:    Helpdesk-L2 not yet nested into Domain Admins (ivanov escalation)
      >=3 weeks:    m.petrov still has primaryGroupID=513 (no hidden admin)
      >=4 weeks:    a.nurlanov still requires Kerberos pre-auth
      >=5 weeks:    temp.contractor (PASSWD_NOTREQD) does not exist yet
    """
    snap = rebase_snapshot(snapshot, parse_iso(snapshot["collected_at"]) - timedelta(days=7 * weeks_ago))
    if weeks_ago >= 1:
        snap["auth_events"]["events"] = [
            e for e in snap["auth_events"]["events"] if e.get("event_id") not in (4625, 4771, 4740)
        ]
        for u in snap["users"]:
            if u["sAMAccountName"] == "d.omarov":
                u["msDS-User-Account-Control-Computed"] = 0
    if weeks_ago >= 2:
        chain = ("CN=Helpdesk-L2,", "CN=IT-Support,", "CN=Ivan Ivanov,")
        for g in snap["groups"]:
            if g["objectSid"].endswith("-512"):
                g["member"] = [m for m in g["member"] if not m.startswith(chain[0])]
            if g["sAMAccountName"] == "Helpdesk-L2":
                g["memberOf"] = [m for m in g["memberOf"] if not m.startswith("CN=Domain Admins,")]
        snap["in_chain"] = {sid: [m for m in dns if not m.startswith(chain)] for sid, dns in snap["in_chain"].items()}
    if weeks_ago >= 3:
        for u in snap["users"]:
            if u["sAMAccountName"] == "m.petrov":
                u["primaryGroupID"] = 513
    if weeks_ago >= 4:
        for u in snap["users"]:
            if u["sAMAccountName"] == "a.nurlanov":
                u["userAccountControl"] &= ~0x400000
    if weeks_ago >= 5:
        snap["users"] = [u for u in snap["users"] if u["sAMAccountName"] != "temp.contractor"]
    return snap


class MockCollector(Collector):
    """Serves backend/data/mock_ad.json, rebased to the current time."""

    name = "mock"

    def __init__(self, path: Path, now: datetime | None = None, rebase: bool = True) -> None:
        self.path = Path(path)
        self.now = now
        self.rebase = rebase

    def describe_source(self) -> str:
        return "mock"

    def collect(self) -> dict[str, Any]:
        snap = load_snapshot_file(self.path)
        if self.rebase:
            snap = rebase_snapshot(snap, self.now or datetime.now(UTC).replace(microsecond=0))
        snap["source"] = "mock"
        snap.setdefault("collector", {})["name"] = "mock"
        return sanitize_snapshot(snap)


class SnapshotCollector(Collector):
    """Replays a previously saved snapshot (a real scan exported to JSON) — offline, unchanged."""

    name = "snapshot"

    def __init__(self, snapshot: dict[str, Any] | None = None, path: Path | None = None, label: str = "file") -> None:
        if snapshot is None and path is None:
            raise CollectorError("SnapshotCollector needs a snapshot dict or a path")
        self._snapshot = snapshot
        self.path = path
        self.label = label

    def describe_source(self) -> str:
        return f"snapshot:{self.label}"

    def collect(self) -> dict[str, Any]:
        snap = copy.deepcopy(self._snapshot) if self._snapshot is not None else load_snapshot_file(self.path)
        collector = snap.setdefault("collector", {})
        collector.setdefault("warnings", [])
        # keep the ROOT origin across replays of replays (mock / ldap://...)
        collector["replayed_from"] = collector.get("replayed_from") or snap.get("source", "unknown")
        snap["source"] = self.describe_source()
        return sanitize_snapshot(snap)

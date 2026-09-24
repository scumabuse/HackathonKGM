"""Security event log collection for spray / brute-force / interactive-logon signals (P1).

Modes (EVENTLOG_MODE):
  off       -> status "unavailable"; analyzers degrade gracefully and the UI says so
  file      -> JSON exported by scripts/export_auth_events.ps1 (works from any OS)
  wevtutil  -> `wevtutil qe Security /r:<DC>` on a Windows host; needs only Event Log Readers

Only metadata is kept: event id, time, account, domain, source IP, workstation, logon type,
status. Security events never contain passwords.
"""
from __future__ import annotations

import json
import os
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

from ..core.constants import EVENTS

EVENT_IDS = sorted(EVENTS.values())
_NS = {"e": "http://schemas.microsoft.com/win/2004/08/events/event"}
FIELDS = ("event_id", "time", "target_user", "target_domain", "source_ip", "workstation", "logon_type", "status")


def _clean_ip(ip: str | None) -> str | None:
    if ip in (None, "", "-"):
        return None
    return ip.removeprefix("::ffff:")


def normalize_event(e: dict[str, Any]) -> dict[str, Any]:
    out = {k: e.get(k) for k in FIELDS}
    out["event_id"] = int(out["event_id"]) if out["event_id"] is not None else None
    if out["logon_type"] not in (None, ""):
        out["logon_type"] = int(out["logon_type"])
    out["source_ip"] = _clean_ip(out["source_ip"])
    return out


def parse_wevtutil_xml(text: str) -> list[dict[str, Any]]:
    """Parse `wevtutil qe ... /f:xml` output (a sequence of <Event> elements without a root)."""
    root = ET.fromstring(f"<Events>{text}</Events>")
    events: list[dict[str, Any]] = []
    for ev in root.findall("e:Event", _NS):
        eid = int(ev.findtext("e:System/e:EventID", default="0", namespaces=_NS))
        tc = ev.find("e:System/e:TimeCreated", _NS)
        data = {d.get("Name"): (d.text or "") for d in ev.findall("e:EventData/e:Data", _NS)}
        workstation = data.get("WorkstationName") or data.get("Workstation")
        if eid == EVENTS["LOCKOUT"]:  # 4740 stores the caller computer in TargetDomainName
            workstation = workstation or data.get("TargetDomainName")
        sub_status = data.get("SubStatus")
        rec = {
            "event_id": eid,
            "time": (tc.get("SystemTime") if tc is not None else None),
            "target_user": data.get("TargetUserName"),
            "target_domain": data.get("TargetDomainName"),
            "source_ip": data.get("IpAddress"),
            "workstation": workstation,
            "logon_type": data.get("LogonType"),
            "status": sub_status if sub_status not in (None, "", "0x0") else data.get("Status"),
        }
        if rec["time"]:
            rec["time"] = rec["time"].replace("Z", "+00:00")
        events.append(normalize_event(rec))
    return events


class EventLogCollector:
    def __init__(self, mode: str = "off", path: Path | None = None, dc: str | None = None, hours: int = 24) -> None:
        self.mode, self.path, self.dc, self.hours = mode, path, dc, hours

    def _result(self, status: str, source: str | None, detail: str, events: list | None = None) -> dict[str, Any]:
        return {"status": status, "source": source, "detail": detail, "window_hours": self.hours, "events": events or []}

    def collect(self) -> dict[str, Any]:
        try:
            if self.mode == "off":
                return self._result("unavailable", None, "event log collection disabled (EVENTLOG_MODE=off)")
            if self.mode == "file":
                if not self.path or not Path(self.path).exists():
                    return self._result("unavailable", str(self.path), "event export file not found")
                raw = json.loads(Path(self.path).read_text(encoding="utf-8-sig"))
                items = raw["events"] if isinstance(raw, dict) else raw
                events = [normalize_event(e) for e in items if int(e.get("event_id", 0)) in EVENT_IDS]
                return self._result("ok", f"file:{Path(self.path).name}", f"{len(events)} events", events)
            if self.mode == "wevtutil":
                if os.name != "nt":
                    return self._result("unavailable", None, "wevtutil mode needs a Windows host")
                ids = " or ".join(f"EventID={i}" for i in EVENT_IDS)
                query = f"*[System[({ids}) and TimeCreated[timediff(@SystemTime) <= {self.hours * 3_600_000}]]]"
                cmd = ["wevtutil", "qe", "Security", f"/q:{query}", "/f:xml", "/c:50000", "/rd:true"]
                if self.dc:
                    cmd.insert(3, f"/r:{self.dc}")
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120, check=False)  # noqa: S603
                if proc.returncode != 0:
                    return self._result("error", f"wevtutil:{self.dc or 'local'}",
                                        f"wevtutil failed ({proc.returncode}): {proc.stderr.strip()[:200]} — "
                                        "is the account in Event Log Readers?")
                events = parse_wevtutil_xml(proc.stdout)
                return self._result("ok", f"wevtutil:{self.dc or 'local'}", f"{len(events)} events", events)
            return self._result("unavailable", None, f"unknown EVENTLOG_MODE {self.mode!r}")
        except Exception as exc:  # never break a scan because logs are unreadable
            return self._result("error", self.mode, f"{type(exc).__name__}: {exc}")

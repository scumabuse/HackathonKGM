"""Live-LDAP code path vs mock: the real LdapCollector runs against an in-memory LDAP server
(ldap3 MOCK_SYNC) loaded with the demo domain in raw wire format (binary SIDs, GeneralizedTime,
string integers). The normalized snapshot and the analysis must be identical to mock mode.
"""
import json

import pytest
from ldap3 import MOCK_SYNC, Server

from app.collectors.adtypes import iso_to_generalized_time, sid_str_to_bytes
from app.collectors.base import BOOL_ATTRIBUTES, SID_ATTRIBUTES, SID_LIST_ATTRIBUTES, TIME_ATTRIBUTES
from app.collectors.eventlog_collector import EventLogCollector, parse_wevtutil_xml
from app.collectors.ldap_collector import LdapCollector, ReadOnlyConnection, ReadOnlyViolation

from .conftest import run_analysis

BASE = "DC=corp,DC=local"
CATEGORY = {"users": "person", "computers": "computer", "groups": "group", "gmsa": "msDS-GroupManagedServiceAccount"}


def to_wire(rec: dict) -> dict:
    out = {}
    for k, v in rec.items():
        if v is None or v == []:
            continue
        if k in SID_ATTRIBUTES:
            out[k] = sid_str_to_bytes(v)
        elif k in SID_LIST_ATTRIBUTES:
            out[k] = [sid_str_to_bytes(x) for x in v]
        elif k in TIME_ATTRIBUTES:
            out[k] = iso_to_generalized_time(v)
        elif k in BOOL_ATTRIBUTES:
            out[k] = "TRUE" if v else "FALSE"
        elif isinstance(v, list):
            out[k] = [str(x) for x in v]
        else:
            out[k] = str(v)
    return out


@pytest.fixture()
def fake_dc(mock_snapshot):
    server = Server("dc01.corp.local")
    conn = ReadOnlyConnection(server, user="CN=reader,O=bind", password="reader-pass", client_strategy=MOCK_SYNC,
                              read_only=True)
    s = conn.strategy
    s.add_entry("CN=reader,O=bind", {"userPassword": "reader-pass", "objectClass": ["top", "person"]})
    s.add_entry(BASE, {**to_wire(mock_snapshot["domain"]), "objectClass": ["top", "domain", "domainDNS"]})
    for kind in ("users", "computers", "groups", "gmsa"):
        for rec in mock_snapshot[kind]:
            wire = to_wire(rec)
            wire["objectCategory"] = CATEGORY[kind]
            if kind == "users" and rec["sAMAccountName"] == "ivanov":
                # a poisoned entry: secrets present in the directory must never be collected
                wire.update({"unicodePwd": "SECRET-HASH", "description": "pwd: Winter2024!"})
            s.add_entry(rec["distinguishedName"], wire)
    container = f"CN=Password Settings Container,CN=System,{BASE}"
    s.add_entry(f"CN=System,{BASE}", {"objectClass": ["top", "container"]})
    s.add_entry(container, {"objectClass": ["top", "msDS-PasswordSettingsContainer"]})
    for pso in mock_snapshot["psos"]:
        s.add_entry(pso["distinguishedName"], {**to_wire(pso), "objectClass": ["top", "msDS-PasswordSettings"]})
    conn.bind()

    def factory():
        return conn

    return factory


def collect(fake_dc, mock_snapshot):
    ev = EventLogCollector("off")
    col = LdapCollector(server="dc01.corp.local", base_dn=BASE, user="CN=reader,O=bind", password="x",
                        eventlog=ev, connection_factory=fake_dc, page_size=7)
    snap = col.collect()
    # the demo event log is not part of LDAP; attach the same events for a like-for-like comparison
    snap["auth_events"] = mock_snapshot["auth_events"]
    snap["collected_at"] = mock_snapshot["collected_at"]
    return snap


def by_dn(items):
    return {x["distinguishedName"].lower(): x for x in items}


def test_ldap_snapshot_shape_equals_mock(fake_dc, mock_snapshot):
    snap = collect(fake_dc, mock_snapshot)
    assert snap["source"] == "ldaps://dc01.corp.local:636"
    assert snap["collector"]["read_only"] is True
    for kind in ("users", "computers", "groups", "gmsa", "psos"):
        live, mock = by_dn(snap[kind]), by_dn(mock_snapshot[kind])
        assert live.keys() == mock.keys(), kind
        for dn in mock:
            for attr, value in mock[dn].items():
                lv = live[dn][attr]
                if isinstance(value, list):
                    assert sorted(lv) == sorted(value), (kind, dn, attr)
                else:
                    assert lv == value, (kind, dn, attr)
    assert snap["domain"] == mock_snapshot["domain"]


def test_ldap_path_produces_identical_analysis(fake_dc, mock_snapshot, mock_result):
    snap = collect(fake_dc, mock_snapshot)
    live = run_analysis(snap)
    assert live.counts == mock_result.counts
    assert live.ad_security_score == mock_result.ad_security_score
    assert {e.object_name: e.score for e in live.entities} == {e.object_name: e.score for e in mock_result.entities}
    # MOCK_SYNC has no LDAP_IN_CHAIN support -> graceful warning, graph walk still finds everything
    assert any("LDAP_IN_CHAIN" in w for w in snap["collector"]["warnings"])


def test_secrets_in_directory_are_never_collected(fake_dc, mock_snapshot):
    text = json.dumps(collect(fake_dc, mock_snapshot))
    assert "SECRET-HASH" not in text and "Winter2024" not in text and "reader-pass" not in text


def test_read_only_connection_blocks_every_write(fake_dc):
    conn = fake_dc()
    for op, args in (("add", ("CN=x,DC=corp,DC=local", "user")), ("modify", ("CN=x,DC=corp,DC=local", {})),
                     ("delete", ("CN=x,DC=corp,DC=local",)), ("modify_dn", ("CN=x,DC=corp,DC=local", "CN=y"))):
        with pytest.raises(ReadOnlyViolation):
            getattr(conn, op)(*args)


def test_ldap_collector_requires_configuration():
    from app.collectors.base import CollectorError
    from app.config import AppConfig

    with pytest.raises(CollectorError):
        LdapCollector.from_config(AppConfig(LDAP_SERVER=None, LDAP_BIND_USER=None, LDAP_BIND_PASSWORD=None))


def test_unreachable_dc_is_a_clean_collector_error():
    from app.collectors.base import CollectorError

    col = LdapCollector(server="127.0.0.1", port=1, use_ssl=False, user="u", password="Pw-must-not-leak", timeout=1)
    with pytest.raises(CollectorError) as ei:
        col.collect()
    assert "cannot connect" in str(ei.value)
    assert "Pw-must-not-leak" not in str(ei.value)


# ---- Security event log parsing -------------------------------------------------------------------
WEVTUTIL_SAMPLE = """<Event xmlns='http://schemas.microsoft.com/win/2004/08/events/event'><System><EventID>4771</EventID>
<TimeCreated SystemTime='2026-09-24T09:01:02.123Z'/></System><EventData><Data Name='TargetUserName'>l.kim</Data>
<Data Name='IpAddress'>::ffff:10.0.13.77</Data><Data Name='Status'>0x18</Data></EventData></Event>
<Event xmlns='http://schemas.microsoft.com/win/2004/08/events/event'><System><EventID>4624</EventID>
<TimeCreated SystemTime='2026-09-24T09:05:00Z'/></System><EventData><Data Name='TargetUserName'>svc_backup</Data>
<Data Name='TargetDomainName'>CORP</Data><Data Name='LogonType'>10</Data><Data Name='IpAddress'>10.0.5.40</Data>
<Data Name='WorkstationName'>WS-017</Data></EventData></Event>
<Event xmlns='http://schemas.microsoft.com/win/2004/08/events/event'><System><EventID>4625</EventID>
<TimeCreated SystemTime='2026-09-24T09:06:00Z'/></System><EventData><Data Name='TargetUserName'>d.omarov</Data>
<Data Name='LogonType'>3</Data><Data Name='IpAddress'>-</Data><Data Name='Status'>0xC000006D</Data>
<Data Name='SubStatus'>0xC000006A</Data></EventData></Event>"""


def test_parse_wevtutil_xml():
    events = parse_wevtutil_xml(WEVTUTIL_SAMPLE)
    assert [e["event_id"] for e in events] == [4771, 4624, 4625]
    assert events[0]["source_ip"] == "10.0.13.77" and events[0]["target_user"] == "l.kim"
    assert events[1]["logon_type"] == 10 and events[1]["workstation"] == "WS-017"
    assert events[2]["source_ip"] is None and events[2]["status"] == "0xC000006A"


def test_eventlog_file_mode_and_graceful_modes(tmp_path, mock_snapshot):
    p = tmp_path / "events.json"
    p.write_text(json.dumps(mock_snapshot["auth_events"]["events"]), encoding="utf-8")
    ok = EventLogCollector("file", p).collect()
    assert ok["status"] == "ok" and len(ok["events"]) == len(mock_snapshot["auth_events"]["events"])
    assert EventLogCollector("off").collect()["status"] == "unavailable"
    assert EventLogCollector("file", tmp_path / "missing.json").collect()["status"] == "unavailable"
    (tmp_path / "bad.json").write_text("{not json", encoding="utf-8")
    assert EventLogCollector("file", tmp_path / "bad.json").collect()["status"] == "error"

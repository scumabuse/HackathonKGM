"""Wire-format converters, snapshot hygiene and mock/replay collectors."""
import json
from datetime import UTC, datetime, timedelta

import pytest

from app.collectors.adtypes import (
    datetime_to_filetime,
    dn_rdn_value,
    dn_to_domain,
    filetime_to_datetime,
    generalized_time_to_iso,
    interval_to_timedelta,
    iso_to_generalized_time,
    sid_bytes_to_str,
    sid_str_to_bytes,
)
from app.collectors.base import FORBIDDEN_ALLOWLISTED, ATTRIBUTES_BY_KIND, normalize_record, sanitize_snapshot
from app.collectors.mock_collector import MockCollector, SnapshotCollector, rebase_snapshot
from app.core.constants import FORBIDDEN_ATTRIBUTES

from .conftest import FIXED_NOW, MOCK_PATH, run_analysis


# ---- FILETIME ----------------------------------------------------------------------------
def test_filetime_known_value():
    # 2024-01-15 00:00:00 UTC
    assert filetime_to_datetime(133497504000000000) == datetime(2024, 1, 15, tzinfo=UTC)
    assert datetime_to_filetime(datetime(2024, 1, 15, tzinfo=UTC)) == 133497504000000000


def test_filetime_epoch_and_never():
    assert filetime_to_datetime(116444736000000000) == datetime(1970, 1, 1, tzinfo=UTC)
    assert filetime_to_datetime(0) is None  # never / must change at next logon
    assert filetime_to_datetime(0x7FFFFFFFFFFFFFFF) is None  # accountExpires "never"
    assert filetime_to_datetime(None) is None
    assert filetime_to_datetime("133497504000000000") == datetime(2024, 1, 15, tzinfo=UTC)


def test_filetime_roundtrip():
    dt = datetime(2025, 7, 3, 14, 22, 11, 123456, tzinfo=UTC)
    assert filetime_to_datetime(datetime_to_filetime(dt)) == dt


def test_policy_intervals():
    assert interval_to_timedelta(-36288000000000) == timedelta(days=42)
    assert interval_to_timedelta(-18000000000) == timedelta(minutes=30)
    assert interval_to_timedelta(-(2**63)) is None


# ---- SID / time / DN -------------------------------------------------------------------------
def test_sid_roundtrip_and_known_bytes():
    sid = "S-1-5-21-3623811015-3361044348-30300820-512"
    assert sid_bytes_to_str(sid_str_to_bytes(sid)) == sid
    assert sid_bytes_to_str(bytes.fromhex("01020000000000052000000020020000")) == "S-1-5-32-544"
    with pytest.raises(ValueError):
        sid_bytes_to_str(b"\x01\x05\x00")


def test_generalized_time():
    assert generalized_time_to_iso("20240115123000.0Z") == "2024-01-15T12:30:00+00:00"
    assert iso_to_generalized_time("2024-01-15T12:30:00+00:00") == "20240115123000.0Z"


def test_dn_helpers_respect_escaped_commas():
    assert dn_to_domain("CN=x,OU=Users,DC=corp,DC=local") == "corp.local"
    assert dn_rdn_value(r"CN=Smith\, John,OU=Users,DC=corp,DC=local") == "Smith, John"


# ---- hygiene -----------------------------------------------------------------------------------
def test_no_secret_attribute_is_ever_requested():
    assert FORBIDDEN_ALLOWLISTED == []
    for attrs in ATTRIBUTES_BY_KIND.values():
        assert not {a.lower() for a in attrs} & FORBIDDEN_ATTRIBUTES


def test_sanitize_drops_secrets_from_a_poisoned_snapshot(mock_snapshot):
    snap = json.loads(json.dumps(mock_snapshot))
    snap["users"][0]["unicodePwd"] = "SECRET"
    snap["users"][0]["ms-Mcs-AdmPwd"] = "SECRET"
    snap["users"][0]["description"] = "pwd: Winter2024!"
    snap["computers"][0]["msLAPS-Password"] = "SECRET"
    clean = sanitize_snapshot(snap)
    assert "SECRET" not in json.dumps(clean)
    assert "Winter2024" not in json.dumps(clean)


def test_normalize_record_fills_defaults():
    rec = normalize_record("users", {"distinguishedName": "CN=a,DC=x", "userAccountControl": "512"})
    assert rec["userAccountControl"] == 512
    assert rec["memberOf"] == [] and rec["servicePrincipalName"] == []
    assert rec["pwdLastSet"] is None
    assert list(rec) == ATTRIBUTES_BY_KIND["users"]


# ---- mock / replay collectors -------------------------------------------------------------------
def test_mock_rebase_keeps_relative_ages():
    raw = json.loads(MOCK_PATH.read_text(encoding="utf-8"))
    a = rebase_snapshot(raw, datetime(2030, 1, 1, tzinfo=UTC))
    b = rebase_snapshot(raw, datetime(2027, 6, 1, tzinfo=UTC))
    ra, rb = run_analysis(a), run_analysis(b)
    assert ra.counts == rb.counts
    assert {e.object_name: e.score for e in ra.entities} == {e.object_name: e.score for e in rb.entities}


def test_mock_collector_is_rebased_to_now():
    snap = MockCollector(MOCK_PATH, now=FIXED_NOW).collect()
    assert snap["collected_at"] == FIXED_NOW.isoformat()
    assert snap["source"] == "mock"
    assert snap["schema"] == "ira.identity.snapshot/v1"


def test_snapshot_replay_reproduces_results(mock_snapshot, mock_result, tmp_path):
    path = tmp_path / "saved.json"
    path.write_text(json.dumps(mock_snapshot), encoding="utf-8")
    replay = SnapshotCollector(path=path, label="saved.json").collect()
    assert replay["source"] == "snapshot:saved.json"
    assert replay["collector"]["replayed_from"] == "mock"
    res = run_analysis(replay)
    assert res.counts == mock_result.counts
    assert res.ad_security_score == mock_result.ad_security_score

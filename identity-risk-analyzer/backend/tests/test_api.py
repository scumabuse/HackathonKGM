"""Endpoints return valid schemas; scans persist; history, diff, settings and audit work."""
import time

import pytest
from fastapi.testclient import TestClient

from app.core.models import Finding, ScanResult


@pytest.fixture()
def client(isolated_env):
    from app.main import create_app

    with TestClient(create_app()) as c:
        yield c


def scan(client, **body):
    r = client.post("/api/scan", json={"source": "mock", **body})
    assert r.status_code == 200, r.text
    return r.json()["scan_id"]


def test_health_and_openapi(client):
    h = client.get("/api/health").json()
    assert h["status"] == "ok" and h["read_only"] is True
    assert "Domain Admin NOT required" in h["least_privilege"]
    assert client.get("/docs").status_code == 200
    assert "/api/scan" in client.get("/openapi.json").json()["paths"]


def test_mock_scan_returns_full_scan_result(client):
    sid = scan(client)
    body = client.get(f"/api/scans/{sid}").json()
    res = ScanResult.model_validate(body)
    assert res.source == "mock" and res.domain == "corp.local"
    c = res.counts
    assert (c["inactive_users"], c["service_pne"], c["disabled_privileged"], c["excessive_rights"]) == (10, 7, 3, 2)
    sa01 = next(e for e in res.entities if e.object_name == "ServiceAccount01")
    assert sa01.score == 85 and sa01.level.value == "Critical"
    assert client.get("/api/scans/latest").json()["scan_id"] == sid


def test_async_scan_job_reports_stages(client):
    job = client.post("/api/scan", json={"source": "mock", "wait": False}).json()
    for _ in range(100):
        state = client.get(f"/api/scan/jobs/{job['job_id']}").json()
        if state["stage"] in ("done", "failed"):
            break
        time.sleep(0.05)
    assert state["stage"] == "done", state
    assert state["scan_id"]
    for s in ("collecting", "analyzing", "scoring", "persisting", "done"):
        assert s in state["stages_seen"]


def test_history_dashboard_and_diff(client):
    first = scan(client)
    second = scan(client)
    hist = client.get("/api/scans").json()
    assert [h["scan_id"] for h in hist][:2] == [second, first]
    d = client.get("/api/dashboard/latest").json()
    for key in ("ad_security_score", "score_band", "level_counts", "category_scores", "category_matrix",
                "top_risky", "trend", "diff", "security_posture", "eventlog"):
        assert key in d
    assert d["scan"]["scan_id"] == second
    assert len(d["trend"]) == 2
    assert d["diff"]["new"] == 0 and d["diff"]["resolved"] == 0  # same data twice
    assert d["security_posture"]["read_only"] is True
    assert d["top_risky"][0]["score"] >= d["top_risky"][-1]["score"]
    assert sum(d["level_counts"].values()) == d["counts"]["objects_at_risk"]


def test_findings_filter_sort_and_detail(client):
    scan(client)
    crit = client.get("/api/findings", params={"level": "Critical"}).json()
    assert crit["total"] > 0 and all(f["level"] == "Critical" for f in crit["items"])
    multi = client.get("/api/findings", params={"level": "Critical,High"}).json()
    assert multi["total"] > crit["total"]
    svc = client.get("/api/findings", params={"category": "Service", "object_type": "serviceAccount"}).json()
    assert all(f["category"] == "Service" and f["object_type"] == "serviceAccount" for f in svc["items"])
    q = client.get("/api/findings", params={"q": "ivanov"}).json()
    assert {f["object_name"] for f in q["items"]} == {"ivanov"}
    by_name = client.get("/api/findings", params={"sort": "object", "order": "asc", "limit": 5}).json()
    names = [f["object_name"].lower() for f in by_name["items"]]
    assert names == sorted(names)
    everything = client.get("/api/findings", params={"limit": 5000}).json()
    page2 = client.get("/api/findings", params={"limit": 10, "offset": 10}).json()
    assert page2["total"] == everything["total"] == len(everything["items"])
    assert [f["id"] for f in page2["items"]] == [f["id"] for f in everything["items"][10:20]]
    fid = next(f["id"] for f in q["items"] if f["rule_id"] == "AD-PRIV-NESTED")
    detail = Finding.model_validate(client.get(f"/api/findings/{fid}").json())
    assert detail.privilege_path == ["ivanov", "IT-Support", "Helpdesk-L2", "Domain Admins"]
    assert detail.weight_breakdown and detail.evidence
    assert client.get("/api/findings", params={"sort": "bogus"}).status_code == 422


def test_account_detail(client):
    scan(client)
    items = client.get("/api/findings", params={"q": "ServiceAccount01"}).json()["items"]
    oid = items[0]["object_id"]
    acc = client.get(f"/api/accounts/{oid}").json()
    assert acc["entity"]["score"] == 85
    assert len(acc["findings"]) == 5
    assert [w["weight"] for w in acc["entity"]["weight_breakdown"] if w["matched"]] == [0.5, 0.35, 0.3, 0.25, 0.1]
    assert acc["entity"]["privilege_path"] == ["ServiceAccount01", "SQL-Backup-Ops", "Backup Operators"]
    assert acc["history"][-1]["score"] == 85
    assert client.get("/api/accounts/doesnotexist").status_code == 404


def test_settings_change_rescores_and_updates_dashboard(client):
    scan(client)
    before = client.get("/api/dashboard/latest").json()
    s = client.get("/api/settings").json()["settings"]
    s["rule_enabled"] = {"AD-SVC-NO-OWNER": False}
    s["thresholds"]["inactive_days"] = 200
    r = client.put("/api/settings", params={"rescore": "true"}, json=s)
    assert r.status_code == 200, r.text
    new_id = r.json()["rescored"]["scan_id"]
    after = client.get("/api/dashboard/latest").json()
    assert after["scan"]["scan_id"] == new_id
    assert after["scan"]["trigger"] == "rescore" and after["scan"]["source"] == "mock"
    assert after["counts"]["inactive_users"] == 4
    assert after["ad_security_score"] > before["ad_security_score"]
    sa01 = next(e for e in after["top_risky"] if e["object_name"] == "ServiceAccount01")
    assert sa01["score"] == 83
    assert client.get("/api/settings").json()["settings"]["thresholds"]["inactive_days"] == 200
    reset = client.post("/api/settings/reset").json()
    assert reset["settings"]["thresholds"]["inactive_days"] == 90


def test_settings_validation(client):
    s = client.get("/api/settings").json()["settings"]
    assert client.put("/api/settings", json={**s, "rule_weights": {"AD-SVC-PNE": 1.5}}).status_code == 422
    assert client.put("/api/settings", json={**s, "rule_weights": {"NOPE-RULE": 0.5}}).status_code == 422
    bad_levels = {**s, "levels": {"critical": 50, "high": 60, "medium": 30}}
    assert client.put("/api/settings", json=bad_levels).status_code == 422


def test_rules_catalogue(client):
    rules = client.get("/api/rules").json()
    assert len(rules) >= 30
    sa = {r["id"]: r for r in rules}
    assert sa["AD-SVC-PNE"]["weight"] == 0.30 and sa["AD-SVC-KERBEROAST"]["mitre"] == ["T1558.003"]


def test_snapshot_download_and_offline_replay(client):
    sid = scan(client)
    r = client.get(f"/api/scans/{sid}/snapshot")
    assert r.status_code == 200 and r.headers["content-disposition"].startswith("attachment")
    assert r.json()["schema"] == "ira.identity.snapshot/v1"
    replay = client.post("/api/scan", json={"source": "snapshot", "replay_scan_id": sid}).json()
    a = client.get(f"/api/scans/{sid}").json()
    b = client.get(f"/api/scans/{replay['scan_id']}").json()
    assert b["source"] == f"snapshot:{sid}"
    assert a["counts"] == b["counts"] and a["ad_security_score"] == b["ad_security_score"]


def test_ldap_mode_unconfigured_is_a_clear_400(client):
    r = client.post("/api/scan", json={"source": "ldap"})
    assert r.status_code == 400
    assert "LDAP_SERVER" in r.json()["detail"]


def test_audit_log_records_all_writes(client):
    sid = scan(client)
    client.get(f"/api/export/{sid}", params={"format": "csv"})
    s = client.get("/api/settings").json()["settings"]
    client.put("/api/settings", json=s)
    actions = [a["action"] for a in client.get("/api/audit").json()]
    for a in ("app.start", "scan.run", "export", "settings.update"):
        assert a in actions
    entry = next(a for a in client.get("/api/audit").json() if a["action"] == "scan.run")
    assert entry["actor"] == "local-operator" and entry["target"] == sid
    client.post("/api/scan", json={"source": "mock"}, headers={"X-Actor": "alice@corp"})
    assert client.get("/api/audit").json()[0]["actor"] == "alice@corp"


def test_not_found_paths(client):
    assert client.get("/api/scans/latest").status_code == 404  # empty DB
    assert client.get("/api/dashboard/latest").status_code == 404
    assert client.get("/api/scans/nope").status_code == 404
    assert client.get("/api/findings/nope").status_code == 404


def test_demo_history_seeding(isolated_env, monkeypatch):
    monkeypatch.setenv("SEED_DEMO_HISTORY", "true")
    from app.config import get_config
    from app.main import create_app

    get_config.cache_clear()
    with TestClient(create_app()) as c:
        seeded = c.get("/api/scans").json()
        assert len(seeded) == 5 and all(s["trigger"] == "seed" for s in seeded)
        scores = [s["ad_security_score"] for s in reversed(seeded)]
        assert scores == sorted(scores, reverse=True)  # the domain deteriorates over time
        sid = scan(c)
        d = c.get("/api/dashboard/latest").json()
        assert len(d["trend"]) == 6
        diff = c.get(f"/api/scans/{sid}/diff").json()
        assert {x["rule_id"] for x in diff["new"]} >= {"AD-AUTH-SPRAY", "AD-AUTH-BRUTE"}


def test_bind_password_never_leaks(isolated_env, monkeypatch):
    secret = "Sup3r-S3cret-Bind-Pwd!"
    monkeypatch.setenv("LDAP_SERVER", "dc01.corp.local")
    monkeypatch.setenv("LDAP_BIND_USER", "svc_ira_reader@corp.local")
    monkeypatch.setenv("LDAP_BIND_PASSWORD", secret)
    from app.config import get_config
    from app.main import create_app

    get_config.cache_clear()
    with TestClient(create_app()) as c:
        sid = scan(c)
        texts = [c.get("/api/health").text, c.get(f"/api/scans/{sid}").text, c.get("/api/dashboard/latest").text,
                 c.get("/api/audit").text, c.get("/api/settings").text]
        assert all(secret not in t for t in texts)
        assert c.get("/api/health").json()["config"]["ldap_configured"] is True
    from app.storage.db import reset_engine

    reset_engine()
    for f in isolated_env.glob("test.db*"):
        assert secret.encode() not in f.read_bytes()


def test_scheduled_rescans_are_registered(isolated_env, monkeypatch):
    monkeypatch.setenv("SCHEDULE_INTERVAL_MINUTES", "15")
    from app.config import get_config
    from app.main import create_app

    get_config.cache_clear()
    with TestClient(create_app()) as c:
        job = c.app.state.scheduler.get_job("rescan")
        assert job is not None and job.trigger.interval.total_seconds() == 15 * 60
        assert c.get("/api/health").json()["config"]["schedule_interval_minutes"] == 15
        job.func()  # run one scheduled scan synchronously
        scans = c.get("/api/scans").json()
        assert scans[0]["trigger"] == "scheduled"
        assert c.get("/api/audit").json()[0]["actor"] == "scheduler"

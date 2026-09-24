"""Each analyzer flags the seeded mock objects; the demo numbers are exact."""
import copy

import pytest

from app.core.models import AnalysisSettings, Thresholds

from .conftest import run_analysis


def entity(result, name):
    return next(e for e in result.entities if e.object_name == name)


def findings_for(result, name):
    return {f.rule_id: f for f in result.findings if f.object_name == name}


def objects_with(result, rule_id):
    return sorted({f.object_name for f in result.findings if f.rule_id == rule_id})


# --------------------------------------------------------------------------------------- spec §7/§14
def test_spec_demo_numbers_are_exact(mock_result):
    c = mock_result.counts
    assert c["inactive_users"] == 10
    assert c["service_pne"] == 7
    assert c["disabled_privileged"] == 3
    assert c["excessive_rights"] == 2
    assert c["hidden_admins"] == 1
    assert c["asrep_roastable"] == 1


def test_service_account01_scores_exactly_85_critical(mock_result):
    e = entity(mock_result, "ServiceAccount01")
    assert e.score == 85
    assert e.level.value == "Critical"
    assert e.k == 1.0
    assert sorted(e.rule_ids) == sorted(["AD-SVC-PNE", "AD-SVC-PWD-OLD", "AD-SVC-PRIV", "AD-SVC-NO-OWNER", "AD-SVC-INTERACTIVE"])
    matched = [w for w in e.weight_breakdown if w.matched]
    assert sorted(w.weight for w in matched) == [0.10, 0.25, 0.30, 0.35, 0.50]
    assert any(not w.matched for w in e.weight_breakdown)  # unmatched checks are listed for context
    f = findings_for(mock_result, "ServiceAccount01")["AD-SVC-PWD-OLD"]
    assert "730 days ago" in f.evidence[0].value


def test_nested_escalation_paths(mock_result):
    ivanov = findings_for(mock_result, "ivanov")["AD-PRIV-NESTED"]
    assert ivanov.privilege_path == ["ivanov", "IT-Support", "Helpdesk-L2", "Domain Admins"]
    assert ivanov.path_edges == ["member", "member", "member"]
    assert "T1078.002" in ivanov.mitre
    assert "Remove-ADGroupMember -Identity 'IT-Support' -Members 'ivanov'" in ivanov.remediation_command
    kuz = findings_for(mock_result, "s.kuznetsova")["AD-PRIV-NESTED"]
    assert kuz.privilege_path == ["s.kuznetsova", "Deploy-Operators", "Server-Admins", "Administrators"]
    assert objects_with(mock_result, "AD-PRIV-NESTED") == ["ivanov", "s.kuznetsova"]
    # direct admins are NOT "excessive rights" even though DA is nested in Administrators
    assert "adm.zhukov" not in objects_with(mock_result, "AD-PRIV-NESTED")


def test_hidden_domain_admin_via_primary_group_id(mock_result, mock_snapshot):
    f = findings_for(mock_result, "m.petrov")["AD-PRIV-HIDDEN-PGID"]
    assert f.privilege_path == ["m.petrov", "Domain Admins"]
    assert f.path_edges == ["primaryGroupID"]
    assert f.level.value == "Critical"
    # ...and LDAP_IN_CHAIN alone would have missed it (it does not follow primaryGroupID)
    da_sid = mock_snapshot["domain"]["objectSid"] + "-512"
    assert not any("m.petrov" in dn.lower() for dn in mock_snapshot["in_chain"][da_sid])
    assert "AD-PRIV-NESTED" not in findings_for(mock_result, "m.petrov")


def test_disabled_privileged_and_inactive_privileged(mock_result):
    assert objects_with(mock_result, "AD-PRIV-DISABLED") == ["adm.kairat", "adm.temp", "adm.vendor"]
    assert objects_with(mock_result, "AD-PRIV-INACTIVE") == ["adm.old_it"]
    # privileged inactive accounts are not double-counted as plain inactive users
    assert "adm.old_it" not in objects_with(mock_result, "AD-USR-INACTIVE")


def test_inactive_users_exclude_disabled_and_include_never_logged_on(mock_result):
    inactive = objects_with(mock_result, "AD-USR-INACTIVE")
    assert len(inactive) == 10
    for leaver in ("s.orazov", "t.popova", "u.rakhimov"):
        assert leaver not in inactive
    assert {"q.mamyrov", "r.nikitina"} <= set(inactive)
    ev = findings_for(mock_result, "q.mamyrov")["AD-USR-INACTIVE"].evidence
    assert ev[0].value == "never logged on"


def test_service_account_rules(mock_result):
    assert objects_with(mock_result, "AD-SVC-PNE") == sorted(
        ["ServiceAccount01", "svc_sql", "svc_backup", "svc_web", "sa_monitoring", "srv_scan", "svc_app"])
    assert objects_with(mock_result, "AD-SVC-KERBEROAST") == ["srv_scan", "svc_deploy", "svc_sql", "svc_web"]
    assert findings_for(mock_result, "svc_sql")["AD-SVC-KERBEROAST"].mitre == ["T1558.003"]
    assert "sa_monitoring" in objects_with(mock_result, "AD-SVC-UNUSED")
    # interactive logon enriched from Security log 4624 LogonType 10
    inter = findings_for(mock_result, "svc_backup")["AD-SVC-INTERACTIVE"]
    assert any("LogonType 10" in e.value for e in inter.evidence)
    # gMSA is detected as a service account but is healthy; disabled svc is skipped
    names = {e.object_name for e in mock_result.entities}
    assert "gmsa_iis$" not in names and "svc_old_ftp" not in names


def test_password_and_policy_rules(mock_result):
    assert objects_with(mock_result, "AD-PWD-ASREP") == ["a.nurlanov"]
    assert findings_for(mock_result, "a.nurlanov")["AD-PWD-ASREP"].mitre == ["T1558.004"]
    assert objects_with(mock_result, "AD-PWD-NOTREQD") == ["temp.contractor"]
    assert objects_with(mock_result, "AD-PWD-REVERSIBLE") == ["b.omarova"]
    dom = findings_for(mock_result, "corp.local")
    assert "AD-POL-NO-LOCKOUT" in dom and "AD-POL-MIN-LENGTH" in dom
    assert "Set-ADDefaultDomainPasswordPolicy -Identity 'corp.local' -LockoutThreshold 10" in dom["AD-POL-NO-LOCKOUT"].remediation_command
    assert set(findings_for(mock_result, "PSO-Legacy-Apps")) == {"AD-POL-MIN-LENGTH", "AD-POL-NO-COMPLEXITY"}
    assert "PSO-Tier0-Admins" not in {e.object_name for e in mock_result.entities}


def test_spray_and_brute_force_detection(mock_result):
    spray = findings_for(mock_result, "10.0.13.77")["AD-AUTH-SPRAY"]
    assert spray.object_type == "host"
    assert spray.mitre == ["T1110.003"]
    assert any(e.value.startswith("14 in") for e in spray.evidence)
    brute = findings_for(mock_result, "d.omarov")
    assert "AD-AUTH-BRUTE" in brute and "AD-USR-LOCKED" in brute
    assert "22" in brute["AD-AUTH-BRUTE"].title
    # the brute-force source (1 account) is not a spray source
    assert objects_with(mock_result, "AD-AUTH-SPRAY") == ["10.0.13.77"]


def test_extra_checks(mock_result):
    assert objects_with(mock_result, "AD-CMP-INACTIVE") == ["LAPTOP-OLD-07$", "WS-OLD-01$", "WS-OLD-02$"]
    assert objects_with(mock_result, "AD-EXT-UNCONSTRAINED") == ["APP-SRV02$"]  # DC01 excluded by design
    assert objects_with(mock_result, "AD-EXT-KRBTGT-OLD") == ["krbtgt"]
    assert objects_with(mock_result, "AD-EXT-SIDHISTORY") == ["migrated.user"]
    assert objects_with(mock_result, "AD-EXT-DUP-SPN") == ["WEB01$", "svc_web"]
    assert objects_with(mock_result, "AD-PRIV-DA-OVERSIZED") == ["Domain Admins"]
    assert objects_with(mock_result, "AD-PRIV-MULTI") == ["adm.sokolov"]
    assert objects_with(mock_result, "AD-PRIV-ADMINCOUNT-ORPHAN") == ["former.admin"]


def test_healthy_accounts_have_no_findings(mock_result):
    names = {e.object_name for e in mock_result.entities}
    for healthy in ("a.abenov", "v.pak", "adm.zhukov", "adm.dns", "WS-001$", "DC01$", "Guest"):
        assert healthy not in names


def test_every_rule_fires_at_least_once(mock_result):
    from app.core.rules_loader import load_rules

    fired = {f.rule_id for f in mock_result.findings}
    missing = set(load_rules()) - fired
    # policy reversible encryption is the only rule not seeded (the mock policy is sane there)
    assert missing <= {"AD-POL-REVERSIBLE"}, missing


def test_ad_security_score_and_categories(mock_result):
    assert 0 < mock_result.ad_security_score < 60  # a demo domain with real problems
    assert set(mock_result.category_scores) == {"Stale", "Privileged", "Passwords", "Service", "Config"}
    assert all(0 < v <= 20 for v in mock_result.category_scores.values())


# --------------------------------------------------------------------------------------- robustness
def test_russian_locale_dc_group_names_do_not_matter(mock_snapshot):
    snap = copy.deepcopy(mock_snapshot)
    ru = {"Domain Admins": "Администраторы домена", "Administrators": "Администраторы",
          "Enterprise Admins": "Администраторы предприятия", "Schema Admins": "Администраторы схемы",
          "Backup Operators": "Операторы архива", "Account Operators": "Операторы учета"}
    renames = {}
    for g in snap["groups"]:
        if g["sAMAccountName"] in ru:
            old_dn = g["distinguishedName"]
            new_dn = old_dn.replace(f"CN={g['sAMAccountName']},", f"CN={ru[g['sAMAccountName']]},", 1)
            renames[old_dn] = new_dn
            g["sAMAccountName"] = ru[g["sAMAccountName"]]
            g["distinguishedName"] = new_dn
    for kind in ("users", "computers", "gmsa", "groups"):
        for r in snap[kind]:
            for attr in ("member", "memberOf"):
                if attr in r:
                    r[attr] = [renames.get(x, x) for x in r[attr]]
    snap["in_chain"] = {sid: [renames.get(x, x) for x in dns] for sid, dns in snap["in_chain"].items()}
    result = run_analysis(snap)
    assert result.counts["excessive_rights"] == 2
    assert result.counts["disabled_privileged"] == 3
    assert result.counts["hidden_admins"] == 1
    ivanov = findings_for(result, "ivanov")["AD-PRIV-NESTED"]
    assert ivanov.privilege_path[-1] == "Администраторы домена"
    assert entity(result, "ServiceAccount01").score == 85


def test_group_nesting_cycles_terminate(mock_snapshot):
    snap = copy.deepcopy(mock_snapshot)
    groups = {g["sAMAccountName"]: g for g in snap["groups"]}
    # Domain Admins -> Helpdesk-L2 -> Domain Admins (cycle through a critical group)
    groups["Helpdesk-L2"]["member"].append(groups["Domain Admins"]["distinguishedName"])
    result = run_analysis(snap)
    assert findings_for(result, "ivanov")["AD-PRIV-NESTED"].privilege_path[-1] == "Domain Admins"


def test_in_chain_crosscheck_catches_unreadable_nesting(mock_snapshot):
    snap = copy.deepcopy(mock_snapshot)
    # simulate an intermediate group we cannot read: drop IT-Support from the snapshot
    snap["groups"] = [g for g in snap["groups"] if g["sAMAccountName"] != "IT-Support"]
    for u in snap["users"]:
        u["memberOf"] = [m for m in u["memberOf"] if "IT-Support" not in m]
    result = run_analysis(snap)
    f = findings_for(result, "ivanov")["AD-PRIV-NESTED"]
    assert f.path_edges == ["in_chain", "in_chain"]
    assert any("LDAP_IN_CHAIN" in w for w in result.meta["warnings"])


def test_thresholds_change_results_and_are_strict(mock_snapshot):
    res = run_analysis(mock_snapshot, AnalysisSettings(thresholds=Thresholds(inactive_days=200)))
    # 402d, 250d, 366d, never-logged-on created 300d; o.khan is exactly 200d -> not "older than"
    assert set(objects_with(res, "AD-USR-INACTIVE")) == {"i.alimov", "m.fedorova", "n.gaziz", "q.mamyrov"}
    assert res.counts["inactive_users"] == 4


def test_disabling_a_rule_removes_its_findings(mock_snapshot):
    res = run_analysis(mock_snapshot, AnalysisSettings(rule_enabled={"AD-SVC-NO-OWNER": False}))
    assert "AD-SVC-NO-OWNER" not in {f.rule_id for f in res.findings}
    e = entity(res, "ServiceAccount01")
    assert e.score == 83  # 1-(.7*.65*.5*.75)=0.829375 -> 83
    assert all(w.rule != "AD-SVC-NO-OWNER" for w in e.weight_breakdown)


def test_weight_override_rescores(mock_snapshot):
    res = run_analysis(mock_snapshot, AnalysisSettings(rule_weights={"AD-PRIV-HIDDEN-PGID": 0.4}))
    assert entity(res, "m.petrov").score == 48  # 0.4 * k1.2


def test_no_event_logs_degrades_gracefully(mock_snapshot):
    snap = copy.deepcopy(mock_snapshot)
    snap["auth_events"] = {"status": "unavailable", "source": None, "detail": "no access", "events": []}
    res = run_analysis(snap)
    assert res.counts["spray_sources"] == 0 and res.counts["brute_force_targets"] == 0
    assert res.meta["eventlog"]["status"] == "unavailable"
    # LDAP-only interactive heuristic still works (userWorkstations empty)
    assert "AD-SVC-INTERACTIVE" in findings_for(res, "ServiceAccount01")
    assert entity(res, "ServiceAccount01").score == 85


@pytest.mark.parametrize("prefix_list,expected_service", [(["svc_"], False), (["svc_", "sa_"], True)])
def test_service_heuristics_configurable(mock_snapshot, prefix_list, expected_service):
    s = AnalysisSettings()
    s.service.name_prefixes = prefix_list
    s.service.ou_markers = []
    res = run_analysis(mock_snapshot, s)
    types = {e.object_name: e.object_type for e in res.entities}
    assert (types.get("sa_monitoring") == "serviceAccount") is expected_service


def test_finding_ids_are_stable(mock_snapshot):
    a = {f.id for f in run_analysis(mock_snapshot).findings}
    b = {f.id for f in run_analysis(mock_snapshot).findings}
    assert a == b

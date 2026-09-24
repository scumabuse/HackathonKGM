"""The risk engine is the contract every Radar module relies on — pin its math down."""
import math

import pytest

from app.core.models import AnalysisSettings, LevelCutoffs, RiskLevel
from app.core.risk_engine import (
    ad_security_score,
    category_penalty,
    level_for,
    object_score,
    probabilistic_or,
    weight_breakdown,
)
from app.core.rules_loader import effective_rules, load_rules, render

SERVICE_ACCOUNT01_RULES = ["AD-SVC-PNE", "AD-SVC-PWD-OLD", "AD-SVC-PRIV", "AD-SVC-NO-OWNER", "AD-SVC-INTERACTIVE"]


def test_spec_example_service_account01_is_85_critical_with_literal_weights():
    # Spec §6: PNE 0.30, pwd unchanged 730d 0.35, elevated rights 0.50, no owner 0.10, interactive 0.25, k=1.0
    weights = [0.30, 0.35, 0.50, 0.10, 0.25]
    assert math.isclose(probabilistic_or(weights), 1 - (0.70 * 0.65 * 0.50 * 0.90 * 0.75))
    score = object_score(weights, k=1.0)
    assert score == 85
    assert level_for(score) is RiskLevel.CRITICAL


def test_yaml_weights_reproduce_service_account01_85():
    rules = load_rules()
    weights = [rules[r].weight for r in SERVICE_ACCOUNT01_RULES]
    assert weights == [0.30, 0.35, 0.50, 0.10, 0.25]
    assert object_score(weights, k=1.0) == 85


def test_certificate_radar_example_is_module_agnostic():
    # Dormant example from Certificate Radar: "5 days left" weight 0.75 on a Tier-0 cert, k=1.2 -> 90
    assert object_score([0.75], k=1.2) == 90
    assert level_for(90) is RiskLevel.CRITICAL


@pytest.mark.parametrize(
    "weights,k,expected",
    [([], 1.0, 0), ([0.0], 1.0, 0), ([1.0], 1.0, 100), ([0.9, 0.9], 1.2, 100), ([0.35], 1.0, 35), ([0.30], 1.2, 36)],
)
def test_object_score_bounds_and_values(weights, k, expected):
    assert object_score(weights, k) == expected


def test_score_never_exceeds_100_and_compounds_monotonically():
    prev = 0
    ws = []
    for w in [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]:
        ws.append(w)
        s = object_score(ws, k=1.2)
        assert prev <= s <= 100
        prev = s


def test_invalid_weight_rejected():
    with pytest.raises(ValueError):
        object_score([1.5])
    with pytest.raises(ValueError):
        object_score([0.5], k=0)


@pytest.mark.parametrize("score,level", [(100, "Critical"), (80, "Critical"), (79, "High"), (60, "High"), (59, "Medium"), (30, "Medium"), (29, "Low"), (0, "Low")])
def test_level_boundaries(score, level):
    assert level_for(score).value == level


def test_level_cutoffs_configurable_and_validated():
    c = LevelCutoffs(critical=90, high=70, medium=40)
    assert level_for(85, c) is RiskLevel.HIGH
    with pytest.raises(ValueError):
        LevelCutoffs(critical=50, high=60, medium=30)


def test_breakdown_orders_matched_first():
    items = weight_breakdown([("A", "a", 0.1), ("B", "b", 0.5), ("C", "c", 0.9)], {"A", "B"})
    assert [i.rule for i in items] == ["B", "A", "C"]
    assert [i.matched for i in items] == [True, True, False]


def test_ad_security_score_perfect_domain_is_100():
    score, cats = ad_security_score([])
    assert score == 100
    assert set(cats) == {"Stale", "Privileged", "Passwords", "Service", "Config"}
    assert all(v == 0 for v in cats.values())


def test_category_penalty_capped_at_20():
    # 1000 critical findings in one category must not cost more than 20 points
    score, cats = ad_security_score([("Stale", 1.2)] * 1000)
    assert cats["Stale"] <= 20
    assert score >= 80
    assert category_penalty(10_000, tau=6.0) <= 20


def test_ad_security_score_scales_with_count_and_severity():
    few = ad_security_score([("Privileged", 0.3)] * 2)[0]
    many = ad_security_score([("Privileged", 0.3)] * 10)[0]
    severe = ad_security_score([("Privileged", 0.9)] * 2)[0]
    assert 100 > few > many
    assert few > severe
    worst, _ = ad_security_score([(c, 5.0) for c in ["Stale", "Privileged", "Passwords", "Service", "Config"]] * 50)
    assert worst == 0


def test_settings_weight_overrides_apply():
    s = AnalysisSettings(rule_weights={"AD-SVC-NO-OWNER": 0.5}, rule_enabled={"AD-USR-LOCKED": False})
    rules = effective_rules(s)
    assert rules["AD-SVC-NO-OWNER"].weight == 0.5
    assert rules["AD-USR-LOCKED"].enabled is False
    assert load_rules()["AD-SVC-NO-OWNER"].weight == 0.10  # catalogue itself untouched


def test_settings_reject_out_of_range_weights():
    with pytest.raises(ValueError):
        AnalysisSettings(rule_weights={"AD-SVC-PNE": 1.3})


def test_rule_catalogue_is_valid_and_complete():
    rules = load_rules()
    assert len(rules) >= 30
    for rid, r in rules.items():
        assert 0 <= r.weight <= 1
        assert r.name and r.title and r.recommendation
    # every category is represented
    assert {r.category for r in rules.values()} == {"Stale", "Privileged", "Passwords", "Service", "Config"}


def test_template_render_is_safe_for_missing_keys():
    assert render("Hello {who} {missing}", {"who": "svc"}) == "Hello svc <missing>"
    assert render("@{{a=1}}", {}) == "@{a=1}"

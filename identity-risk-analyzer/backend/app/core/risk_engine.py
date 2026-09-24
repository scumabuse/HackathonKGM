"""The shared, module-agnostic risk engine. Pure functions — no I/O, no AD knowledge.

Per-object score (probabilistic OR, so signals compound but never exceed 100):

    score = min(100, round(100 * (1 - prod(1 - w_i)) * k))

AD Security Score (domain health, HIGHER IS BETTER):

    100 - sum_c penalty_c,   penalty_c = CAP * (1 - exp(-S_c / tau)),   S_c = sum(w_i * k_i)

Each category penalty saturates smoothly towards CAP (20), so one category can never
zero the domain on its own, and the penalty grows with both count and severity.
"""
from __future__ import annotations

import math
from collections.abc import Iterable, Sequence

from .constants import CATEGORIES, CATEGORY_PENALTY_CAP
from .models import LevelCutoffs, RiskLevel, WeightItem


def round_half_up(x: float) -> int:
    """Conventional rounding (Python's round() is banker's rounding). Epsilon absorbs float noise."""
    return int(math.floor(x + 0.5 + 1e-9))


def probabilistic_or(weights: Iterable[float]) -> float:
    """1 - prod(1 - w). Each w must be within 0..1."""
    remaining = 1.0
    for w in weights:
        if not 0.0 <= w <= 1.0:
            raise ValueError(f"rule weight {w} outside 0..1")
        remaining *= 1.0 - w
    return 1.0 - remaining


def object_score(weights: Sequence[float], k: float = 1.0) -> int:
    """Object Risk Score, 0..100 (higher = worse)."""
    if k <= 0:
        raise ValueError("criticality multiplier k must be positive")
    if not weights:
        return 0
    return max(0, min(100, round_half_up(100.0 * probabilistic_or(weights) * k)))


def level_for(score: int, cutoffs: LevelCutoffs | None = None) -> RiskLevel:
    c = cutoffs or LevelCutoffs()
    if score >= c.critical:
        return RiskLevel.CRITICAL
    if score >= c.high:
        return RiskLevel.HIGH
    if score >= c.medium:
        return RiskLevel.MEDIUM
    return RiskLevel.LOW


def weight_breakdown(
    applicable: Sequence[tuple[str, str, float]], matched: set[str], titles_i18n: dict[str, dict[str, str]] | None = None
) -> list[WeightItem]:
    """applicable: (rule_id, title, weight) for every enabled rule that applies to the object type.

    Matched rules come first (heaviest first), then the unmatched ones for context.
    """
    tx = titles_i18n or {}
    items = [WeightItem(rule=r, title=t, weight=round(w, 4), matched=r in matched, title_i18n=tx.get(r, {}))
             for r, t, w in applicable]
    items.sort(key=lambda i: (not i.matched, -i.weight, i.rule))
    return items


def category_penalty(severity_sum: float, tau: float, cap: float = CATEGORY_PENALTY_CAP) -> float:
    if severity_sum <= 0:
        return 0.0
    return cap * (1.0 - math.exp(-severity_sum / tau))


def ad_security_score(
    items: Iterable[tuple[str, float]], tau: float = 6.0, categories: Sequence[str] = CATEGORIES
) -> tuple[int, dict[str, float]]:
    """items: (category, severity) per finding where severity = rule_weight * k.

    Returns (score 0..100 higher-is-better, {category: penalty 0..20}).
    """
    sums = {c: 0.0 for c in categories}
    for cat, sev in items:
        if cat not in sums:
            raise ValueError(f"unknown category {cat!r}")
        sums[cat] += max(0.0, sev)
    penalties = {c: round(category_penalty(s, tau), 1) for c, s in sums.items()}
    score = 100 - round_half_up(sum(category_penalty(s, tau) for s in sums.values()))
    return max(0, min(100, score)), penalties


def security_band(score: int) -> str:
    """Band for the AD Security Score (higher is better)."""
    if score >= 80:
        return "Good"
    if score >= 60:
        return "Fair"
    if score >= 40:
        return "Poor"
    return "Critical"

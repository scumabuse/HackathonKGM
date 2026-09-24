"""Module-agnostic pipeline: rule hits -> scored Findings/Entities -> ScanResult.

The module (identity today) supplies hits and object metadata; this code owns everything that
must be identical across Radar modules: template rendering, per-object scoring, levels, the
"why this score" breakdown, stable IDs and the domain health score.
"""
from __future__ import annotations

import hashlib
from collections import defaultdict
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any, Protocol

from .models import (
    LEVEL_ORDER,
    AnalysisSettings,
    Entity,
    Finding,
    RuleDef,
    RuleHit,
    ScanResult,
)
from .i18n import TRANSLATED, pick
from .risk_engine import ad_security_score, level_for, object_score, weight_breakdown
from .rules_loader import effective_rules, render

# Rules whose privilege_path best explains an object, in priority order.
PATH_PRIORITY = ["AD-PRIV-HIDDEN-PGID", "AD-PRIV-NESTED", "AD-SVC-PRIV", "AD-PRIV-DISABLED", "AD-PRIV-INACTIVE"]


class RadarModule(Protocol):
    module: str

    def analyze(self) -> list[RuleHit]: ...
    def domain_of(self) -> str: ...
    def template_base(self) -> dict[str, str]: ...
    def object_meta(self, dn: str, object_type: str) -> Any: ...
    def counts(self, rule_objects: dict[str, set[str]]) -> dict[str, int]: ...
    def meta(self) -> dict[str, Any]: ...


def stable_id(*parts: str, length: int = 16) -> str:
    return hashlib.sha1("|".join(p.lower() for p in parts).encode("utf-8")).hexdigest()[:length]


def object_id_for(dn: str) -> str:
    return stable_id(dn, length=12)


def ps_quote(value: str) -> str:
    """Escape for use inside a PowerShell single-quoted string."""
    return value.replace("'", "''")


def score_hits(
    mod: RadarModule,
    hits: list[RuleHit],
    settings: AnalysisSettings,
    *,
    scan_id: str,
    started_at: datetime,
    source: str,
    trigger: str = "manual",
    parent_scan_id: str | None = None,
    first_seen_lookup: Callable[[list[str]], dict[str, datetime]] | None = None,
    rules: dict[str, RuleDef] | None = None,
) -> ScanResult:
    rules = rules or effective_rules(settings)
    now = datetime.now(UTC)
    base_vars = mod.template_base()
    names_i18n = {r.id: {lang: tx.name for lang, tx in r.i18n.items() if tx.name} for r in rules.values()}

    # keep enabled rules only; de-duplicate (rule, object)
    unknown = sorted({h.rule_id for h in hits if h.rule_id not in rules})
    if unknown:
        raise ValueError(f"analyzer emitted unknown rule ids: {unknown}")
    by_object: dict[str, list[RuleHit]] = defaultdict(list)
    seen: set[tuple[str, str]] = set()
    for h in hits:
        key = (h.rule_id, h.object_dn.lower())
        if not rules[h.rule_id].enabled or key in seen:
            continue
        seen.add(key)
        by_object[h.object_dn.lower()].append(h)

    all_ids = [stable_id(h.rule_id, h.object_dn) for hs in by_object.values() for h in hs]
    first_seen = first_seen_lookup(all_ids) if first_seen_lookup else {}

    findings: list[Finding] = []
    entities: list[Entity] = []
    severity_items: list[tuple[str, float]] = []
    rule_objects: dict[str, set[str]] = defaultdict(set)

    for dn_l, obj_hits in by_object.items():
        head = obj_hits[0]
        meta = mod.object_meta(head.object_dn, head.object_type)
        k = settings.k_tier0 if meta.k_tier0 else 1.0
        matched = {h.rule_id for h in obj_hits}
        score = object_score([rules[r].weight for r in matched], k)
        level = level_for(score, settings.levels)
        applicable = [
            (r.id, r.name, r.weight)
            for r in rules.values()
            if r.enabled and head.object_type in r.applies_to and (r.listed_when_unmatched or r.id in matched)
        ]
        breakdown = weight_breakdown(applicable, matched, names_i18n)
        oid = object_id_for(head.object_dn)

        obj_vars = {**base_vars, "name": head.object_name, "object_sid": meta.object_sid or ""}
        obj_findings: list[Finding] = []
        for h in obj_hits:
            rule = rules[h.rule_id]
            all_vars = {**obj_vars, "sam": h.object_name, "dn": h.object_dn, **h.template_vars}
            raw_vars = {key: pick(v, "en") for key, v in all_vars.items()}
            # "ps_*" vars are pre-built PowerShell fragments (already escaped by the analyzer)
            ps_vars = {key: v if key.startswith("ps_") else ps_quote(v) for key, v in raw_vars.items()}
            texts: dict[str, dict[str, str]] = {}
            for lang in TRANSLATED:
                tx = rule.i18n.get(lang)
                if tx is None:
                    continue
                lang_vars = {key: pick(v, lang) for key, v in all_vars.items()}
                texts[lang] = {
                    "title": render(tx.title or rule.title, lang_vars) or "",
                    "description": render(tx.description or rule.description, lang_vars) or "",
                    "recommendation": render(tx.recommendation or rule.recommendation, lang_vars) or "",
                }
            fid = stable_id(h.rule_id, h.object_dn)
            f = Finding(
                id=fid,
                module=mod.module,
                rule_id=rule.id,
                category=rule.category,
                object_type=h.object_type,
                object_id=oid,
                object_name=h.object_name,
                object_dn=h.object_dn,
                title=render(rule.title, raw_vars) or rule.name,
                description=render(rule.description, raw_vars) or "",
                recommendation=render(rule.recommendation, raw_vars) or "",
                remediation_command=render(rule.remediation_command, ps_vars),
                level=level,
                score=score,
                rule_weight=rule.weight,
                k=k,
                weight_breakdown=breakdown,
                evidence=h.evidence,
                privilege_path=h.privilege_path,
                path_edges=h.path_edges,
                mitre=rule.mitre,
                first_seen=first_seen.get(fid, started_at),
                last_seen=started_at,
                i18n=texts,
            )
            obj_findings.append(f)
            severity_items.append((rule.category, rule.weight * k))
            rule_objects[rule.id].add(dn_l)

        obj_findings.sort(key=lambda f: -f.rule_weight)
        findings.extend(obj_findings)
        path_hit = next((h for r in PATH_PRIORITY for h in obj_hits if h.rule_id == r and h.privilege_path), None)
        entities.append(Entity(
            object_id=oid,
            object_name=head.object_name,
            object_dn=head.object_dn,
            object_type=head.object_type,
            display_name=meta.display_name,
            enabled=meta.enabled,
            tier0=meta.tier0,
            privileged=meta.privileged,
            score=score,
            level=level,
            k=k,
            categories=sorted({f.category for f in obj_findings}),
            rule_ids=[f.rule_id for f in obj_findings],
            finding_count=len(obj_findings),
            top_title=obj_findings[0].title,
            top_title_i18n={lang: tx["title"] for lang, tx in obj_findings[0].i18n.items()},
            privilege_path=path_hit.privilege_path if path_hit else None,
            path_edges=path_hit.path_edges if path_hit else None,
            weight_breakdown=breakdown,
            attributes=meta.attributes,
            attributes_i18n=meta.attributes_i18n,
        ))

    entities.sort(key=lambda e: (-e.score, -LEVEL_ORDER[e.level], e.object_name.lower()))
    order = {e.object_id: i for i, e in enumerate(entities)}
    findings.sort(key=lambda f: (order[f.object_id], -f.rule_weight))

    domain_score, category_scores = ad_security_score(severity_items, tau=settings.score_tau)
    counts: dict[str, int] = {lvl: 0 for lvl in ("Critical", "High", "Medium", "Low")}
    for e in entities:
        counts[e.level.value] += 1
    counts["findings"] = len(findings)
    counts["objects_at_risk"] = len(entities)
    counts.update(mod.counts(rule_objects))

    meta = mod.meta()
    meta["timings"] = meta.get("timings", {})
    meta["settings"] = settings.model_dump()
    return ScanResult(
        scan_id=scan_id,
        started_at=started_at,
        finished_at=now,
        source=source,
        domain=mod.domain_of(),
        ad_security_score=domain_score,
        counts=counts,
        category_scores=category_scores,
        findings=findings,
        entities=entities,
        trigger=trigger,
        parent_scan_id=parent_scan_id,
        meta=meta,
    )

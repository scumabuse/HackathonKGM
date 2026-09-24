"""Exporters share the flat row layout, per-language labels and spreadsheet-injection protection.

Callers pass findings/entities already localized (api/localize.py); exporters only translate the
static labels and the level / category / object-type enumerations.
"""
from __future__ import annotations

from ..core.models import Finding, ScanResult
from .labels import category_name, labels, level_name, type_name

COLUMN_KEYS = [
    "level", "score", "rule_weight", "k", "category", "rule_id", "title", "object_type", "object_name", "object_dn",
    "description", "evidence", "privilege_path", "recommendation", "remediation_command", "mitre", "first_seen",
    "finding_id",
]

_DANGEROUS_PREFIX = ("=", "+", "-", "@", "\t", "\r")


def column_labels(lang: str) -> list[str]:
    lab = labels(lang)
    return [lab[f"col.{k}"] for k in COLUMN_KEYS]


def neutralize(value: object) -> object:
    """Prevent CSV/Excel formula injection from directory-controlled strings (OWASP)."""
    if isinstance(value, str) and value.startswith(_DANGEROUS_PREFIX):
        return "'" + value
    return value


def finding_row(f: Finding, lang: str = "en") -> dict[str, object]:
    return {
        "level": level_name(f.level.value, lang), "score": f.score, "rule_weight": f.rule_weight, "k": f.k,
        "category": category_name(f.category, lang), "rule_id": f.rule_id, "title": f.title,
        "object_type": type_name(f.object_type, lang), "object_name": f.object_name, "object_dn": f.object_dn,
        "description": f.description,
        "evidence": "; ".join(f"{e.attribute}: {e.value}" for e in f.evidence),
        "privilege_path": " → ".join(f.privilege_path) if f.privilege_path else "",
        "recommendation": f.recommendation, "remediation_command": f.remediation_command or "",
        "mitre": ", ".join(f.mitre), "first_seen": f.first_seen.strftime("%Y-%m-%d %H:%M"), "finding_id": f.id,
    }


def export_filename(scan: ScanResult, ext: str) -> str:
    safe_domain = "".join(c if c.isalnum() or c in "-." else "_" for c in scan.domain)
    return f"identity-risk-{safe_domain}-{scan.started_at:%Y%m%d-%H%M}-{scan.scan_id[:8]}.{ext}"

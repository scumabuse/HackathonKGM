"""Aggregated dashboard payload — one request renders the whole dashboard."""
from __future__ import annotations

from fastapi import APIRouter

from ..config import get_config
from ..core.risk_engine import security_band
from ..storage import repositories as repo
from . import localize as loc
from .common import not_found

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/dashboard/{scan_id}", summary="Gauge, counters, charts, top-risk objects, trend, diff")
def dashboard(scan_id: str = "latest", top: int = 8, lang: loc.Lang = loc.LangQuery):
    try:
        s = repo.get_scan_row_summary(scan_id)
    except repo.NotFound as exc:
        raise not_found(exc) from exc
    trend = [{"scan_id": x["scan_id"], "at": x["started_at"], "score": x["ad_security_score"], "trigger": x["trigger"],
              "findings": x["counts"].get("findings", 0)} for x in reversed(repo.list_scans(limit=60, domain=s["domain"]))]
    diff = repo.diff_scans(s["scan_id"])
    cfg = get_config()
    collector = s["meta"].get("collector", {})
    level_counts = {k: s["counts"].get(k, 0) for k in ("Critical", "High", "Medium", "Low")}
    return {
        "scan": {k: s[k] for k in ("scan_id", "started_at", "finished_at", "source", "domain", "trigger",
                                   "parent_scan_id", "duration_ms")},
        "ad_security_score": s["ad_security_score"],
        "score_band": security_band(s["ad_security_score"]),
        "level_counts": level_counts,
        "counts": s["counts"],
        "category_scores": s["category_scores"],
        "category_matrix": repo.category_level_matrix(s["scan_id"]),
        "top_risky": [loc.entity(e, lang) for e in s["entities"][:max(1, min(top, 50))]],
        "trend": trend,
        "diff": None if diff is None else {
            "previous_scan_id": diff["previous_scan_id"], "score_delta": diff["score_delta"],
            "new": len(diff["new"]), "resolved": len(diff["resolved"]), "worsened": len(diff["worsened"]),
            "improved": len(diff["improved"]), "top_new": [loc.diff_item(x, lang) for x in diff["new"][:5]],
            "top_resolved": [loc.diff_item(x, lang) for x in diff["resolved"][:5]]},
        "eventlog": s["meta"].get("eventlog", {}),
        "warnings": s["meta"].get("warnings", []),
        "timings": s["meta"].get("timings", {}),
        "security_posture": {
            "read_only": bool(collector.get("read_only", True)),
            "bind_user": collector.get("bind_user"),
            "privileges": "Domain Users (+ Event Log Readers for log-based checks)",
            "secrets_collected": False,
            "live_mode_available": cfg.ldap_configured,
        },
    }

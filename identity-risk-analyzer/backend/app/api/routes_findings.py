"""Findings (filter/sort/detail), per-object drilldown and the rule catalogue."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..core.models import Entity, Finding
from ..core.rules_loader import effective_rules, load_rules
from ..storage import repositories as repo
from . import localize as loc
from .common import not_found, split_multi

router = APIRouter(prefix="/api", tags=["findings"])


@router.get("/findings", summary="List findings with filters (comma-separated lists allowed)")
def list_findings(
    scan_id: str = "latest",
    level: str | None = Query(None, description="Critical,High,Medium,Low"),
    category: str | None = Query(None, description="Stale,Privileged,Passwords,Service,Config"),
    object_type: str | None = Query(None, description="user,serviceAccount,computer,group,domain,policy,host"),
    rule_id: str | None = None,
    object_id: str | None = None,
    q: str | None = Query(None, description="search in name, DN, title, rule id"),
    sort: str = Query("score", pattern="^(score|level|weight|object|category|rule|first_seen)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(500, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    lang: loc.Lang = loc.LangQuery,
):
    try:
        sid = repo.resolve_scan_id(scan_id)
        total, items = repo.query_findings(sid, level=split_multi(level), category=split_multi(category),
                                           object_type=split_multi(object_type), rule_id=rule_id, object_id=object_id,
                                           q=q, sort=sort, order=order, limit=limit, offset=offset)
    except repo.NotFound as exc:
        raise not_found(exc) from exc
    return {"scan_id": sid, "total": total, "limit": limit, "offset": offset,
            "items": [loc.finding(f, lang) for f in items]}


@router.get("/findings/{finding_id}", response_model=Finding, summary="One finding incl. weight breakdown & evidence")
def get_finding(finding_id: str, scan_id: str = "latest", lang: loc.Lang = loc.LangQuery):
    try:
        return loc.finding(repo.get_finding(scan_id, finding_id), lang)
    except repo.NotFound as exc:
        raise not_found(exc) from exc


@router.get("/accounts/{object_id}", summary="Per-object drilldown: score, why, evidence, path, fixes, history")
def get_account(object_id: str, scan_id: str = "latest", lang: loc.Lang = loc.LangQuery):
    try:
        summary = repo.get_scan_row_summary(scan_id)
    except repo.NotFound as exc:
        raise not_found(exc) from exc
    raw = next((e for e in summary["entities"] if e["object_id"] == object_id), None)
    if raw is None:
        raise HTTPException(404, f"object {object_id} has no findings in scan {summary['scan_id']}")
    entity = Entity.model_validate(raw)
    _, findings = repo.query_findings(summary["scan_id"], object_id=object_id, sort="weight", limit=1000)
    history = []
    for s in reversed(repo.list_scans(limit=60, domain=summary["domain"])):
        detail = repo.get_scan_row_summary(s["scan_id"])
        hit = next((e for e in detail["entities"] if e["object_id"] == object_id), None)
        history.append({"scan_id": s["scan_id"], "at": s["started_at"], "score": hit["score"] if hit else 0,
                        "trigger": s["trigger"]})
    mitre = sorted({m for f in findings for m in f.mitre})
    return {"scan_id": summary["scan_id"], "domain": summary["domain"], "source": summary["source"],
            "entity": loc.entity(entity, lang), "findings": [loc.finding(f, lang) for f in findings],
            "mitre": mitre, "history": history}


@router.get("/rules", summary="Rule catalogue with effective (settings-adjusted) weights")
def list_rules(lang: loc.Lang = loc.LangQuery):
    settings = repo.load_settings()
    eff = effective_rules(settings)
    base = load_rules()
    out = []
    for r in eff.values():
        tx = r.i18n.get(lang)
        d = {**r.model_dump(exclude={"i18n"}), "default_weight": base[r.id].weight}
        if tx:
            d.update({k: v for k, v in tx.model_dump().items() if v})
        out.append(d)
    return out

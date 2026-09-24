"""Tunable thresholds & rule weights, audit log, health."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from .. import __version__, scanner
from ..config import get_config
from ..core.models import AnalysisSettings
from ..core.rules_loader import load_rules
from ..storage import repositories as repo
from . import localize as loc
from .common import actor, client_ip

router = APIRouter(prefix="/api", tags=["settings"])


def _payload(settings: AnalysisSettings, lang: str = "en") -> dict:
    def name(r) -> str:
        tx = r.i18n.get(lang)
        return tx.name if tx and tx.name else r.name

    return {"settings": settings, "defaults": AnalysisSettings(),
            "rules": [{"id": r.id, "name": name(r), "category": r.category, "default_weight": r.weight,
                       "weight": settings.rule_weights.get(r.id, r.weight),
                       "enabled": settings.rule_enabled.get(r.id, r.enabled), "mitre": r.mitre,
                       "applies_to": r.applies_to} for r in load_rules().values()]}


@router.get("/settings", summary="Current thresholds, level cutoffs, service heuristics and rule weights")
def get_settings(lang: loc.Lang = loc.LangQuery):
    return _payload(repo.load_settings(), lang)


@router.put("/settings", summary="Save settings; ?rescore=true re-analyzes the latest scan with them")
def put_settings(body: AnalysisSettings, request: Request, rescore: bool = False, lang: loc.Lang = loc.LangQuery):
    unknown = (set(body.rule_weights) | set(body.rule_enabled)) - set(load_rules())
    if unknown:
        raise HTTPException(422, f"unknown rule ids: {sorted(unknown)}")
    before = repo.load_settings()
    repo.save_settings(body)
    changed = {k: v for k, v in body.model_dump().items() if before.model_dump().get(k) != v}
    repo.audit("settings.update", actor=actor(request), client_ip=client_ip(request), details={"changed": changed})
    out = _payload(body, lang)
    if rescore and repo.scan_count() > 0:
        res = scanner.rescore("latest", actor=actor(request), client_ip=client_ip(request))
        out["rescored"] = {"scan_id": res.scan_id, "ad_security_score": res.ad_security_score,
                           "parent_scan_id": res.parent_scan_id}
    return out


@router.post("/settings/reset", summary="Restore default settings")
def reset_settings(request: Request, lang: loc.Lang = loc.LangQuery):
    repo.save_settings(AnalysisSettings())
    repo.audit("settings.reset", actor=actor(request), client_ip=client_ip(request))
    return _payload(AnalysisSettings(), lang)


@router.get("/audit", summary="Audit log of all system actions (newest first)")
def audit_log(limit: int = 100):
    return repo.list_audit(max(1, min(limit, 1000)))


@router.get("/health", summary="Liveness + safe configuration summary (never includes secrets)")
def health():
    cfg = get_config()
    return {"status": "ok", "version": __version__, "module": "identity", "scans": repo.scan_count(),
            "read_only": True, "config": cfg.safe_dict(),
            "least_privilege": "Domain Users (+ Event Log Readers for log-based checks); Domain Admin NOT required",
            "stages": scanner.STAGES}

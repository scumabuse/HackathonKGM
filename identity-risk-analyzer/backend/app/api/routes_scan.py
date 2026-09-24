"""Run scans, list history, fetch a full ScanResult, diff, snapshot download, re-score."""
from __future__ import annotations

import json
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel

from .. import scanner
from ..config import get_config
from ..core.models import ScanResult
from ..storage import repositories as repo
from . import localize as loc
from .common import actor, client_ip, not_found

router = APIRouter(prefix="/api", tags=["scans"])


class ScanRequest(BaseModel):
    source: Literal["mock", "ldap", "snapshot"] | None = None  # default: SOURCE from .env
    replay_scan_id: str | None = None  # with source=snapshot: replay a stored scan offline
    wait: bool = True  # False -> returns a job to poll (used by the UI's stepped progress)


@router.post("/scan", summary="Run collect + analyze + score, persist a ScanResult")
def run_scan(body: ScanRequest, request: Request):
    source = body.source or get_config().SOURCE
    if source == "ldap" and not get_config().ldap_configured:
        raise HTTPException(400, "Live LDAP mode is not configured: set LDAP_SERVER, LDAP_BIND_USER and "
                                 "LDAP_BIND_PASSWORD in .env (see .env.example). Mock mode works offline.")
    if body.replay_scan_id:
        try:
            repo.resolve_scan_id(body.replay_scan_id)
        except repo.NotFound as exc:
            raise not_found(exc) from exc
    if not body.wait:
        job = scanner.jobs.start(source, actor=actor(request), client_ip=client_ip(request),
                                 replay_scan_id=body.replay_scan_id)
        return job.as_dict()
    try:
        res = scanner.run_scan(source, actor=actor(request), replay_scan_id=body.replay_scan_id,
                               client_ip=client_ip(request))
    except scanner.ScanError as exc:
        raise HTTPException(502, f"scan failed: {exc}") from exc
    return {"scan_id": res.scan_id, "source": res.source, "domain": res.domain,
            "ad_security_score": res.ad_security_score, "counts": res.counts,
            "findings": len(res.findings), "timings": res.meta.get("timings", {})}


@router.get("/scan/jobs/{job_id}", summary="Progress of an asynchronous scan")
def scan_job(job_id: str):
    job = scanner.jobs.get(job_id)
    if job is None:
        raise HTTPException(404, f"job {job_id} not found")
    return job.as_dict()


@router.get("/scans", summary="Scan history (for the trend chart)")
def list_scans(limit: int = 100):
    return repo.list_scans(limit=max(1, min(limit, 1000)))


@router.get("/scans/{scan_id}", response_model=ScanResult, summary="Full ScanResult ('latest' works as an id)")
def get_scan(scan_id: str, lang: loc.Lang | None = None):
    """Without `lang` the stored result is returned with every translation; with `lang` it is localized."""
    try:
        res = repo.get_scan(scan_id)
    except repo.NotFound as exc:
        raise not_found(exc) from exc
    if lang is None:
        return res
    d = res.model_dump(mode="json")
    d["findings"] = [loc.finding(f, lang) for f in res.findings]
    d["entities"] = [loc.entity(e, lang) for e in res.entities]
    return d


@router.get("/scans/{scan_id}/diff", summary="What changed since the previous (or given) scan")
def diff(scan_id: str, against: str | None = None, lang: loc.Lang = loc.LangQuery):
    try:
        d = repo.diff_scans(scan_id, against)
    except repo.NotFound as exc:
        raise not_found(exc) from exc
    if d:
        for key in ("new", "resolved", "worsened", "improved"):
            d[key] = [loc.diff_item(x, lang) for x in d[key]]
    return d or {"scan_id": repo.resolve_scan_id(scan_id), "previous_scan_id": None, "score_delta": 0,
                 "new": [], "resolved": [], "worsened": [], "improved": []}


@router.get("/scans/{scan_id}/snapshot", summary="Download the raw (secret-free) snapshot for offline replay")
def download_snapshot(scan_id: str, request: Request):
    try:
        sid = repo.resolve_scan_id(scan_id)
        snap = repo.get_snapshot(sid)
    except repo.NotFound as exc:
        raise not_found(exc) from exc
    repo.audit("snapshot.download", actor=actor(request), target=sid, client_ip=client_ip(request))
    return Response(json.dumps(snap, ensure_ascii=False, indent=1), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="ira-snapshot-{sid[:8]}.json"'})


@router.post("/scans/{scan_id}/rescore", summary="Re-analyze the stored snapshot with current settings")
def rescore(scan_id: str, request: Request):
    try:
        res = scanner.rescore(scan_id, actor=actor(request), client_ip=client_ip(request))
    except repo.NotFound as exc:
        raise not_found(exc) from exc
    except scanner.ScanError as exc:
        raise HTTPException(502, f"re-score failed: {exc}") from exc
    return {"scan_id": res.scan_id, "parent_scan_id": res.parent_scan_id, "ad_security_score": res.ad_security_score,
            "counts": res.counts}

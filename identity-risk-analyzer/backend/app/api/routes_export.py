"""CSV / XLSX / HTML downloads (whole scan or the current Findings filter), in the requested language."""
from __future__ import annotations

from fastapi import APIRouter, Query, Request
from fastapi.responses import Response

from ..core.models import Entity, Finding
from ..exporters import export_filename
from ..exporters.csv_exporter import export_csv
from ..exporters.html_exporter import export_html
from ..exporters.xlsx_exporter import export_xlsx
from ..storage import repositories as repo
from . import localize as loc
from .common import actor, client_ip, not_found, split_multi

router = APIRouter(prefix="/api", tags=["export"])

FORMATS = {
    "csv": (export_csv, "text/csv; charset=utf-8"),
    "xlsx": (export_xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    "html": (export_html, "text/html; charset=utf-8"),
}


@router.get("/export/{scan_id}", summary="Download findings as csv | xlsx | html (filters optional)")
def export(
    scan_id: str,
    request: Request,
    format: str = Query("html", pattern="^(csv|xlsx|html)$"),
    level: str | None = None,
    category: str | None = None,
    object_type: str | None = None,
    rule_id: str | None = None,
    q: str | None = None,
    lang: loc.Lang = loc.LangQuery,
):
    try:
        scan = repo.get_scan(scan_id)
        filtered = any([level, category, object_type, rule_id, q])
        findings = None
        if filtered:
            _, findings = repo.query_findings(scan.scan_id, level=split_multi(level), category=split_multi(category),
                                              object_type=split_multi(object_type), rule_id=rule_id, q=q,
                                              limit=100_000)
    except repo.NotFound as exc:
        raise not_found(exc) from exc
    if lang != "en":
        scan = scan.model_copy(update={
            "findings": [Finding.model_validate(loc.finding(f, lang)) for f in scan.findings],
            "entities": [Entity.model_validate(loc.entity(e, lang)) for e in scan.entities],
        })
        if findings is not None:
            findings = [Finding.model_validate(loc.finding(f, lang)) for f in findings]
    fn, media = FORMATS[format]
    body = fn(scan, findings, lang)
    repo.audit("export", actor=actor(request), target=scan.scan_id, client_ip=client_ip(request),
               details={"format": format, "lang": lang,
                        "rows": len(findings) if findings is not None else len(scan.findings),
                        "filters": {"level": level, "category": category, "object_type": object_type,
                                    "rule_id": rule_id, "q": q}})
    return Response(body, media_type=media,
                    headers={"Content-Disposition": f'attachment; filename="{export_filename(scan, format)}"'})

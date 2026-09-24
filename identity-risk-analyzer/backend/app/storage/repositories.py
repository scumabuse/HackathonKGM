"""Persistence: save scans, load history, diff scans, audit log, settings."""
from __future__ import annotations

import gzip
import hashlib
import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import asc, desc, func, or_, select

from ..core.models import LEVEL_ORDER, AnalysisSettings, Entity, Finding, ScanResult
from .db import session_scope
from .schema import AuditRow, FindingRow, ScanRow, SettingRow, SnapshotRow

SETTINGS_KEY = "analysis"


def _utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt.astimezone(UTC)


class NotFound(LookupError):
    pass


# ---------------------------------------------------------------------------------------------- scans
def save_scan(result: ScanResult, snapshot: dict[str, Any] | None) -> None:
    with session_scope() as s:
        s.add(ScanRow(
            id=result.scan_id, started_at=result.started_at, finished_at=result.finished_at, source=result.source,
            domain=result.domain, trigger=result.trigger, parent_scan_id=result.parent_scan_id,
            ad_security_score=result.ad_security_score, counts=result.counts, category_scores=result.category_scores,
            entities=[e.model_dump(mode="json") for e in result.entities], meta=result.meta,
        ))
        s.flush()
        for f in result.findings:
            s.add(FindingRow(
                scan_id=result.scan_id, finding_id=f.id, rule_id=f.rule_id, category=f.category,
                object_type=f.object_type, object_id=f.object_id, object_name=f.object_name, object_dn=f.object_dn,
                title=f.title, level=f.level.value, level_rank=LEVEL_ORDER[f.level], score=f.score,
                rule_weight=f.rule_weight, first_seen=f.first_seen, data=f.model_dump(mode="json"),
                search_text=" ".join([f.object_name, f.object_dn, f.rule_id, f.title,
                                      *(tx.get("title", "") for tx in f.i18n.values())]).lower(),
            ))
        if snapshot is not None:
            raw = json.dumps(snapshot, ensure_ascii=False, sort_keys=True).encode("utf-8")
            s.add(SnapshotRow(scan_id=result.scan_id, collected_at=datetime.fromisoformat(snapshot["collected_at"]),
                              source=snapshot.get("source", result.source), sha256=hashlib.sha256(raw).hexdigest(),
                              data_gz=gzip.compress(raw)))


def first_seen_lookup(domain: str):
    """Returns f(finding_ids) -> {finding_id: earliest first_seen} across previous scans of the domain."""
    def lookup(ids: list[str]) -> dict[str, datetime]:
        if not ids:
            return {}
        out: dict[str, datetime] = {}
        with session_scope() as s:
            for i in range(0, len(ids), 500):
                chunk = ids[i:i + 500]
                rows = s.execute(
                    select(FindingRow.finding_id, func.min(FindingRow.first_seen))
                    .join(ScanRow, ScanRow.id == FindingRow.scan_id)
                    .where(ScanRow.domain == domain, FindingRow.finding_id.in_(chunk))
                    .group_by(FindingRow.finding_id)
                ).all()
                out.update({fid: _utc(ts) for fid, ts in rows})
        return out
    return lookup


def resolve_scan_id(scan_id: str) -> str:
    with session_scope() as s:
        if scan_id == "latest":
            row = s.execute(select(ScanRow.id).order_by(desc(ScanRow.started_at)).limit(1)).scalar()
            if row is None:
                raise NotFound("no scans yet — run a scan first")
            return row
        if s.get(ScanRow, scan_id) is None:
            raise NotFound(f"scan {scan_id} not found")
        return scan_id


def _summary(row: ScanRow) -> dict[str, Any]:
    return {
        "scan_id": row.id, "started_at": _utc(row.started_at), "finished_at": _utc(row.finished_at),
        "source": row.source, "domain": row.domain, "trigger": row.trigger, "parent_scan_id": row.parent_scan_id,
        "ad_security_score": row.ad_security_score, "counts": row.counts,
        "duration_ms": int((_utc(row.finished_at) - _utc(row.started_at)).total_seconds() * 1000),
    }


def list_scans(limit: int = 100, domain: str | None = None) -> list[dict[str, Any]]:
    with session_scope() as s:
        q = select(ScanRow).order_by(desc(ScanRow.started_at)).limit(limit)
        if domain:
            q = q.where(ScanRow.domain == domain)
        return [_summary(r) for r in s.execute(q).scalars()]


def get_scan_row_summary(scan_id: str) -> dict[str, Any]:
    with session_scope() as s:
        row = s.get(ScanRow, resolve_scan_id(scan_id))
        return {**_summary(row), "category_scores": row.category_scores, "meta": row.meta,
                "entities": row.entities}


def get_scan(scan_id: str) -> ScanResult:
    sid = resolve_scan_id(scan_id)
    with session_scope() as s:
        row = s.get(ScanRow, sid)
        frows = s.execute(select(FindingRow).where(FindingRow.scan_id == sid).order_by(FindingRow.pk)).scalars().all()
        return ScanResult(
            scan_id=row.id, started_at=_utc(row.started_at), finished_at=_utc(row.finished_at), source=row.source,
            domain=row.domain, ad_security_score=row.ad_security_score, counts=row.counts,
            category_scores=row.category_scores, findings=[Finding.model_validate(f.data) for f in frows],
            entities=[Entity.model_validate(e) for e in row.entities], trigger=row.trigger,
            parent_scan_id=row.parent_scan_id, meta=row.meta,
        )


def get_snapshot(scan_id: str) -> dict[str, Any]:
    sid = resolve_scan_id(scan_id)
    with session_scope() as s:
        row = s.get(SnapshotRow, sid)
        if row is None:
            raise NotFound(f"no snapshot stored for scan {sid}")
        return json.loads(gzip.decompress(row.data_gz).decode("utf-8"))


def previous_scan_id(scan_id: str) -> str | None:
    with session_scope() as s:
        row = s.get(ScanRow, resolve_scan_id(scan_id))
        prev = s.execute(
            select(ScanRow.id).where(ScanRow.domain == row.domain, ScanRow.started_at < row.started_at)
            .order_by(desc(ScanRow.started_at)).limit(1)
        ).scalar()
        return prev


# ------------------------------------------------------------------------------------------- findings
SORTS = {
    "score": (FindingRow.score, FindingRow.rule_weight),
    "level": (FindingRow.level_rank, FindingRow.score),
    "weight": (FindingRow.rule_weight, FindingRow.score),
    "object": (func.lower(FindingRow.object_name),),
    "category": (FindingRow.category, FindingRow.score),
    "rule": (FindingRow.rule_id,),
    "first_seen": (FindingRow.first_seen,),
}


def query_findings(scan_id: str, *, level: list[str] | None = None, category: list[str] | None = None,
                   object_type: list[str] | None = None, rule_id: str | None = None, object_id: str | None = None,
                   q: str | None = None, sort: str = "score", order: str = "desc",
                   limit: int = 500, offset: int = 0) -> tuple[int, list[Finding]]:
    sid = resolve_scan_id(scan_id)
    stmt = select(FindingRow).where(FindingRow.scan_id == sid)
    if level:
        stmt = stmt.where(FindingRow.level.in_(level))
    if category:
        stmt = stmt.where(FindingRow.category.in_(category))
    if object_type:
        stmt = stmt.where(FindingRow.object_type.in_(object_type))
    if rule_id:
        stmt = stmt.where(FindingRow.rule_id == rule_id)
    if object_id:
        stmt = stmt.where(FindingRow.object_id == object_id)
    if q:
        like = f"%{q.strip().lower()}%"  # Python lower() handles Cyrillic; SQLite lower() does not
        stmt = stmt.where(or_(FindingRow.search_text.like(like), func.lower(FindingRow.object_name).like(like),
                              func.lower(FindingRow.object_dn).like(like), func.lower(FindingRow.title).like(like),
                              func.lower(FindingRow.rule_id).like(like)))
    cols = SORTS.get(sort, SORTS["score"])
    direction = desc if order == "desc" else asc
    stmt = stmt.order_by(*(direction(c) for c in cols), asc(FindingRow.pk))
    with session_scope() as s:
        total = s.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
        rows = s.execute(stmt.limit(limit).offset(offset)).scalars().all()
        return total, [Finding.model_validate(r.data) for r in rows]


def get_finding(scan_id: str, finding_id: str) -> Finding:
    sid = resolve_scan_id(scan_id)
    with session_scope() as s:
        row = s.execute(select(FindingRow).where(FindingRow.scan_id == sid, FindingRow.finding_id == finding_id)).scalar()
        if row is None:
            raise NotFound(f"finding {finding_id} not in scan {sid}")
        return Finding.model_validate(row.data)


def category_level_matrix(scan_id: str) -> list[dict[str, Any]]:
    sid = resolve_scan_id(scan_id)
    with session_scope() as s:
        rows = s.execute(select(FindingRow.category, FindingRow.level, func.count())
                         .where(FindingRow.scan_id == sid).group_by(FindingRow.category, FindingRow.level)).all()
    cats = ["Stale", "Privileged", "Passwords", "Service", "Config"]
    matrix = {c: {"category": c, "Critical": 0, "High": 0, "Medium": 0, "Low": 0, "total": 0} for c in cats}
    for cat, lvl, n in rows:
        matrix.setdefault(cat, {"category": cat, "Critical": 0, "High": 0, "Medium": 0, "Low": 0, "total": 0})
        matrix[cat][lvl] += n
        matrix[cat]["total"] += n
    return list(matrix.values())


def diff_scans(scan_id: str, against: str | None = None) -> dict[str, Any] | None:
    """What changed since the previous (or given) scan: new / resolved / worsened / improved findings."""
    sid = resolve_scan_id(scan_id)
    base = resolve_scan_id(against) if against else previous_scan_id(sid)
    if base is None:
        return None
    with session_scope() as s:
        cur = {r.finding_id: r for r in s.execute(select(FindingRow).where(FindingRow.scan_id == sid)).scalars()}
        old = {r.finding_id: r for r in s.execute(select(FindingRow).where(FindingRow.scan_id == base)).scalars()}
        cur_score = s.get(ScanRow, sid).ad_security_score
        old_score = s.get(ScanRow, base).ad_security_score

    def brief(r: FindingRow) -> dict[str, Any]:
        titles = {lang: tx.get("title", "") for lang, tx in (r.data.get("i18n") or {}).items()}
        return {"finding_id": r.finding_id, "rule_id": r.rule_id, "title": r.title, "title_i18n": titles,
                "object_name": r.object_name, "object_id": r.object_id, "level": r.level, "score": r.score}

    new = [brief(cur[f]) for f in cur.keys() - old.keys()]
    resolved = [brief(old[f]) for f in old.keys() - cur.keys()]
    worsened = [{**brief(cur[f]), "previous_score": old[f].score} for f in cur.keys() & old.keys() if cur[f].score > old[f].score]
    improved = [{**brief(cur[f]), "previous_score": old[f].score} for f in cur.keys() & old.keys() if cur[f].score < old[f].score]
    key = lambda d: (-d["score"], d["object_name"])  # noqa: E731
    return {"scan_id": sid, "previous_scan_id": base, "score_delta": cur_score - old_score,
            "new": sorted(new, key=key), "resolved": sorted(resolved, key=key),
            "worsened": sorted(worsened, key=key), "improved": sorted(improved, key=key)}


def scan_count() -> int:
    with session_scope() as s:
        return s.execute(select(func.count()).select_from(ScanRow)).scalar_one()


# ---------------------------------------------------------------------------------------------- audit
def audit(action: str, *, actor: str = "system", target: str | None = None, client_ip: str | None = None,
          details: dict[str, Any] | None = None) -> None:
    with session_scope() as s:
        s.add(AuditRow(ts=datetime.now(UTC), actor=actor[:255], action=action, target=target, client_ip=client_ip,
                       details=details or {}))


def list_audit(limit: int = 100) -> list[dict[str, Any]]:
    with session_scope() as s:
        rows = s.execute(select(AuditRow).order_by(desc(AuditRow.id)).limit(limit)).scalars()
        return [{"id": r.id, "ts": _utc(r.ts), "actor": r.actor, "action": r.action, "target": r.target,
                 "client_ip": r.client_ip, "details": r.details} for r in rows]


# ------------------------------------------------------------------------------------------- settings
def load_settings() -> AnalysisSettings:
    with session_scope() as s:
        row = s.get(SettingRow, SETTINGS_KEY)
        return AnalysisSettings.model_validate(row.value) if row else AnalysisSettings()


def save_settings(settings: AnalysisSettings) -> AnalysisSettings:
    with session_scope() as s:
        row = s.get(SettingRow, SETTINGS_KEY)
        value = settings.model_dump(mode="json")
        if row is None:
            s.add(SettingRow(key=SETTINGS_KEY, value=value, updated_at=datetime.now(UTC)))
        else:
            row.value = value
            row.updated_at = datetime.now(UTC)
    return settings

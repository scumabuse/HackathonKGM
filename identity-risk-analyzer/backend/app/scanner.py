"""Scan orchestration: collect -> analyze -> score -> persist, with stage progress for the UI."""
from __future__ import annotations

import logging
import threading
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from .analyzers import IdentityModule
from .collectors.base import Collector, CollectorError, sanitize_snapshot
from .collectors.mock_collector import MockCollector, SnapshotCollector, demo_history_variant
from .config import get_config
from .core.models import AnalysisSettings, ScanResult
from .core.pipeline import score_hits
from .storage import repositories as repo

log = logging.getLogger("ira.scanner")

STAGES = ["queued", "collecting", "analyzing", "scoring", "persisting", "done"]


class ScanError(RuntimeError):
    pass


def build_collector(source: str, replay_scan_id: str | None = None) -> Collector:
    cfg = get_config()
    if source == "mock":
        return MockCollector(cfg.MOCK_DATA_PATH, now=cfg.ANALYSIS_DATE)
    if source == "ldap":
        from .collectors.ldap_collector import LdapCollector  # lazy: ldap3 only needed in live mode

        return LdapCollector.from_config(cfg)
    if source == "snapshot":
        if replay_scan_id:
            return SnapshotCollector(snapshot=repo.get_snapshot(replay_scan_id), label=repo.resolve_scan_id(replay_scan_id))
        if cfg.SNAPSHOT_PATH:
            return SnapshotCollector(path=cfg.SNAPSHOT_PATH, label=cfg.SNAPSHOT_PATH.name)
        raise ScanError("source=snapshot needs replay_scan_id or SNAPSHOT_PATH")
    raise ScanError(f"unknown source {source!r}")


def analyze_snapshot(snapshot: dict[str, Any], settings: AnalysisSettings, *, scan_id: str, started_at: datetime,
                     source: str, trigger: str, parent_scan_id: str | None = None,
                     on_stage: Callable[[str], None] | None = None) -> ScanResult:
    stage = on_stage or (lambda _s: None)
    cfg = get_config()
    stage("analyzing")
    t0 = time.perf_counter()
    mod = IdentityModule(snapshot, settings, now=cfg.ANALYSIS_DATE)
    hits = mod.analyze()
    t1 = time.perf_counter()
    stage("scoring")
    result = score_hits(mod, hits, settings, scan_id=scan_id, started_at=started_at, source=source, trigger=trigger,
                        parent_scan_id=parent_scan_id, first_seen_lookup=repo.first_seen_lookup(mod.domain_of()))
    result.meta["timings"] = {"analyze_ms": round((t1 - t0) * 1000, 1),
                              "score_ms": round((time.perf_counter() - t1) * 1000, 1)}
    return result


def run_scan(source: str | None = None, *, trigger: str = "manual", actor: str = "system",
             replay_scan_id: str | None = None, parent_scan_id: str | None = None,
             on_stage: Callable[[str], None] | None = None, client_ip: str | None = None) -> ScanResult:
    cfg = get_config()
    source = source or cfg.SOURCE
    stage = on_stage or (lambda _s: None)
    scan_id = str(uuid.uuid4())
    started = datetime.now(UTC)
    settings = repo.load_settings()
    try:
        stage("collecting")
        t0 = time.perf_counter()
        collector = build_collector(source, replay_scan_id)
        snapshot = sanitize_snapshot(collector.collect())
        collect_ms = round((time.perf_counter() - t0) * 1000, 1)
        label = snapshot.get("source") or collector.describe_source()
        if trigger == "rescore":  # keep the original source badge (mock / ldap://...) for re-scores
            label = snapshot.get("collector", {}).get("replayed_from", label)
        result = analyze_snapshot(snapshot, settings, scan_id=scan_id, started_at=started, source=label,
                                  trigger=trigger, parent_scan_id=parent_scan_id, on_stage=stage)
        result.meta["timings"]["collect_ms"] = collect_ms
        stage("persisting")
        repo.save_scan(result, snapshot)
        repo.audit("scan.run", actor=actor, target=scan_id, client_ip=client_ip,
                   details={"source": label, "trigger": trigger, "score": result.ad_security_score,
                            "findings": len(result.findings), "replay_of": replay_scan_id})
        stage("done")
        log.info("scan %s (%s, %s) finished: score=%s findings=%s", scan_id, label, trigger,
                 result.ad_security_score, len(result.findings))
        return result
    except (CollectorError, ScanError) as exc:
        repo.audit("scan.failed", actor=actor, target=scan_id, client_ip=client_ip,
                   details={"source": source, "trigger": trigger, "error": str(exc)})
        raise ScanError(str(exc)) from exc


def rescore(scan_id: str, *, actor: str = "system", client_ip: str | None = None) -> ScanResult:
    """Re-run analysis on a stored snapshot with the current settings -> a new scan (trigger=rescore)."""
    sid = repo.resolve_scan_id(scan_id)
    return run_scan("snapshot", trigger="rescore", actor=actor, replay_scan_id=sid, parent_scan_id=sid, client_ip=client_ip)


def seed_demo_history(weeks: int = 5) -> int:
    """Mock mode on an empty DB: store `weeks` earlier states of the demo domain for the trend chart."""
    cfg = get_config()
    if repo.scan_count() > 0:
        return 0
    base = MockCollector(cfg.MOCK_DATA_PATH, now=cfg.ANALYSIS_DATE).collect()
    settings = repo.load_settings()
    created = 0
    for w in range(weeks, 0, -1):
        snap = sanitize_snapshot(demo_history_variant(base, w))
        started = datetime.fromisoformat(snap["collected_at"])
        result = analyze_snapshot(snap, settings, scan_id=str(uuid.uuid4()), started_at=started, source="mock",
                                  trigger="seed")
        result.finished_at = started
        result.meta["demo_history"] = f"simulated state {w} week(s) ago"
        repo.save_scan(result, snap)
        created += 1
    repo.audit("demo.seed_history", details={"scans": created})
    return created


# ------------------------------------------------------------------------------------ async job registry
@dataclass
class ScanJob:
    job_id: str
    source: str
    trigger: str
    stage: str = "queued"
    stages_seen: list[str] = field(default_factory=lambda: ["queued"])
    scan_id: str | None = None
    error: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    finished_at: datetime | None = None

    def as_dict(self) -> dict[str, Any]:
        return {"job_id": self.job_id, "source": self.source, "trigger": self.trigger, "stage": self.stage,
                "stages": STAGES, "stages_seen": self.stages_seen, "scan_id": self.scan_id, "error": self.error,
                "created_at": self.created_at, "finished_at": self.finished_at}


class JobRegistry:
    def __init__(self) -> None:
        self._jobs: dict[str, ScanJob] = {}
        self._lock = threading.Lock()

    def start(self, source: str, *, trigger: str = "manual", actor: str = "system", client_ip: str | None = None,
              replay_scan_id: str | None = None) -> ScanJob:
        job = ScanJob(job_id=uuid.uuid4().hex[:12], source=source, trigger=trigger)
        with self._lock:
            self._jobs[job.job_id] = job
            if len(self._jobs) > 200:  # bounded memory
                for old in sorted(self._jobs.values(), key=lambda j: j.created_at)[:50]:
                    self._jobs.pop(old.job_id, None)

        def set_stage(s: str) -> None:
            job.stage = s
            job.stages_seen.append(s)

        def work() -> None:
            try:
                res = run_scan(source, trigger=trigger, actor=actor, replay_scan_id=replay_scan_id,
                               on_stage=set_stage, client_ip=client_ip)
                job.scan_id = res.scan_id
            except Exception as exc:  # surfaced to the UI via job.error
                log.exception("scan job %s failed", job.job_id)
                job.error = str(exc)
                job.stage = "failed"
            finally:
                job.finished_at = datetime.now(UTC)

        threading.Thread(target=work, name=f"scan-{job.job_id}", daemon=True).start()
        return job

    def get(self, job_id: str) -> ScanJob | None:
        return self._jobs.get(job_id)


jobs = JobRegistry()

"""FastAPI app: routers, CORS, startup (DB, demo history, optional scheduler), SPA hosting."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import __version__, scanner
from .api import routes_dashboard, routes_export, routes_findings, routes_scan, routes_settings
from .config import get_config
from .storage import repositories as repo
from .storage.db import get_engine

log = logging.getLogger("ira")


def _start_scheduler(minutes: int):
    from apscheduler.schedulers.background import BackgroundScheduler

    sched = BackgroundScheduler(daemon=True)

    def job() -> None:
        try:
            scanner.run_scan(trigger="scheduled", actor="scheduler")
        except Exception:  # keep the scheduler alive; failure is in the audit log
            log.exception("scheduled scan failed")

    sched.add_job(job, "interval", minutes=minutes, id="rescan", max_instances=1, coalesce=True)
    sched.start()
    log.info("scheduled re-scan every %s minute(s)", minutes)
    return sched


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = get_config()
    logging.basicConfig(level=cfg.LOG_LEVEL, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    get_engine()
    repo.audit("app.start", details={"version": __version__, "source": cfg.SOURCE})
    if cfg.SOURCE == "mock" and cfg.SEED_DEMO_HISTORY:
        seeded = scanner.seed_demo_history()
        if seeded:
            log.info("seeded %s demo history scans (mock mode)", seeded)
    sched = _start_scheduler(cfg.SCHEDULE_INTERVAL_MINUTES) if cfg.SCHEDULE_INTERVAL_MINUTES > 0 else None
    app.state.scheduler = sched
    yield
    if sched:
        sched.shutdown(wait=False)


def create_app() -> FastAPI:
    cfg = get_config()
    app = FastAPI(
        title="Identity Risk Analyzer",
        version=__version__,
        description="Active Directory Security Radar — Module 1 of Infrastructure Risk Radar. "
                    "Read-only, least-privilege AD audit: collect → rules → per-object risk → AD Security Score.",
        lifespan=lifespan,
    )
    app.add_middleware(CORSMiddleware, allow_origins=cfg.CORS_ORIGINS, allow_credentials=False,
                       allow_methods=["GET", "POST", "PUT"], allow_headers=["*"])
    for r in (routes_scan, routes_findings, routes_dashboard, routes_export, routes_settings):
        app.include_router(r.router)

    dist: Path = cfg.FRONTEND_DIST
    if (dist / "index.html").exists():  # single-process demo: API + built UI on one port
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        def spa(full_path: str):
            if full_path.startswith(("api/", "docs", "openapi.json", "redoc")):
                raise HTTPException(404)
            candidate = (dist / full_path).resolve()
            if full_path and candidate.is_file() and dist.resolve() in candidate.parents:
                return FileResponse(candidate)
            return FileResponse(dist / "index.html")

    return app


app = create_app()

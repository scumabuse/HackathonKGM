"""SQLAlchemy engine/session management (SQLite by default)."""
from __future__ import annotations

import threading
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from ..config import get_config
from .schema import Base

_lock = threading.Lock()
_engine: Engine | None = None
_Session: sessionmaker | None = None


def _make_engine(url: str) -> Engine:
    if url.startswith("sqlite:///"):
        Path(url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
        engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 30})

        @event.listens_for(engine, "connect")
        def _pragmas(dbapi_conn, _record):  # noqa: ANN001
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA synchronous=NORMAL")
            cur.close()

        return engine
    return create_engine(url, pool_pre_ping=True)


def _migrate(engine: Engine) -> None:
    """Additive, idempotent schema upgrades for databases created by older versions."""
    cols = {c["name"] for c in inspect(engine).get_columns("findings")}
    if "search_text" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE findings ADD COLUMN search_text TEXT DEFAULT ''"))


def get_engine() -> Engine:
    global _engine, _Session
    with _lock:
        if _engine is None:
            _engine = _make_engine(get_config().DATABASE_URL)
            Base.metadata.create_all(_engine)
            _migrate(_engine)
            _Session = sessionmaker(bind=_engine, expire_on_commit=False)
        return _engine


def reset_engine() -> None:
    """Dispose the engine (tests / config changes)."""
    global _engine, _Session
    with _lock:
        if _engine is not None:
            _engine.dispose()
        _engine = None
        _Session = None


@contextmanager
def session_scope() -> Iterator[Session]:
    get_engine()
    assert _Session is not None
    s: Session = _Session()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()

import copy
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from app.analyzers import IdentityModule  # noqa: E402
from app.collectors.mock_collector import MockCollector  # noqa: E402
from app.core.models import AnalysisSettings  # noqa: E402
from app.core.pipeline import score_hits  # noqa: E402

MOCK_PATH = BACKEND / "data" / "mock_ad.json"
FIXED_NOW = datetime(2026, 9, 24, 12, 0, tzinfo=UTC)


@pytest.fixture(scope="session")
def mock_snapshot():
    return MockCollector(MOCK_PATH, now=FIXED_NOW).collect()


def run_analysis(snapshot, settings=None):
    settings = settings or AnalysisSettings()
    mod = IdentityModule(copy.deepcopy(snapshot), settings)
    hits = mod.analyze()
    return score_hits(mod, hits, settings, scan_id="test", started_at=FIXED_NOW, source="mock")


@pytest.fixture(scope="session")
def mock_result(mock_snapshot):
    return run_analysis(mock_snapshot)


@pytest.fixture()
def isolated_env(tmp_path, monkeypatch):
    """Fresh SQLite DB per test; no demo-history seeding unless a test asks for it."""
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'test.db').as_posix()}")
    monkeypatch.setenv("SEED_DEMO_HISTORY", "false")
    monkeypatch.setenv("SOURCE", "mock")
    from app.config import get_config
    from app.storage import db

    get_config.cache_clear()
    db.reset_engine()
    yield tmp_path
    db.reset_engine()
    get_config.cache_clear()
    os.environ.pop("DATABASE_URL", None)

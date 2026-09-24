"""Process configuration from environment / .env (see .env.example for documentation).

LDAP credentials come ONLY from here (env vars or .env), are held as SecretStr, and are never
logged, persisted, or returned by the API.
"""
from __future__ import annotations

from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent


class AppConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(REPO_DIR / ".env"), str(BACKEND_DIR / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- collector selection --------------------------------------------------------
    SOURCE: Literal["mock", "ldap", "snapshot"] = "mock"
    MOCK_DATA_PATH: Path = BACKEND_DIR / "data" / "mock_ad.json"
    SNAPSHOT_PATH: Path | None = None  # replay a saved snapshot JSON when SOURCE=snapshot
    ANALYSIS_DATE: datetime | None = None  # override the "now" used for age thresholds
    SEED_DEMO_HISTORY: bool = True  # mock mode: seed a few historical scans for the trend chart

    # --- live LDAP (read-only, least privilege) ---------------------------------------
    LDAP_SERVER: str | None = None  # dc01.corp.local
    LDAP_PORT: int | None = None  # default 636 with SSL, 389 otherwise
    LDAP_USE_SSL: bool = True  # LDAPS
    LDAP_START_TLS: bool = False  # alternative: StartTLS on 389
    LDAP_VALIDATE_CERT: bool = True
    LDAP_CA_CERT: Path | None = None  # PEM bundle of the internal CA
    LDAP_AUTH: Literal["SIMPLE", "NTLM"] = "SIMPLE"  # NTLM needs pycryptodome on OpenSSL 3
    LDAP_BIND_USER: str | None = None  # svc_ira_reader@corp.local  or  CORP\svc_ira_reader
    LDAP_BIND_PASSWORD: SecretStr | None = None
    LDAP_BASE_DN: str | None = None  # auto-discovered from RootDSE when empty
    LDAP_TIMEOUT: int = 15
    LDAP_PAGE_SIZE: int = 500

    # --- Security event log (password spray / brute force / interactive logons) ------
    EVENTLOG_MODE: Literal["off", "file", "wevtutil"] = "off"
    EVENTLOG_PATH: Path | None = None  # JSON export (scripts/export_auth_events.ps1)
    EVENTLOG_DC: str | None = None  # wevtutil /r:<dc> (Windows host, Event Log Readers)
    EVENTLOG_HOURS: int = 24

    # --- app --------------------------------------------------------------------------
    DATABASE_URL: str = f"sqlite:///{(BACKEND_DIR / 'data' / 'risk_radar.db').as_posix()}"
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    SCHEDULE_INTERVAL_MINUTES: int = 0  # >0 enables periodic re-scans (APScheduler)
    FRONTEND_DIST: Path = REPO_DIR / "frontend" / "dist"
    LOG_LEVEL: str = "INFO"

    @field_validator("LDAP_BIND_PASSWORD", mode="before")
    @classmethod
    def _empty_secret_is_none(cls, v):
        return None if v in ("", None) else v

    @property
    def ldap_configured(self) -> bool:
        return bool(self.LDAP_SERVER and self.LDAP_BIND_USER and self.LDAP_BIND_PASSWORD)

    @property
    def ldap_url(self) -> str:
        port = self.LDAP_PORT or (636 if self.LDAP_USE_SSL else 389)
        scheme = "ldaps" if self.LDAP_USE_SSL else "ldap"
        return f"{scheme}://{self.LDAP_SERVER}:{port}"

    def safe_dict(self) -> dict:
        """Config for display — secrets are never included."""
        return {
            "source": self.SOURCE,
            "ldap_configured": self.ldap_configured,
            "ldap_url": self.ldap_url if self.LDAP_SERVER else None,
            "ldap_auth": self.LDAP_AUTH,
            "ldap_bind_user": self.LDAP_BIND_USER,
            "ldap_tls": self.LDAP_USE_SSL or self.LDAP_START_TLS,
            "eventlog_mode": self.EVENTLOG_MODE,
            "schedule_interval_minutes": self.SCHEDULE_INTERVAL_MINUTES,
        }


@lru_cache(maxsize=1)
def get_config() -> AppConfig:
    return AppConfig()

"""Small request helpers shared by the routers."""
from __future__ import annotations

import re

from fastapi import HTTPException, Request

from ..storage.repositories import NotFound

_ACTOR_SAFE = re.compile(r"[^\w.@\\\- ]")


def actor(request: Request) -> str:
    """Who performed the action (for the audit log). No auth in the MVP: X-Actor header or 'local-operator'."""
    raw = request.headers.get("x-actor") or "local-operator"
    return _ACTOR_SAFE.sub("", raw)[:128] or "local-operator"


def client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def not_found(exc: NotFound) -> HTTPException:
    return HTTPException(status_code=404, detail=str(exc))


def split_multi(value: str | None) -> list[str] | None:
    """'High,Critical' -> ['High','Critical'] (query params accept comma-separated lists)."""
    if not value:
        return None
    parts = [p.strip() for p in value.split(",") if p.strip()]
    return parts or None

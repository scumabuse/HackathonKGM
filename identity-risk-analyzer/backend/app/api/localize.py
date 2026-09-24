"""Response localization: swap the English text of findings/entities for the requested language.

Findings are stored with every language (see core/pipeline.py); the API returns one language and
drops the `*_i18n` side fields so payloads stay lean. Unknown or missing translations fall back
to English.
"""
from __future__ import annotations

from typing import Any, Literal

from fastapi import Query

from ..core.models import Entity, Finding

Lang = Literal["en", "ru", "kk"]
LangQuery = Query("en", description="Response language: en | ru | kk")

_I18N_KEYS = ("i18n", "title_i18n", "top_title_i18n", "attributes_i18n", "attribute_i18n", "value_i18n")


def _strip(d: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in d.items() if k not in _I18N_KEYS}


def _weights(items: list[dict[str, Any]], lang: str) -> list[dict[str, Any]]:
    return [_strip({**w, "title": (w.get("title_i18n") or {}).get(lang) or w["title"]}) for w in items]


def finding(f: Finding | dict[str, Any], lang: str) -> dict[str, Any]:
    d = f.model_dump(mode="json") if isinstance(f, Finding) else dict(f)
    tx = (d.get("i18n") or {}).get(lang) or {}
    for key in ("title", "description", "recommendation"):
        if tx.get(key):
            d[key] = tx[key]
    d["evidence"] = [
        _strip({**e, "attribute": (e.get("attribute_i18n") or {}).get(lang) or e["attribute"],
                "value": (e.get("value_i18n") or {}).get(lang) or e["value"]})
        for e in d.get("evidence", [])
    ]
    d["weight_breakdown"] = _weights(d.get("weight_breakdown", []), lang)
    return _strip(d)


def entity(e: Entity | dict[str, Any], lang: str) -> dict[str, Any]:
    d = e.model_dump(mode="json") if isinstance(e, Entity) else dict(e)
    d["top_title"] = (d.get("top_title_i18n") or {}).get(lang) or d["top_title"]
    d["attributes"] = (d.get("attributes_i18n") or {}).get(lang) or d.get("attributes", {})
    d["weight_breakdown"] = _weights(d.get("weight_breakdown", []), lang)
    return _strip(d)


def diff_item(item: dict[str, Any], lang: str) -> dict[str, Any]:
    return _strip({**item, "title": (item.get("title_i18n") or {}).get(lang) or item["title"]})

"""Standalone, self-contained HTML report (inline CSS/SVG, no external requests) — opens offline."""
from __future__ import annotations

import math
from datetime import UTC, datetime
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup

from ..core.i18n import normalize_lang
from ..core.models import Finding, ScanResult
from ..core.risk_engine import security_band
from .labels import band_name, category_name, labels, level_name, type_name

_env = Environment(
    loader=FileSystemLoader(str(Path(__file__).parent / "templates")),
    autoescape=select_autoescape(["html", "j2"]),  # AD strings are attacker-controllable -> always escape
    trim_blocks=True,
    lstrip_blocks=True,
)

BAND_COLORS = {"Good": "#10b981", "Fair": "#f59e0b", "Poor": "#f97316", "Critical": "#ef4444"}


def _gauge_arc(score: int) -> dict[str, float]:
    """SVG geometry for a 240° arc gauge."""
    r, cx, cy = 80, 100, 100
    start, sweep = 150, 240
    circumference = 2 * math.pi * r * sweep / 360
    return {"r": r, "cx": cx, "cy": cy, "start": start, "len": circumference,
            "dash": circumference * max(0, min(100, score)) / 100}


def export_html(scan: ScanResult, findings: list[Finding] | None = None, lang: str = "en") -> bytes:
    lang = normalize_lang(lang)
    rows = findings if findings is not None else scan.findings
    band = security_band(scan.ad_security_score)
    ids = {f.object_id for f in rows}
    lab = labels(lang)
    template = _env.get_template("report.html.j2")
    html = template.render(
        scan=scan, findings=rows, entities=[e for e in scan.entities if e.object_id in ids][:15],
        band=band_name(band, lang), band_color=BAND_COLORS[band], gauge=_gauge_arc(scan.ad_security_score),
        generated=datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC"), filtered=findings is not None,
        levels=["Critical", "High", "Medium", "Low"], lang=lang,
        L=lab, gauge_label=Markup(lab["html.gauge"]),  # our own static markup (<b>), never user data
        heading=lab["html.heading"].format(domain=scan.domain),
        lvl=lambda v: level_name(v, lang), cat=lambda v: category_name(v, lang), typ=lambda v: type_name(v, lang),
    )
    return html.encode("utf-8")

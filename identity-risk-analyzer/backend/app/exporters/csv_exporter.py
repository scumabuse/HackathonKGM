"""Flat CSV of all (or filtered) findings. UTF-8 with BOM so Excel shows Cyrillic correctly."""
from __future__ import annotations

import csv
import io

from ..core.models import Finding, ScanResult
from . import COLUMN_KEYS, column_labels, finding_row, neutralize


def export_csv(scan: ScanResult, findings: list[Finding] | None = None, lang: str = "en") -> bytes:
    rows = findings if findings is not None else scan.findings
    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")
    writer.writerow(column_labels(lang))
    for f in rows:
        r = finding_row(f, lang)
        writer.writerow([neutralize(r[key]) for key in COLUMN_KEYS])
    return ("﻿" + buf.getvalue()).encode("utf-8")

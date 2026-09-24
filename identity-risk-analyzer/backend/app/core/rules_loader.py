"""Loads declarative YAML rules, validates their schema and applies settings overrides."""
from __future__ import annotations

import string
from functools import lru_cache
from pathlib import Path

import yaml

from .models import AnalysisSettings, RuleDef, RuleText

RULES_DIR = Path(__file__).resolve().parent.parent / "rules"
_TEXT_FIELDS = ("title", "description", "recommendation", "remediation_command")
_I18N_FIELDS = ("name", "title", "description", "recommendation")


class RuleValidationError(ValueError):
    pass


def _check_template(rule_id: str, field: str, text: str | None) -> None:
    if not text:
        return
    try:
        list(string.Formatter().parse(text))
    except ValueError as exc:  # unbalanced braces etc.
        raise RuleValidationError(f"{rule_id}.{field}: invalid template: {exc}") from exc


def _placeholders(text: str | None) -> set[str]:
    if not text:
        return set()
    return {name for _, name, _, _ in string.Formatter().parse(text) if name}


def _attach_translations(rules: dict[str, RuleDef], directory: Path) -> None:
    """rules/i18n/<lang>.yaml: {rule_id: {name, title, description, recommendation}}."""
    i18n_dir = directory / "i18n"
    if not i18n_dir.is_dir():
        return
    for path in sorted(i18n_dir.glob("*.yaml")):
        lang = path.stem
        doc = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        for rid, fields in doc.items():
            if rid not in rules:
                raise RuleValidationError(f"{path.name}: translation for unknown rule {rid}")
            try:
                text = RuleText(**(fields or {}))
            except Exception as exc:
                raise RuleValidationError(f"{path.name}: {rid}: {exc}") from exc
            rule = rules[rid]
            for f in _I18N_FIELDS:
                translated = getattr(text, f)
                _check_template(rid, f"{lang}.{f}", translated)
                extra = _placeholders(translated) - _placeholders(getattr(rule, f))
                if extra:
                    raise RuleValidationError(f"{path.name}: {rid}.{f} uses placeholders not in English: {sorted(extra)}")
            rule.i18n[lang] = text


def load_rules_from(directory: Path) -> dict[str, RuleDef]:
    rules: dict[str, RuleDef] = {}
    files = sorted(directory.glob("*.yaml"))
    if not files:
        raise RuleValidationError(f"no rule files found in {directory}")
    for path in files:
        doc = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        analyzer = doc.get("analyzer")
        if not analyzer or not isinstance(doc.get("rules"), list):
            raise RuleValidationError(f"{path.name}: needs 'analyzer' and a 'rules' list")
        for raw in doc["rules"]:
            try:
                rule = RuleDef(**{**raw, "analyzer": analyzer})
            except Exception as exc:  # pydantic ValidationError -> readable message
                raise RuleValidationError(f"{path.name}: rule {raw.get('id', '?')}: {exc}") from exc
            if rule.id in rules:
                raise RuleValidationError(f"duplicate rule id {rule.id} in {path.name}")
            for f in _TEXT_FIELDS:
                _check_template(rule.id, f, getattr(rule, f))
            rules[rule.id] = rule
    _attach_translations(rules, directory)
    return rules


@lru_cache(maxsize=1)
def load_rules() -> dict[str, RuleDef]:
    """The built-in rule catalogue (immutable; overrides are applied per scan)."""
    return load_rules_from(RULES_DIR)


def effective_rules(settings: AnalysisSettings, base: dict[str, RuleDef] | None = None) -> dict[str, RuleDef]:
    """Rules with Settings weight/enabled overrides applied."""
    base = base if base is not None else load_rules()
    out: dict[str, RuleDef] = {}
    for rid, rule in base.items():
        upd: dict = {}
        if rid in settings.rule_weights:
            upd["weight"] = settings.rule_weights[rid]
        if rid in settings.rule_enabled:
            upd["enabled"] = settings.rule_enabled[rid]
        out[rid] = rule.model_copy(update=upd) if upd else rule
    return out


class _SafeDict(dict):
    def __missing__(self, key: str) -> str:  # unknown placeholder -> visible, never crashes
        return "<" + key + ">"


def render(text: str | None, variables: dict[str, object]) -> str | None:
    if text is None:
        return None
    return string.Formatter().vformat(text, (), _SafeDict(variables)).strip()

"""Server-side localization for generated text (evidence, object facts, labels).

Findings are rendered in every supported language at scan time and stored together, so the API
can answer in the viewer's language (`?lang=ru|kk|en`) without re-running the analysis.
English is the canonical language: every `Evidence.value`/`Finding.title` field holds English and
the other languages live in the `*_i18n` side fields.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from .models import Evidence

LANGS: tuple[str, ...] = ("en", "ru", "kk")
TRANSLATED: tuple[str, ...] = ("ru", "kk")
Lang = Literal["en", "ru", "kk"]
Localized = dict[str, str]

# key -> (en, ru, kk)
CATALOG: dict[str, tuple[str, str, str]] = {
    # ---- generic values ----------------------------------------------------------------------
    "never": ("never", "никогда", "ешқашан"),
    "never_logged_on": ("never logged on", "ни разу не входил(а)", "ешқашан кірмеген"),
    "replication_note": (
        " · replicates every 9–14 days, so the true last logon may be up to 14 days later",
        " · реплицируется раз в 9–14 дней, фактический вход мог быть до 14 дней позже",
        " · 9–14 күнде бір рет репликацияланады, нақты кіру 14 күнге дейін кешірек болуы мүмкін",
    ),
    "flag_set": ("{flag} (0x{hex}) is set", "установлен {flag} (0x{hex})", "{flag} (0x{hex}) орнатылған"),
    "empty": ("empty", "не задано", "бос"),
    "none": ("none", "нет", "жоқ"),
    "unknown": ("unknown", "неизвестно", "белгісіз"),
    "no": ("no", "нет", "жоқ"),
    "disabled": ("disabled", "отключено", "өшірілген"),
    "enabled": ("enabled", "включено", "қосулы"),
    "nobody": ("nobody", "никому", "ешкімге"),
    "days_n": ("{n} days", "{n} дн.", "{n} күн"),
    # ---- service-account detection -------------------------------------------------------------
    "svc_reason_spn": ("servicePrincipalName on a user object", "servicePrincipalName у объекта-пользователя",
                       "пайдаланушы объектісінде servicePrincipalName"),
    "svc_reason_prefix": ("name prefix '{prefix}'", "префикс имени '{prefix}'", "атау префиксі '{prefix}'"),
    "svc_reason_ou": ("located in {marker}", "находится в {marker}", "{marker} ішінде орналасқан"),
    "svc_reason_gmsa": ("gMSA object class", "класс объекта gMSA", "gMSA объект класы"),
    "svc_detection": ("service account: {reasons}", "сервисная учётная запись: {reasons}", "қызметтік тіркелгі: {reasons}"),
    "enc_not_set": ("not set (RC4 allowed)", "не задано (разрешён RC4)", "орнатылмаған (RC4 рұқсат етілген)"),
    "workstations_empty": ("empty — may log on to any computer", "не задано — вход разрешён на любой компьютер",
                           "бос — кез келген компьютерге кіруге болады"),
    "interactive_reason_ldap": (
        "userWorkstations is empty, so nothing restricts where the account can log on.",
        "Атрибут userWorkstations пуст, поэтому ничто не ограничивает, где может входить учётная запись.",
        "userWorkstations атрибуты бос, сондықтан тіркелгінің қайда кіре алатынын ештеңе шектемейді.",
    ),
    "interactive_reason_log": (
        "The Security log shows {n} interactive/RDP logon(s) by this account (LogonType {type}).",
        "Журнал Security фиксирует интерактивные/RDP-входы этой учётной записи: {n} (LogonType {type}).",
        "Security журналы бұл тіркелгінің интерактивті/RDP кірулерін тіркеген: {n} (LogonType {type}).",
    ),
    "interactive_seen": (
        "{n} interactive logon(s), LogonType {type} from {src} at {time}",
        "интерактивных входов: {n}, LogonType {type} с {src} в {time}",
        "интерактивті кірулер: {n}, LogonType {type}, көзі {src}, уақыты {time}",
    ),
    # ---- privileges ----------------------------------------------------------------------------
    "not_listed": ("account NOT listed — invisible in ADUC and most tools",
                   "учётная запись НЕ указана — не видна в ADUC и большинстве инструментов",
                   "тіркелгі тізімде ЖОҚ — ADUC пен көптеген құралдарда көрінбейді"),
    "in_chain_misses": ("does not follow primaryGroupID, so chain queries miss it too",
                        "не учитывает primaryGroupID, поэтому цепочечные запросы тоже её не видят",
                        "primaryGroupID-ді ескермейді, сондықтан тізбекті сұраулар да оны көрмейді"),
    "no_protected_group": ("no protected/critical group", "нет защищённых/критических групп", "қорғалған/сыни топтар жоқ"),
    "rights_only_nesting": ("none — rights come only from nesting", "нет — права получены только через вложенность",
                            "жоқ — құқықтар тек кірістіру арқылы алынған"),
    "kind_direct": ("direct", "напрямую", "тікелей"),
    "kind_nested": ("nested", "вложенно", "кірістірілген"),
    "kind_pgid": ("primaryGroupID", "primaryGroupID", "primaryGroupID"),
    "kind_disabled": (", disabled", ", отключена", ", өшірілген"),
    # ---- passwords / policy / auth ---------------------------------------------------------------
    "min_length_value": ("{n} characters (baseline {b})", "{n} симв. (базовый уровень {b})", "{n} таңба (базалық деңгей {b})"),
    "no_lockout_value": ("0 — accounts never lock out (unlimited guessing)",
                         "0 — учётные записи не блокируются (неограниченный подбор)",
                         "0 — тіркелгілер бұғатталмайды (шектеусіз таңдау)"),
    "policy_summary": ("minPwdLength={min}, lockoutThreshold={lock}, pwdProperties=0x{props}, maxPwdAge={age}",
                       "minPwdLength={min}, lockoutThreshold={lock}, pwdProperties=0x{props}, maxPwdAge={age}",
                       "minPwdLength={min}, lockoutThreshold={lock}, pwdProperties=0x{props}, maxPwdAge={age}"),
    "policy_default_label": ("The Default Domain Password Policy", "Политика паролей домена по умолчанию",
                             "Доменнің әдепкі құпиясөз саясаты"),
    "policy_pso_label": ("Fine-grained policy {name} (applies to {applies})",
                         "Детальная политика {name} (применяется к: {applies})",
                         "{name} егжей-тегжейлі саясаты (қолданылатын нысан: {applies})"),
    "spray_targets_value": ("{n} in {m} min (max {k} attempts each)", "{n} за {m} мин. (не более {k} попыток на каждую)",
                            "{m} минутта {n} (әрқайсысына ең көбі {k} әрекет)"),
    "brute_failures_value": ("{n} (event {ids})", "{n} (событие {ids})", "{n} ({ids} оқиғасы)"),
    "locked_out_at": ("account locked out at {time} UTC", "учётная запись заблокирована в {time} UTC",
                      "тіркелгі {time} UTC уақытында бұғатталды"),
    # ---- evidence attribute labels (LDAP attribute names stay untranslated) ------------------------
    "attr.detection": ("detection", "обнаружение", "анықтау"),
    "attr.effective_membership": ("effective membership", "фактическое членство", "нақты мүшелік"),
    "attr.critical_groups": ("critical groups", "критические группы", "сыни топтар"),
    "attr.critical_groups_reached": ("critical groups reached", "достигнутые критические группы", "қол жеткізілген сыни топтар"),
    "attr.direct_admin": ("direct admin memberships", "прямое членство в админ-группах", "әкімші топтарындағы тікелей мүшелік"),
    "attr.security_log_4624": ("Security log 4624", "журнал Security, 4624", "Security журналы, 4624"),
    "attr.effective_members": ("effective members", "фактических членов", "нақты мүшелер"),
    "attr.members": ("members", "члены", "мүшелер"),
    "attr.policy": ("policy", "политика", "саясат"),
    "attr.complexity": ("complexity", "сложность", "күрделілік"),
    "attr.reversible": ("reversible encryption", "обратимое шифрование", "қайтымды шифрлау"),
    "attr.precedence": ("precedence", "приоритет", "басымдық"),
    "attr.source": ("source", "источник", "көз"),
    "attr.distinct_targets": ("distinct accounts targeted", "атаковано разных учётных записей", "шабуыл жасалған тіркелгілер"),
    "attr.window": ("window", "окно", "уақыт аралығы"),
    "attr.event_ids": ("event IDs", "коды событий", "оқиға кодтары"),
    "attr.targets": ("targets", "цели", "нысаналар"),
    "attr.consecutive_failures": ("consecutive failures", "неудач подряд", "қатарынан сәтсіздіктер"),
    "attr.sources": ("sources", "источники", "көздер"),
    "attr.event_4740": ("event 4740", "событие 4740", "4740 оқиғасы"),
    "attr.domain_controller": ("domain controller", "контроллер домена", "домен контроллері"),
    "attr.also_registered": ("also registered on", "также зарегистрирован на", "сондай-ақ тіркелген"),
    # ---- object facts ---------------------------------------------------------------------------
    "fact.status": ("Status", "Статус", "Күйі"),
    "fact.tier": ("Tier", "Уровень", "Деңгей"),
    "fact.last_logon": ("Last logon", "Последний вход", "Соңғы кіру"),
    "fact.pwd_last_set": ("Password last set", "Пароль изменён", "Құпиясөз ауыстырылған"),
    "fact.created": ("Created", "Создана", "Құрылған"),
    "fact.ou": ("OU", "OU", "OU"),
    "fact.uac_flags": ("UAC flags", "Флаги UAC", "UAC жалаушалары"),
    "fact.primary_group": ("Primary group", "Основная группа", "Негізгі топ"),
    "fact.service_detection": ("Service detection", "Признаки сервисной учётки", "Қызметтік тіркелгі белгілері"),
    "fact.critical_groups": ("Critical groups", "Критические группы", "Сыни топтар"),
    "fact.escalation_path": ("Escalation path", "Путь эскалации", "Эскалация жолы"),
    "fact.department": ("Department", "Отдел", "Бөлім"),
    "fact.title": ("Title", "Должность", "Лауазымы"),
    "fact.os": ("OS", "ОС", "ОЖ"),
    "fact.dns_name": ("DNS name", "DNS-имя", "DNS атауы"),
    "fact.spns": ("SPNs", "SPN", "SPN"),
    "fact.type": ("Type", "Тип", "Түрі"),
    "fact.direct_members": ("Direct members", "Прямых членов", "Тікелей мүшелер"),
    "fact.effective_members": ("Effective members", "Фактических членов", "Нақты мүшелер"),
    "fact.functional_level": ("Functional level", "Функциональный уровень", "Функционалдық деңгей"),
    "val.enabled": ("Enabled", "Включена", "Қосулы"),
    "val.disabled": ("Disabled", "Отключена", "Өшірілген"),
    "val.tier0": ("Tier-0", "Tier-0", "Tier-0"),
    "val.privileged": ("Privileged", "Привилегированная", "Артықшылықты"),
    "val.standard": ("Standard", "Обычная", "Қарапайым"),
    "val.must_change": ("must change at next logon", "смена при следующем входе", "келесі кіруде ауыстыру керек"),
    "val.critical_group": ("Critical group", "Критическая группа", "Сыни топ"),
    "val.group": ("Group", "Группа", "Топ"),
    "val.domain_root": ("Domain root (Default Domain Password Policy)", "Корень домена (политика паролей по умолчанию)",
                        "Домен түбірі (әдепкі құпиясөз саясаты)"),
    "val.pso": ("Fine-grained password policy (PSO)", "Детальная политика паролей (PSO)", "Егжей-тегжейлі құпиясөз саясаты (PSO)"),
    "val.auth_source": ("Authentication source (Security log)", "Источник аутентификаций (журнал Security)",
                        "Аутентификация көзі (Security журналы)"),
    # ---- enumerations used by exports -------------------------------------------------------------
    "level.Critical": ("Critical", "Критический", "Сыни"),
    "level.High": ("High", "Высокий", "Жоғары"),
    "level.Medium": ("Medium", "Средний", "Орташа"),
    "level.Low": ("Low", "Низкий", "Төмен"),
    "band.Good": ("Good", "Хорошо", "Жақсы"),
    "band.Fair": ("Fair", "Удовлетворительно", "Қанағаттанарлық"),
    "band.Poor": ("Poor", "Слабо", "Әлсіз"),
    "band.Critical": ("Critical", "Критично", "Сыни"),
    "category.Stale": ("Stale", "Устаревшие", "Ескірген"),
    "category.Privileged": ("Privileged", "Привилегии", "Артықшылықтар"),
    "category.Passwords": ("Passwords", "Пароли", "Құпиясөздер"),
    "category.Service": ("Service", "Сервисные", "Қызметтік"),
    "category.Config": ("Config", "Конфигурация", "Конфигурация"),
    "type.user": ("User", "Пользователь", "Пайдаланушы"),
    "type.serviceAccount": ("Service account", "Сервисная учётка", "Қызметтік тіркелгі"),
    "type.computer": ("Computer", "Компьютер", "Компьютер"),
    "type.group": ("Group", "Группа", "Топ"),
    "type.domain": ("Domain", "Домен", "Домен"),
    "type.policy": ("Password policy", "Политика паролей", "Құпиясөз саясаты"),
    "type.host": ("Source host", "Узел-источник", "Көз хост"),
}


class _Safe(dict):
    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


def normalize_lang(lang: str | None) -> str:
    return lang if lang in LANGS else "en"


def tr(key: str, **vars: object) -> Localized:
    """Render a catalogue message in every language. A var may itself be Localized."""
    out: Localized = {}
    for i, lang in enumerate(LANGS):
        v = _Safe({k: (x.get(lang) or x.get("en", "")) if isinstance(x, dict) else str(x) for k, x in vars.items()})
        out[lang] = CATALOG[key][i].format_map(v)
    return out


def t(key: str, lang: str, **vars: object) -> str:
    return tr(key, **vars)[normalize_lang(lang)]


def lit(text: object) -> Localized:
    s = str(text)
    return {lang: s for lang in LANGS}


def concat(*parts: Localized | str) -> Localized:
    out = {lang: "" for lang in LANGS}
    for p in parts:
        loc = p if isinstance(p, dict) else lit(p)
        for lang in LANGS:
            out[lang] += loc[lang]
    return out


def join(items: list[Localized | str], sep: str = "; ") -> Localized:
    locs = [i if isinstance(i, dict) else lit(i) for i in items]
    return {lang: sep.join(x[lang] for x in locs) for lang in LANGS}


def _ru_plural(n: int, one: str, few: str, many: str) -> str:
    if n % 10 == 1 and n % 100 != 11:
        return one
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return few
    return many


def ago(then: datetime | None, now: datetime) -> Localized:
    """'730 days ago (2024-01-15)' in every language; 'never' when unset."""
    if then is None:
        return tr("never")
    n = max(0, (now - then).days)
    date = then.date().isoformat()
    return {
        "en": f"{n} day{'' if n == 1 else 's'} ago ({date})",
        "ru": f"{n} {_ru_plural(n, 'день', 'дня', 'дней')} назад ({date})",
        "kk": f"{n} күн бұрын ({date})",
    }


def ev(attribute: str | Localized, value: str | Localized, raw: str | None = None) -> Evidence:
    """Evidence with its translations (only languages that differ from English are stored)."""
    a = attribute if isinstance(attribute, dict) else lit(attribute)
    v = value if isinstance(value, dict) else lit(value)
    return Evidence(
        attribute=a["en"], value=v["en"], raw=raw,
        attribute_i18n={lang: a[lang] for lang in TRANSLATED if a[lang] != a["en"]},
        value_i18n={lang: v[lang] for lang in TRANSLATED if v[lang] != v["en"]},
    )


def pick(loc: Localized | str, lang: str) -> str:
    if isinstance(loc, dict):
        return loc.get(lang) or loc.get("en", "")
    return loc

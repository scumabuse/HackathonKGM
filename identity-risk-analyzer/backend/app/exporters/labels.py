"""Static report labels for CSV / XLSX / HTML exports, per language."""
from __future__ import annotations

from ..core.i18n import normalize_lang, t

LABELS: dict[str, dict[str, str]] = {
    "en": {
        "col.level": "Level", "col.score": "Object risk score", "col.rule_weight": "Rule weight", "col.k": "k",
        "col.category": "Category", "col.rule_id": "Rule", "col.title": "Finding", "col.object_type": "Object type",
        "col.object_name": "Object", "col.object_dn": "Distinguished name", "col.description": "Description",
        "col.evidence": "Evidence", "col.privilege_path": "Privilege path", "col.recommendation": "Recommendation",
        "col.remediation_command": "PowerShell (text only, not executed)", "col.mitre": "MITRE ATT&CK",
        "col.first_seen": "First seen", "col.finding_id": "Finding ID",
        "sheet.summary": "Summary", "sheet.findings": "Findings", "sheet.objects": "Objects",
        "report.title": "Identity Risk Analyzer — AD security report",
        "meta.domain": "Domain", "meta.scan_id": "Scan ID", "meta.started": "Started (UTC)", "meta.source": "Source",
        "meta.trigger": "Trigger", "meta.score": "AD Security Score (0–100, higher is better)", "meta.band": "Band",
        "meta.rows": "Findings in this export",
        "sec.levels": "Objects by risk level", "sec.kpis": "Key indicators", "sec.categories": "Category penalty (max 20 each)",
        "kpi.inactive_users": "Inactive users", "kpi.service_pne": "Service accounts: password never expires",
        "kpi.disabled_privileged": "Disabled privileged accounts", "kpi.excessive_rights": "Excessive rights (nested groups)",
        "kpi.hidden_admins": "Hidden admins (primaryGroupID)", "kpi.kerberoastable": "Kerberoastable service accounts",
        "kpi.asrep_roastable": "AS-REP roastable accounts", "kpi.inactive_computers": "Inactive computers",
        "kpi.privileged": "Privileged accounts", "kpi.service": "Service accounts", "kpi.users": "User objects",
        "kpi.computers": "Computer objects",
        "obj.level": "Level", "obj.score": "Score", "obj.k": "k", "obj.type": "Type", "obj.object": "Object",
        "obj.dn": "Distinguished name", "obj.findings": "Findings", "obj.rules": "Rules", "obj.path": "Privilege path",
        "html.eyebrow": "Infrastructure Risk Radar · Identity module",
        "html.heading": "Active Directory security report — {domain}",
        "html.scan": "scan", "html.source": "source", "html.generated": "generated", "html.filtered": "filtered export",
        "html.gauge": "AD Security Score — domain health, <b>higher is better</b>", "html.of100": "of 100",
        "html.objects_suffix": "objects", "html.kpi_inactive": "Inactive users",
        "html.kpi_pne": "Service accts · pwd never expires", "html.kpi_disabled": "Disabled but privileged",
        "html.kpi_excessive": "Excessive rights (nesting)", "html.most_risky": "Most risky objects",
        "html.th_level": "Level", "html.th_risk": "Object risk", "html.th_object": "Object", "html.th_type": "Type",
        "html.th_top": "Top finding", "html.th_path": "Path", "html.th_score": "Score", "html.th_rule": "Rule",
        "html.th_finding": "Finding", "html.findings": "Findings", "html.more": "more",
        "html.details": "Evidence, fix", "html.and_mitre": "& MITRE", "html.recommendation": "Recommendation.",
        "html.note": ("Object Risk Score: 0–100, higher = worse, score = min(100, round(100·(1 − Π(1 − wᵢ))·k)), "
                      "k = 1.2 for Tier-0 objects. AD Security Score: 0–100, higher = better (100 minus category "
                      "penalties, each capped at 20). Collected read-only with a least-privilege account; no passwords "
                      "or hashes were read. PowerShell commands are recommendations only and were never executed."),
    },
    "ru": {
        "col.level": "Уровень", "col.score": "Риск объекта", "col.rule_weight": "Вес правила", "col.k": "k",
        "col.category": "Категория", "col.rule_id": "Правило", "col.title": "Находка", "col.object_type": "Тип объекта",
        "col.object_name": "Объект", "col.object_dn": "Distinguished name", "col.description": "Описание",
        "col.evidence": "Доказательства", "col.privilege_path": "Путь привилегий", "col.recommendation": "Рекомендация",
        "col.remediation_command": "PowerShell (только текст, не выполняется)", "col.mitre": "MITRE ATT&CK",
        "col.first_seen": "Впервые обнаружено", "col.finding_id": "ID находки",
        "sheet.summary": "Сводка", "sheet.findings": "Находки", "sheet.objects": "Объекты",
        "report.title": "Identity Risk Analyzer — отчёт о безопасности AD",
        "meta.domain": "Домен", "meta.scan_id": "ID скана", "meta.started": "Начало (UTC)", "meta.source": "Источник",
        "meta.trigger": "Запуск", "meta.score": "AD Security Score (0–100, чем выше, тем лучше)", "meta.band": "Оценка",
        "meta.rows": "Находок в выгрузке",
        "sec.levels": "Объекты по уровню риска", "sec.kpis": "Ключевые показатели",
        "sec.categories": "Штраф по категориям (макс. 20 каждая)",
        "kpi.inactive_users": "Неактивные пользователи", "kpi.service_pne": "Сервисные учётки: пароль не истекает",
        "kpi.disabled_privileged": "Отключённые привилегированные учётки",
        "kpi.excessive_rights": "Избыточные права (вложенные группы)",
        "kpi.hidden_admins": "Скрытые админы (primaryGroupID)", "kpi.kerberoastable": "Сервисные учётки для Kerberoasting",
        "kpi.asrep_roastable": "Учётки для AS-REP roasting", "kpi.inactive_computers": "Неактивные компьютеры",
        "kpi.privileged": "Привилегированные учётки", "kpi.service": "Сервисные учётки", "kpi.users": "Объекты-пользователи",
        "kpi.computers": "Объекты-компьютеры",
        "obj.level": "Уровень", "obj.score": "Балл", "obj.k": "k", "obj.type": "Тип", "obj.object": "Объект",
        "obj.dn": "Distinguished name", "obj.findings": "Находки", "obj.rules": "Правила", "obj.path": "Путь привилегий",
        "html.eyebrow": "Infrastructure Risk Radar · модуль «Идентичность»",
        "html.heading": "Отчёт о безопасности Active Directory — {domain}",
        "html.scan": "скан", "html.source": "источник", "html.generated": "сформирован", "html.filtered": "выгрузка по фильтру",
        "html.gauge": "AD Security Score — здоровье домена, <b>чем выше, тем лучше</b>", "html.of100": "из 100",
        "html.objects_suffix": "объекты", "html.kpi_inactive": "Неактивные пользователи",
        "html.kpi_pne": "Сервисные · пароль не истекает", "html.kpi_disabled": "Отключены, но с привилегиями",
        "html.kpi_excessive": "Избыточные права (вложенность)", "html.most_risky": "Самые рискованные объекты",
        "html.th_level": "Уровень", "html.th_risk": "Риск объекта", "html.th_object": "Объект", "html.th_type": "Тип",
        "html.th_top": "Главная находка", "html.th_path": "Путь", "html.th_score": "Балл", "html.th_rule": "Правило",
        "html.th_finding": "Находка", "html.findings": "Находки", "html.more": "ещё",
        "html.details": "Доказательства, исправление", "html.and_mitre": "и MITRE", "html.recommendation": "Рекомендация.",
        "html.note": ("Риск объекта: 0–100, чем выше, тем хуже, score = min(100, round(100·(1 − Π(1 − wᵢ))·k)), "
                      "k = 1.2 для объектов Tier-0. AD Security Score: 0–100, чем выше, тем лучше (100 минус штрафы "
                      "по категориям, каждый не более 20). Данные собраны только на чтение учётной записью с минимальными "
                      "правами; пароли и хэши не считывались. Команды PowerShell — только рекомендации, они не выполнялись."),
    },
    "kk": {
        "col.level": "Деңгей", "col.score": "Объект тәуекелі", "col.rule_weight": "Ереже салмағы", "col.k": "k",
        "col.category": "Санат", "col.rule_id": "Ереже", "col.title": "Табылған мәселе", "col.object_type": "Объект түрі",
        "col.object_name": "Объект", "col.object_dn": "Distinguished name", "col.description": "Сипаттама",
        "col.evidence": "Дәлелдер", "col.privilege_path": "Артықшылық жолы", "col.recommendation": "Ұсыныс",
        "col.remediation_command": "PowerShell (тек мәтін, орындалмайды)", "col.mitre": "MITRE ATT&CK",
        "col.first_seen": "Алғаш анықталған", "col.finding_id": "Мәселе ID",
        "sheet.summary": "Жиынтық", "sheet.findings": "Мәселелер", "sheet.objects": "Объектілер",
        "report.title": "Identity Risk Analyzer — AD қауіпсіздігі туралы есеп",
        "meta.domain": "Домен", "meta.scan_id": "Сканерлеу ID", "meta.started": "Басталуы (UTC)", "meta.source": "Көз",
        "meta.trigger": "Іске қосу", "meta.score": "AD Security Score (0–100, неғұрлым жоғары болса, соғұрлым жақсы)",
        "meta.band": "Бағалау", "meta.rows": "Экспорттағы мәселелер",
        "sec.levels": "Тәуекел деңгейі бойынша объектілер", "sec.kpis": "Негізгі көрсеткіштер",
        "sec.categories": "Санаттар бойынша айыппұл (әрқайсысы ең көбі 20)",
        "kpi.inactive_users": "Белсенді емес пайдаланушылар", "kpi.service_pne": "Қызметтік тіркелгілер: құпиясөз ескірмейді",
        "kpi.disabled_privileged": "Өшірілген артықшылықты тіркелгілер",
        "kpi.excessive_rights": "Артық құқықтар (кірістірілген топтар)",
        "kpi.hidden_admins": "Жасырын әкімшілер (primaryGroupID)", "kpi.kerberoastable": "Kerberoasting-ке осал тіркелгілер",
        "kpi.asrep_roastable": "AS-REP roasting-ке осал тіркелгілер", "kpi.inactive_computers": "Белсенді емес компьютерлер",
        "kpi.privileged": "Артықшылықты тіркелгілер", "kpi.service": "Қызметтік тіркелгілер", "kpi.users": "Пайдаланушы объектілері",
        "kpi.computers": "Компьютер объектілері",
        "obj.level": "Деңгей", "obj.score": "Балл", "obj.k": "k", "obj.type": "Түрі", "obj.object": "Объект",
        "obj.dn": "Distinguished name", "obj.findings": "Мәселелер", "obj.rules": "Ережелер", "obj.path": "Артықшылық жолы",
        "html.eyebrow": "Infrastructure Risk Radar · «Сәйкестік» модулі",
        "html.heading": "Active Directory қауіпсіздігі туралы есеп — {domain}",
        "html.scan": "сканерлеу", "html.source": "көз", "html.generated": "жасалған", "html.filtered": "сүзгі бойынша экспорт",
        "html.gauge": "AD Security Score — домен денсаулығы, <b>неғұрлым жоғары, соғұрлым жақсы</b>", "html.of100": "100-ден",
        "html.objects_suffix": "объектілер", "html.kpi_inactive": "Белсенді емес пайдаланушылар",
        "html.kpi_pne": "Қызметтік · құпиясөз ескірмейді", "html.kpi_disabled": "Өшірілген, бірақ артықшылықты",
        "html.kpi_excessive": "Артық құқықтар (кірістіру)", "html.most_risky": "Ең қауіпті объектілер",
        "html.th_level": "Деңгей", "html.th_risk": "Объект тәуекелі", "html.th_object": "Объект", "html.th_type": "Түрі",
        "html.th_top": "Басты мәселе", "html.th_path": "Жол", "html.th_score": "Балл", "html.th_rule": "Ереже",
        "html.th_finding": "Мәселе", "html.findings": "Мәселелер", "html.more": "тағы",
        "html.details": "Дәлелдер, түзету", "html.and_mitre": "және MITRE", "html.recommendation": "Ұсыныс.",
        "html.note": ("Объект тәуекелі: 0–100, неғұрлым жоғары болса, соғұрлым нашар, score = min(100, round(100·(1 − "
                      "Π(1 − wᵢ))·k)), Tier-0 объектілері үшін k = 1.2. AD Security Score: 0–100, неғұрлым жоғары болса, "
                      "соғұрлым жақсы (100 минус санаттар бойынша айыппұлдар, әрқайсысы ең көбі 20). Деректер ең аз "
                      "құқықтары бар тіркелгімен тек оқу режимінде жиналды; құпиясөздер мен хэштер оқылмады. PowerShell "
                      "командалары — тек ұсыныстар, олар орындалмаған."),
    },
}


def labels(lang: str) -> dict[str, str]:
    return LABELS[normalize_lang(lang)]


def level_name(level: str, lang: str) -> str:
    return t(f"level.{level}", lang)


def band_name(band: str, lang: str) -> str:
    return t(f"band.{band}", lang)


def category_name(category: str, lang: str) -> str:
    return t(f"category.{category}", lang)


def type_name(object_type: str, lang: str) -> str:
    return t(f"type.{object_type}", lang)

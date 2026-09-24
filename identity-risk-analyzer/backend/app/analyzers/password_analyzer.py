"""Passwords & authentication — spec 2.3.4.

HARD SECURITY RULE: no password or hash is ever read. We use only policy attributes,
userAccountControl flags and Security-log metadata (event id, account, source, time).
Replication-based hash checks (DSInternals) are intentionally NOT implemented: they need
replication rights and violate least privilege.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import timedelta

from ..collectors.adtypes import interval_to_timedelta, parse_iso
from ..core.constants import EVENTS, PWD_PROPERTIES
from ..core.i18n import Localized, ev, lit, tr
from ..core.models import Evidence, RuleHit
from ..core.pipeline import ps_quote
from .context import AnalysisContext
from .user_analyzer import uac_evidence

FAILURE_EVENTS = {EVENTS["FAILED_LOGON"], EVENTS["KERB_PREAUTH_FAIL"], EVENTS["NTLM_VALIDATE"]}


def _policy_hits(ctx: AnalysisContext, *, object_type: str, name: str, dn: str, label: Localized, setter: str,
                 min_len: int | None, lockout: int | None, complexity: bool | None, reversible: bool | None,
                 extra: list[Evidence]) -> list[RuleHit]:
    hits: list[RuleHit] = []

    def hit(rule_id: str, evidence: list[Evidence], **vars: object) -> None:
        hits.append(RuleHit(rule_id=rule_id, object_type=object_type, object_name=name, object_dn=dn,
                            evidence=[*evidence, *extra],
                            template_vars={"policy_label": label, "ps_policy_setter": setter, **{k: str(v) for k, v in vars.items()}}))

    if min_len is not None and min_len < ctx.t.min_pwd_length:
        hit("AD-POL-MIN-LENGTH", [ev("minPwdLength", tr("min_length_value", n=min_len, b=ctx.t.min_pwd_length),
                                     raw=str(min_len))], current_value=min_len)
    if lockout == 0:
        hit("AD-POL-NO-LOCKOUT", [ev("lockoutThreshold", tr("no_lockout_value"), raw="0")])
    if complexity is False:
        hit("AD-POL-NO-COMPLEXITY", [ev(tr("attr.complexity"), tr("disabled"))])
    if reversible is True:
        hit("AD-POL-REVERSIBLE", [ev(tr("attr.reversible"), tr("enabled"))])
    return hits


def _event_time(e: dict):
    return parse_iso(e.get("time"))


def detect_spray(ctx: AnalysisContext, failures: list[dict]) -> list[RuleHit]:
    t = ctx.t
    window = timedelta(minutes=t.spray_window_minutes)
    by_source: dict[str, list[dict]] = defaultdict(list)
    for e in failures:
        if e.get("source_ip"):
            by_source[e["source_ip"]].append(e)
    hits: list[RuleHit] = []
    for src, evs in by_source.items():
        evs.sort(key=_event_time)
        best: tuple[int, int, int, Counter] | None = None
        counts: Counter = Counter()
        lo = 0
        for hi, e in enumerate(evs):  # two-pointer sliding window
            counts[(e.get("target_user") or "").lower()] += 1
            while _event_time(e) - _event_time(evs[lo]) > window:
                k = (evs[lo].get("target_user") or "").lower()
                counts[k] -= 1
                if counts[k] <= 0:
                    del counts[k]
                lo += 1
            low_and_slow = [u for u, c in counts.items() if c <= t.spray_max_attempts_per_account]
            if len(low_and_slow) >= t.spray_min_accounts and (best is None or len(low_and_slow) > best[0]):
                best = (len(low_and_slow), lo, hi, Counter(counts))
        if best is None:
            continue
        n, lo, hi, snap = best
        first, last = _event_time(evs[lo]), _event_time(evs[hi])
        minutes = max(1, round((last - first).total_seconds() / 60))
        ws = sorted({e.get("workstation") for e in evs[lo:hi + 1] if e.get("workstation")})
        ids = sorted({str(e.get("event_id")) for e in evs[lo:hi + 1]})
        targets = sorted(snap)
        hits.append(RuleHit(
            rule_id="AD-AUTH-SPRAY", object_type="host", object_name=src, object_dn=f"ip:{src}",
            evidence=[
                ev(tr("attr.source"), f"{src}" + (f" ({', '.join(ws)})" if ws else "")),
                ev(tr("attr.distinct_targets"), tr("spray_targets_value", n=n, m=minutes, k=max(snap.values()))),
                ev(tr("attr.window"), f"{first:%Y-%m-%d %H:%M} → {last:%H:%M} UTC"),
                ev(tr("attr.event_ids"), ", ".join(ids)),
                ev(tr("attr.targets"), ", ".join(targets[:20]) + (" …" if len(targets) > 20 else "")),
            ],
            template_vars={"target_count": str(n), "window_minutes": str(minutes),
                           "max_per_account": str(max(snap.values()))}))
    return hits


def detect_brute_force(ctx: AnalysisContext, events: list[dict]) -> list[RuleHit]:
    by_user: dict[str, list[dict]] = defaultdict(list)
    for e in events:
        if e.get("event_id") in FAILURE_EVENTS | {EVENTS["SUCCESS_LOGON"], EVENTS["LOCKOUT"]}:
            by_user[(e.get("target_user") or "").lower()].append(e)
    principals = {p.sam.lower(): p for p in ctx.users() + ctx.service_accounts()}
    hits: list[RuleHit] = []
    for user, evs in by_user.items():
        p = principals.get(user)
        if p is None:
            continue
        evs.sort(key=_event_time)
        run: list[dict] = []
        best: list[dict] = []
        lockouts = [e for e in evs if e.get("event_id") == EVENTS["LOCKOUT"]]
        for e in evs:
            if e.get("event_id") in FAILURE_EVENTS:
                run.append(e)
                if len(run) > len(best):
                    best = list(run)
            elif e.get("event_id") == EVENTS["SUCCESS_LOGON"]:
                run = []
        if len(best) < ctx.t.brute_min_failures:
            continue
        sources = sorted({f"{e.get('source_ip')}" + (f" ({e.get('workstation')})" if e.get("workstation") else "") for e in best})
        first, last = _event_time(best[0]), _event_time(best[-1])
        ids = ", ".join(sorted({str(e.get("event_id")) for e in best}))
        evid = [ev(tr("attr.consecutive_failures"), tr("brute_failures_value", n=len(best), ids=ids)),
                ev(tr("attr.window"), f"{first:%Y-%m-%d %H:%M} → {last:%H:%M} UTC"),
                ev(tr("attr.sources"), ", ".join(sources))]
        if lockouts:
            evid.append(ev(tr("attr.event_4740"), tr("locked_out_at", time=f"{_event_time(lockouts[-1]):%Y-%m-%d %H:%M}")))
        hits.append(RuleHit(rule_id="AD-AUTH-BRUTE", object_type=p.object_type, object_name=p.sam, object_dn=p.dn, evidence=evid,
                            template_vars={"failure_count": str(len(best)), "first_failure": f"{first:%Y-%m-%d %H:%M}",
                                           "last_failure": f"{last:%H:%M} UTC", "sources": ", ".join(sources)}))
    return hits


def analyze(ctx: AnalysisContext) -> list[RuleHit]:
    hits: list[RuleHit] = []

    # --- default domain password policy -------------------------------------------------------
    d = ctx.domain_rec
    props = int(d.get("pwdProperties") or 0)
    max_age = interval_to_timedelta(d.get("maxPwdAge"))
    age = tr("days_n", n=max_age.days) if max_age else tr("never")
    hits += _policy_hits(
        ctx, object_type="domain", name=ctx.domain, dn=ctx.domain_dn, label=tr("policy_default_label"),
        setter=f"Set-ADDefaultDomainPasswordPolicy -Identity '{ps_quote(ctx.domain)}'",
        min_len=d.get("minPwdLength"), lockout=d.get("lockoutThreshold"),
        complexity=bool(props & PWD_PROPERTIES["COMPLEXITY"]), reversible=bool(props & PWD_PROPERTIES["STORE_CLEARTEXT"]),
        extra=[ev(tr("attr.policy"), tr("policy_summary", min=d.get("minPwdLength"), lock=d.get("lockoutThreshold"),
                                           props=f"{props:X}", age=age))])

    # --- fine-grained password policies (PSOs) ---------------------------------------------------
    for pso in ctx.snapshot.get("psos", []):
        name = pso.get("name") or pso["distinguishedName"]
        names = ", ".join(ctx._name(x.lower()) for x in pso.get("msDS-PSOAppliesTo") or [])
        applies: Localized = lit(names) if names else tr("nobody")
        hits += _policy_hits(
            ctx, object_type="policy", name=name, dn=pso["distinguishedName"],
            label=tr("policy_pso_label", name=name, applies=applies),
            setter=f"Set-ADFineGrainedPasswordPolicy -Identity '{ps_quote(name)}'",
            min_len=pso.get("msDS-MinimumPasswordLength"), lockout=pso.get("msDS-LockoutThreshold"),
            complexity=pso.get("msDS-PasswordComplexityEnabled"), reversible=pso.get("msDS-PasswordReversibleEncryptionEnabled"),
            extra=[ev("msDS-PSOAppliesTo", applies),
                   ev(tr("attr.precedence"), str(pso.get("msDS-PasswordSettingsPrecedence")))])

    # --- weakened accounts ------------------------------------------------------------------------
    for p in ctx.users():
        if not p.enabled or p.is_gmsa:
            continue
        for flag, rule in (("PASSWD_NOTREQD", "AD-PWD-NOTREQD"), ("ENCRYPTED_TEXT_PWD_ALLOWED", "AD-PWD-REVERSIBLE"),
                           ("DONT_REQ_PREAUTH", "AD-PWD-ASREP")):
            if p.flag(flag):
                hits.append(RuleHit(rule_id=rule, object_type=p.object_type, object_name=p.sam, object_dn=p.dn,
                                    evidence=[uac_evidence(p, flag)]))

    # --- Security log: spray & brute force (degrades gracefully without logs) -----------------------
    auth = ctx.snapshot.get("auth_events") or {}
    if auth.get("status") == "ok":
        events = auth.get("events") or []
        failures = [e for e in events if e.get("event_id") in FAILURE_EVENTS
                    and not (e.get("event_id") == EVENTS["NTLM_VALIDATE"] and str(e.get("status") or "0x0") in ("0x0", "0"))]
        hits += detect_spray(ctx, failures)
        hits += detect_brute_force(ctx, events)
    return hits

# MASTER PROMPT — Build "Identity Risk Analyzer" (Active Directory Security Radar)

> Paste this entire file into Claude Code as the first message of a fresh session.
> It is written as a complete, self-contained brief. Follow it top to bottom.
> When something is ambiguous, prefer the interpretation that makes the **demo impressive**, **offline-runnable**, and **security-correct**.

---

## 0. ROLE & OPERATING RULES (read first)

You are a **senior full-stack + AD security engineer**. You will build a working MVP called **Identity Risk Analyzer** — a tool that automatically audits a Microsoft Active Directory domain, scores the risk of every object, explains *why*, and recommends fixes. This is a hackathon deliverable; it must look and feel like a polished commercial security product (think a lightweight PingCastle / ManageEngine ADAudit Plus with a modern UI).

**How you must work in this session:**

1. **Plan first.** Before writing code, produce a short build plan and the full file tree. Then execute it milestone by milestone.
2. **Build in vertical slices**, backend contract first, then wire the frontend to real API responses. Never leave the frontend on fake data once the API exists.
3. **Self-verify after every milestone.** Write tests, run them, run the app, read your own output, fix what's broken. Do not report "done" until the acceptance checklist in §14 passes. Actually run the commands; paste real output; if something fails, fix it and re-run.
4. **Offline-first.** The single most important non-obvious requirement: the entire app must run and demo **without a live Active Directory**, using a realistic mock dataset (see §7). A live-LDAP mode must also exist and share 100% of the analysis code path. If the demo VM dies on stage, the mock mode must produce an identical-looking dashboard.
5. **No stubs left behind.** Every feature you claim is done must actually work end to end. If you must defer something, say so explicitly and mark it `# TODO(P2)`.
6. **Security is a hard constraint, not a feature.** Read-only. Minimal privileges. Never fetch, store, log, or display plaintext passwords or password hashes. See §12.

---

## 1. MISSION & CONTEXT

The domain: "detect the problem before it becomes an incident." Corporate AD accumulates dead accounts, over-privileged users, weak password policy, and risky service accounts. Manual audits are slow. This tool automates it: **collect AD objects → run rules → score risk per object → roll up to an AD Security Score → explain causes → recommend remediation → export.**

The tool is **Module 1 of a future platform** called *Infrastructure Risk Radar* (siblings will be Certificate Radar, DNS Radar, Patch Radar, Backup Radar). Therefore the architecture must be **modular and pluggable**: a shared core (Finding model + Risk Engine + Storage + API + UI shell) with AD as one collector-set among future ones. Design for this now, even though only AD is implemented.

---

## 2. TECH STACK (pin these; do not substitute silently)

**Backend**
- Python 3.11+
- `fastapi` + `uvicorn[standard]` — API
- `ldap3` — LDAP collection (pure-Python, cross-platform)
- `pydantic` v2 — data models / validation
- `sqlalchemy` 2.x + SQLite — storage & scan history/snapshots
- `PyYAML` — declarative rule definitions
- `openpyxl` — Excel export
- `Jinja2` — HTML export
- `apscheduler` — optional scheduled re-scans
- `python-dateutil`, `pytz` — time handling
- `pytest`, `pytest-asyncio`, `httpx` — tests

**Frontend**
- React 18 + **TypeScript** + **Vite**
- **Tailwind CSS**
- **shadcn/ui** as the component base
- **21st.dev** components/aesthetic for the "wow" pieces (animated hero, bento grid, animated counters, gradient/aurora backgrounds, marquee, spotlight cards). Install 21st.dev blocks via `npx shadcn@latest add "https://21st.dev/r/<component>"` **if network allows**; if the registry is unreachable, **replicate the same look** by hand with Tailwind + Framer Motion — do not fail the build over a missing registry.
- **Framer Motion** (`motion`) — all animations: page transitions, list stagger, number roll-ups, gauge sweep, hover/tap micro-interactions.
- **Recharts** — charts (donut, bar, line/area for trend).
- `lucide-react` — icons
- `@tanstack/react-query` — data fetching/caching
- `react-router-dom` — routing
- `sonner` — toasts

Read the `frontend-design` skill before styling and follow it: aim for an intentional, distinctive **security operations center** aesthetic, not a default template.

---

## 3. REPOSITORY STRUCTURE (create exactly this)

```
identity-risk-analyzer/
├─ README.md                      # what it is, how to run (both modes), screenshots section
├─ docker-compose.yml             # optional convenience: api + web
├─ .env.example                   # LDAP + app config, all documented
├─ backend/
│  ├─ pyproject.toml / requirements.txt
│  ├─ app/
│  │  ├─ main.py                  # FastAPI app + CORS + routers + startup
│  │  ├─ config.py                # pydantic-settings, reads .env
│  │  ├─ core/
│  │  │  ├─ models.py             # Finding, RiskLevel, ScanResult, Entity, Evidence (pydantic)
│  │  │  ├─ risk_engine.py        # THE scoring formula (see §6) — pure, unit-tested
│  │  │  ├─ rules_loader.py       # loads YAML rules, validates schema
│  │  │  └─ constants.py          # UAC flags, well-known RIDs, LDAP OIDs, event IDs
│  │  ├─ collectors/
│  │  │  ├─ base.py               # Collector ABC (future modules implement this)
│  │  │  ├─ ldap_collector.py     # ldap3 live collection
│  │  │  ├─ eventlog_collector.py # Security log parse (spray/brute-force) — P1
│  │  │  └─ mock_collector.py     # returns the demo dataset (§7) in the SAME shape
│  │  ├─ analyzers/
│  │  │  ├─ user_analyzer.py      # 2.3.1 rules
│  │  │  ├─ service_analyzer.py   # 2.3.2 rules
│  │  │  ├─ privilege_analyzer.py # 2.3.3 rules + nested-group graph
│  │  │  ├─ password_analyzer.py  # 2.3.4 rules (policy + auth-log signals)
│  │  │  └─ extra_analyzer.py     # 2.3.5 optional checks (P2)
│  │  ├─ storage/
│  │  │  ├─ db.py                 # SQLAlchemy engine/session
│  │  │  ├─ repositories.py       # save scan, load history, diff scans
│  │  │  └─ schema.py             # ORM tables: scans, findings, snapshots, audit_log
│  │  ├─ exporters/
│  │  │  ├─ csv_exporter.py
│  │  │  ├─ xlsx_exporter.py
│  │  │  └─ html_exporter.py
│  │  ├─ api/
│  │  │  ├─ routes_scan.py        # run scan, list scans, get scan
│  │  │  ├─ routes_findings.py    # list/filter findings, get finding detail
│  │  │  ├─ routes_dashboard.py   # aggregated dashboard payload
│  │  │  ├─ routes_export.py      # csv/xlsx/html download
│  │  │  └─ routes_settings.py    # thresholds, weights (configurable)
│  │  └─ rules/                   # YAML rule files, one per category
│  │     ├─ users.yaml
│  │     ├─ service_accounts.yaml
│  │     ├─ privileges.yaml
│  │     └─ passwords.yaml
│  ├─ tests/
│  │  ├─ test_risk_engine.py      # MUST assert ServiceAccount01 == 85 (see §6)
│  │  ├─ test_analyzers.py        # each analyzer flags the seeded mock objects
│  │  ├─ test_api.py              # endpoints return valid schemas
│  │  └─ test_exports.py          # files generate & open
│  └─ data/
│     ├─ mock_ad.json             # the demo dataset (§7) — generated, checked in
│     └─ risk_radar.db            # created at runtime (gitignored)
├─ frontend/
│  ├─ package.json, vite.config.ts, tailwind.config.ts, tsconfig.json
│  ├─ index.html
│  └─ src/
│     ├─ main.tsx, App.tsx, router.tsx
│     ├─ lib/ (api client, types generated/mirrored from backend, utils)
│     ├─ components/
│     │  ├─ ui/                   # shadcn + 21st.dev components
│     │  ├─ charts/               # RiskDonut, CategoryBar, TrendArea
│     │  ├─ AnimatedCounter.tsx, ScoreGauge.tsx, RiskBadge.tsx
│     │  ├─ FindingCard.tsx, FindingDetailSheet.tsx
│     │  ├─ PrivilegePathGraph.tsx  # visualizes nested-group escalation path
│     │  └─ layout/ (Sidebar, Topbar, PageShell)
│     └─ pages/
│        ├─ PlatformHome.tsx      # Infrastructure Risk Radar landing (module tiles)
│        ├─ Dashboard.tsx         # §2.5 dashboard
│        ├─ Findings.tsx          # filterable/sortable table
│        ├─ AccountDetail.tsx     # per-object drilldown
│        └─ Settings.tsx          # thresholds & weights
└─ scripts/
   ├─ seed_lab_ad.ps1            # PowerShell to build a REAL test domain matching §7 counts
   └─ generate_mock.py           # produces backend/data/mock_ad.json
```

---

## 4. DATA MODEL (single source of truth — build this first)

Define these pydantic models in `core/models.py`. Everything downstream depends on them. This is the schema that future platform modules will also emit.

```python
class RiskLevel(str, Enum):
    CRITICAL = "Critical"   # score >= 80
    HIGH     = "High"       # 60-79
    MEDIUM   = "Medium"     # 30-59
    LOW      = "Low"        # < 30

class Evidence(BaseModel):
    attribute: str          # e.g. "pwdLastSet"
    value: str              # human-readable, e.g. "730 days ago (2024-01-15)"
    raw: str | None = None  # raw attribute value for auditors

class Finding(BaseModel):
    id: str                 # stable hash(rule_id + object_dn)
    module: str = "identity"        # future: "certificate", "dns"...
    rule_id: str            # e.g. "AD-SVC-PNE"
    category: str           # Stale | Privileged | Passwords | Service | Config
    object_type: str        # user | computer | serviceAccount | group
    object_name: str        # sAMAccountName
    object_dn: str
    title: str              # short
    description: str        # what's wrong, plain language
    recommendation: str     # what to do
    remediation_command: str | None = None  # PowerShell TEXT ONLY, never executed
    level: RiskLevel
    score: int              # 0-100 (this object, this finding cluster)
    weight_breakdown: list[dict]   # [{rule, weight, matched:bool}] for the "why 85" panel
    evidence: list[Evidence]
    privilege_path: list[str] | None = None  # ["ivanov","IT-Support","Helpdesk-L2","Domain Admins"]
    mitre: list[str] = []   # ["T1558.003"] etc.
    first_seen: datetime
    last_seen: datetime

class ScanResult(BaseModel):
    scan_id: str
    started_at: datetime
    finished_at: datetime
    source: str             # "mock" | "ldap://dc.lab.local"
    domain: str
    ad_security_score: int  # 0-100, HIGHER IS BETTER (domain health)
    counts: dict            # {Critical, High, Medium, Low, stale, service, privileged, computers}
    category_scores: dict   # {Stale: 12, Privileged: 20, ...} penalty per category
    findings: list[Finding]
```

**Two scores that must never be confused in the UI:**
- **Object Risk Score** → higher = worse (per finding/account).
- **AD Security Score** → higher = better (domain health, 0–100). Label both explicitly on screen.

---

## 5. AD CHECKS TO IMPLEMENT (exact attributes & flags — do not guess)

Put all magic numbers in `core/constants.py`. Search groups **by SID/RID**, never by localized names (a Russian-locale DC calls Domain Admins «Администраторы домена» — name matching breaks).

### 5.0 Constants
```python
# userAccountControl bit flags
UAC = {
  "ACCOUNTDISABLE": 0x0002,
  "PASSWD_NOTREQD": 0x0020,
  "ENCRYPTED_TEXT_PWD_ALLOWED": 0x0080,   # reversible encryption
  "DONT_EXPIRE_PASSWD": 0x10000,          # Password Never Expires
  "TRUSTED_FOR_DELEGATION": 0x80000,      # unconstrained delegation
  "DONT_REQ_PREAUTH": 0x400000,           # AS-REP roasting
}
# msDS-User-Account-Control-Computed
UAC_COMPUTED = {"LOCKOUT": 0x0010, "PASSWORD_EXPIRED": 0x800000}
# LDAP bitwise matching-rule OIDs
LDAP_BIT_AND = "1.2.840.113556.1.4.803"
LDAP_BIT_OR  = "1.2.840.113556.1.4.804"
LDAP_IN_CHAIN = "1.2.840.113556.1.4.1941"   # nested group membership
# Well-known RIDs (append to domain SID; Builtin uses S-1-5-32-<rid>)
CRITICAL_RIDS = {512:"Domain Admins",518:"Schema Admins",519:"Enterprise Admins",
                 544:"Administrators",548:"Account Operators",549:"Server Operators",
                 551:"Backup Operators",502:"krbtgt"}
# DnsAdmins has no fixed RID -> resolve by sAMAccountName
# Security event IDs (Security log on DCs)
EVENTS = {"FAILED_LOGON":4625,"KERB_PREAUTH_FAIL":4771,"NTLM_VALIDATE":4776,
          "LOCKOUT":4740,"SUCCESS_LOGON":4624}  # LogonType 2=interactive,10=remote-interactive
```
FILETIME attributes (`lastLogonTimestamp`, `pwdLastSet`, `accountExpires`) are 100-ns intervals since 1601-01-01 UTC — write one converter and unit-test it. `pwdLastSet==0` means "must change at next logon"; `accountExpires` 0 or 0x7FFFFFFFFFFFFFFF means "never".

### 5.1 User accounts (`user_analyzer.py`) — spec 2.3.1
- **Stale / inactive**: `lastLogonTimestamp` older than `INACTIVE_DAYS` (default 90, configurable). If empty → never logged on → compare `whenCreated`. Note the 9–14 day replication lag in the tooltip.
- **Enabled but inactive**: not disabled (`UAC & 0x2 == 0`) AND stale.
- **Password Never Expires**: `(userAccountControl:1.2.840.113556.1.4.803:=65536)`.
- **Stale password**: `pwdLastSet` older than `PWD_MAX_AGE_DAYS` (default 365).
- **Locked / expired**: `msDS-User-Account-Control-Computed` LOCKOUT/PASSWORD_EXPIRED; `accountExpires` in the past.

### 5.2 Service accounts (`service_analyzer.py`) — spec 2.3.2
No native "service account" flag → detect via heuristics (make them configurable): non-empty `servicePrincipalName` on a user, name prefixes `svc_`/`sa_`/`srv_`, a designated OU, or gMSA objectClass.
- **SPN present → Kerberoastable** (flag as high value; MITRE T1558.003).
- **Interactive logon allowed**: from LDAP only `userWorkstations` restriction is visible; enrich with EventLog (4624 LogonType 2/10 by a service account) when logs are available.
- **Excessive rights**: service account that is a (possibly nested) member of a critical group.
- **Password Never Expires** (same flag as above).
- **No owner**: empty `managedBy` (this exactly matches the spec's ServiceAccount01 example).
- **Unused service account**: stale by `lastLogonTimestamp`.

### 5.3 Privileges (`privilege_analyzer.py`) — spec 2.3.3 (this is the core)
- Build an in-memory **group graph** and resolve membership via `LDAP_IN_CHAIN` AND by walking edges yourself so you can output the **escalation path** (`privilege_path`), e.g. `ivanov → IT-Support → Helpdesk-L2 → Domain Admins`. This directly satisfies "nested groups causing non-obvious privilege elevation."
- Resolve critical groups by **RID**, then find both direct and nested members.
- **Hidden membership via `primaryGroupID`**: a user with `primaryGroupID==512` is effectively a Domain Admin but is NOT listed in the group's `member` attribute — flag it (great demo moment).
- Also flag: privileged accounts that are **inactive**; **disabled but still in admin groups**; users in **multiple** admin groups; **oversized** Domain Admins group; `adminCount==1` on accounts no longer in any admin group (orphaned AdminSDHolder).

### 5.4 Passwords & authentication (`password_analyzer.py`) — spec 2.3.4
- **Domain policy** from domain-root attributes: `minPwdLength`, `maxPwdAge`, `lockoutThreshold` (0 = no lockout = unlimited guessing — flag hard), `pwdProperties` (complexity bit). Also enumerate Fine-Grained Password Policies (PSOs) if present.
- **Weakened accounts**: `PASSWD_NOTREQD (0x20)`, reversible encryption (`0x80`), `DONT_REQ_PREAUTH (0x400000` → AS-REP roasting, MITRE T1558.004).
- **Password Spray / Brute Force** (P1, from Security log via `eventlog_collector`): 
  - Spray = one source IP, many distinct target accounts, ≤2 attempts each within a window (default ≥10 accounts / 30 min) → MITRE T1110.003.
  - Brute force = one account, many consecutive failures.
  - If no logs available, degrade gracefully and say so in the UI (don't crash).
- **HARD SECURITY RULE**: never read, store, display, or transmit plaintext passwords or hashes. Do **not** implement DSInternals/replication-based hash checks in the MVP — that needs replication rights and violates least-privilege. Indirect signals above are sufficient.

### 5.5 Extra checks (`extra_analyzer.py`) — spec 2.3.5 (P2, optional, score bonus)
Inactive computer accounts; `sIDHistory` present; duplicate/misconfigured SPNs; unconstrained Kerberos delegation (`TRUSTED_FOR_DELEGATION` on non-DC); `krbtgt` password age > 180 days. Implement at least two if time permits.

---

## 6. RISK ENGINE (exact formula — must be unit-tested)

Single shared engine for this and all future modules. Rules live in YAML (`rules/*.yaml`), each with `id, category, weight (0..1), level_hint, title, description, recommendation, remediation_command, mitre`.

**Per-object score**, combining all matched rule weights (probabilistic OR so multiple signals compound but never exceed 100):

```
score = min(100, round(100 * (1 - Π(1 - wᵢ)) * k))
```
- `wᵢ` = weight of each matched rule on that object (0..1)
- `k` = object criticality multiplier: 1.0 normal, 1.2 Tier-0 / privileged / critical

**Mandatory acceptance test** — reproduce the spec's ServiceAccount01 = **85 (Critical)**. Use weights: Password Never Expires **0.30**, password unchanged 730 days **0.35**, elevated rights **0.50**, no owner **0.10**, interactive logon allowed **0.25**, `k=1.0`:
```
1 - (0.70 * 0.65 * 0.50 * 0.90 * 0.75) = 0.8465... -> 85
```
`test_risk_engine.py` MUST assert this equals 85 and level Critical. Tune the YAML weights so it lands exactly on 85. (Also reproduce Certificate Radar's example logic — 5-days-left 0.75 × k1.2 = 90 — as a comment/dormant test to prove the engine is module-agnostic.)

**Levels**: Critical ≥80, High 60–79, Medium 30–59, Low <30 (thresholds configurable via Settings).

**AD Security Score (domain health, higher=better)**: start at 100, subtract penalties across 5 categories (Stale, Privileged, Passwords, Service, Config), each capped at 20 so one category can't zero the domain. Penalty per category scales with count and severity of its findings. Return `category_scores` for the dashboard.

---

## 7. OFFLINE MOCK DATASET (make the demo bulletproof)

`scripts/generate_mock.py` writes `backend/data/mock_ad.json` — a realistic domain that, when analyzed, yields **exactly the spec's demo numbers**:
- **10 inactive users** (old `lastLogonTimestamp`)
- **7 service accounts with Password Never Expires**
- **3 disabled privileged accounts** (in admin groups but `ACCOUNTDISABLE` set)
- **2 users with excessive rights** (nested-group escalation, so the path graph has something to show)
- Plus: one `ServiceAccount01` engineered to score exactly 85; one hidden Domain Admin via `primaryGroupID=512`; one `DONT_REQ_PREAUTH` user; a `lockoutThreshold=0` domain policy; a few healthy accounts for contrast.

`mock_collector.py` returns this JSON in the **identical structure** `ldap_collector.py` emits, so analyzers/risk engine/API/UI are byte-for-byte the same in both modes. A `SOURCE=mock|ldap` env var (and a UI toggle) selects the collector. Also implement a "load from snapshot" path: any real scan can be saved to JSON and replayed offline.

`scripts/seed_lab_ad.ps1` builds the equivalent **real** test domain (Windows Server 2019+) with the same counts, so the same demo works live. Note in comments: `pwdLastSet` can only be set to 0 or -1, so to simulate "unchanged 730 days" either use the analyzer's configurable "analysis date"/thresholds, or (single lab DC only) shift the clock back, create objects, restore — snapshot the VM first.

---

## 8. API (FastAPI) — contract the frontend consumes

- `POST /api/scan` `{source:"mock"|"ldap"}` → runs collect+analyze+score, persists a `ScanResult`, returns `scan_id`.
- `GET  /api/scans` → history (id, time, score, counts) for the trend chart.
- `GET  /api/scans/{id}` → full `ScanResult`.
- `GET  /api/dashboard/{id}` → aggregated payload (gauge, counts, top-risk accounts, category breakdown, trend series).
- `GET  /api/findings?scan_id=&level=&category=&object_type=&q=&sort=` → filtered/sorted findings.
- `GET  /api/findings/{finding_id}?scan_id=` → detail incl. `weight_breakdown`, evidence, `privilege_path`.
- `GET  /api/export/{id}?format=csv|xlsx|html` → file download.
- `GET/PUT /api/settings` → thresholds & rule weights (persisted; re-scoring uses them).
- All writes append to `audit_log` (who/when/action/target). Serve OpenAPI docs at `/docs`.

---

## 9. FRONTEND — make it genuinely impressive

Aesthetic: **dark security-operations console** — deep slate/near-black base, one electric accent (cyan or violet), risk colors red/amber/emerald, subtle grid or aurora background, glassy cards, generous spacing, crisp mono for numbers/DNs. Read the `frontend-design` skill and commit to a real design direction; avoid default-shadcn blandness.

**Motion (Framer Motion / `motion`), used tastefully:**
- Page transitions (fade+slide) via `AnimatePresence`.
- **AnimatedCounter** — numbers roll up from 0 on mount (`useMotionValue`+`useSpring`).
- **ScoreGauge** — animated arc that sweeps to the AD Security Score, color-graded by band.
- Card grids animate in with **stagger** (`staggerChildren`).
- Spotlight/tilt hover on top-risk cards; animated risk badges; skeleton shimmer while `POST /api/scan` runs (show a "collecting → analyzing → scoring" stepped progress).
- Keep it smooth and purposeful — no gratuitous bounce. Respect `prefers-reduced-motion`.

**21st.dev pieces** for the landing + dashboard hero: animated/aurora background, bento grid of module tiles, spotlight cards, animated number blocks. Pull from the 21st.dev registry when reachable; otherwise reproduce the same look with Tailwind + motion.

**Pages:**
1. **PlatformHome** — "Infrastructure Risk Radar" bento landing: Identity Radar (live, glowing) + greyed "coming soon" tiles (Certificate/DNS/Patch/Backup) to sell the platform vision. CTA → run scan.
2. **Dashboard** (spec 2.5): ScoreGauge (0–100), animated Critical/High/Medium/Low counters, RiskDonut by level, CategoryBar by category, TrendArea of Security Score over scan history, "Most Risky Accounts" list (click → detail), tiles for stale/service/privileged counts, source badge (mock/live), "Run scan" + "Export" buttons.
3. **Findings** — dense, filterable, sortable table (level, category, object type, search, sort). Colored risk badges. Row click → detail sheet. Bulk export of current filter.
4. **AccountDetail** — the star of the demo: object header, big risk score with the **"why this score" weight-breakdown bars**, evidence list (attribute → value), **PrivilegePathGraph** (animated node chain for nested escalation), recommendation + copyable PowerShell command (copy button, never executed), MITRE tags.
5. **Settings** — sliders/inputs for thresholds (inactive days, pwd age, level cutoffs) and rule weights; triggers re-score.

Everything reads from `@tanstack/react-query`; loading and error states everywhere; toasts on scan complete/export.

---

## 10. EXPORTS

Wire real exporters (not placeholders):
- **CSV** — all findings, flat.
- **XLSX** (openpyxl) — a "Summary" sheet (scores/counts) + a "Findings" sheet, conditional-formatted by level, frozen header, auto width.
- **HTML** (Jinja2) — standalone self-contained report with the same summary + a styled findings table; opens in a browser offline.

---

## 11. STORAGE & HISTORY

SQLite via SQLAlchemy: tables `scans`, `findings`, `snapshots`, `audit_log`. Persist every scan so the **trend** chart and **diff** ("what changed since last scan": new/resolved/worsened findings) work. Expose the diff on the dashboard if time allows (P2).

---

## 12. SECURITY REQUIREMENTS (spec 4.2 — enforce, then show off in demo)

- **Read-only** LDAP; the tool never writes to AD. Recommendations are text (+ optional copyable PowerShell) only.
- **Least privilege**: works as a plain `Domain Users` account (+ `Event Log Readers` for the log-based checks). Domain Admin must NOT be required. Document this in README and surface a "running as read-only service account" badge in the UI.
- **No passwords/hashes** ever fetched, stored, logged, or displayed.
- **Audit logging** of all system actions.
- LDAP creds only from `.env`/env vars, never hardcoded; support LDAPS.

---

## 13. BUILD ORDER (milestones — self-verify at each)

1. **Scaffold** repo + both package managers install cleanly.
2. **Core models + risk engine + YAML rules** → `test_risk_engine.py` green, ServiceAccount01 == 85.
3. **Mock collector + generate_mock.py** → dataset yields the exact spec counts (assert in a test).
4. **Analyzers** → `test_analyzers.py`: each seeded issue is flagged, privilege paths resolve.
5. **Storage + API** → `test_api.py`: endpoints return valid schemas; scan persists; history works.
6. **Exports** → files generate and open; test asserts non-empty valid CSV/XLSX/HTML.
7. **Frontend** → wire every page to the live API; polish motion/design; both mock and (if available) live modes render identically.
8. **Live LDAP mode** → verify shape parity with mock (guard behind env; don't block the build if no DC).
9. **Docs + demo script** → README with run steps, a `DEMO.md` with the exact click-through, screenshots.

---

## 14. DEFINITION OF DONE (verify all before declaring complete — actually run it)

- [ ] `pytest` passes; `test_risk_engine.py` asserts ServiceAccount01 == 85 / Critical.
- [ ] `python scripts/generate_mock.py` then a mock scan reports **10 inactive, 7 service-PNE, 3 disabled-privileged, 2 excess-rights** (assert in test).
- [ ] Backend runs: `uvicorn app.main:app --reload`; `/docs` loads; a mock scan returns a full `ScanResult`.
- [ ] Frontend runs: `npm run dev`; Dashboard shows animated gauge + counters + charts fed by real API.
- [ ] AccountDetail shows the weight-breakdown ("why 85"), evidence, and an animated privilege path for a nested-escalation user.
- [ ] Hidden-Domain-Admin (`primaryGroupID=512`) is detected and displayed.
- [ ] CSV, XLSX, HTML exports download and open correctly.
- [ ] Settings changes re-score and update the dashboard.
- [ ] No plaintext password/hash anywhere in code, storage, logs, or UI; audit log records actions.
- [ ] README documents both mock and live modes and the least-privilege service account.
- [ ] `DEMO.md` contains a 3-minute click-through that works entirely offline in mock mode.

**Then** run a final self-review: reread your own code for stubs, dead endpoints, unhandled errors, and UI states that break on empty data; fix anything found; re-run the checklist; report results with real command output.

---

## 15. NICE-TO-HAVE (only after DoD is green)

MITRE ATT&CK badges on rules; scan diff view; APScheduler periodic re-scan; admin notifications (email/Telegram) mirroring the platform vision; dark/light toggle; keyboard-navigable findings table; Dockerized one-command run.

---

**Begin now:** print your build plan and the file tree, then start Milestone 1. Work autonomously through the milestones, self-verifying as you go, and stop only when §14 fully passes.

#!/usr/bin/env python
"""Generate backend/data/mock_ad.json — the offline demo domain (corp.local).

The dataset is engineered so that analysis yields EXACTLY the spec's demo numbers:
  * 10 inactive (enabled, non-privileged) users
  * 7 service accounts with Password Never Expires
  * 3 disabled privileged accounts
  * 2 users with excessive rights via nested groups (ivanov -> IT-Support -> Helpdesk-L2 -> Domain Admins)
  * ServiceAccount01 scoring exactly 85 (Critical)
  * 1 hidden Domain Admin via primaryGroupID=512, 1 AS-REP roastable user, lockoutThreshold=0
plus healthy accounts for contrast and a Security-log excerpt (password spray + brute force).

Records use the same normalized shape the live LDAP collector emits (raw UAC ints, FILETIME ints,
SID strings, DN lists). Timestamps are relative to REF; the mock collector rebases them to "now".
Deterministic: running it twice produces byte-identical output.

Usage:  python scripts/generate_mock.py [--out backend/data/mock_ad.json]
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.collectors.adtypes import datetime_to_filetime  # noqa: E402
from app.collectors.base import SNAPSHOT_SCHEMA, normalize_record  # noqa: E402
from app.core.constants import FILETIME_NEVER, UAC, UAC_COMPUTED  # noqa: E402

REF = datetime(2026, 1, 15, 8, 0, tzinfo=UTC)
DOMAIN = "corp.local"
DOMAIN_DN = "DC=corp,DC=local"
DOMAIN_SID = "S-1-5-21-3623811015-3361044348-30300820"

OU_CORP = f"OU=Corp,{DOMAIN_DN}"
OU_USERS = f"OU=Users,{OU_CORP}"
OU_ADMINS = f"OU=Admins,{OU_CORP}"
OU_SVC = f"OU=Service Accounts,{OU_CORP}"
OU_GROUPS = f"OU=Groups,{OU_CORP}"
OU_WS = f"OU=Workstations,{OU_CORP}"
OU_SRV = f"OU=Servers,{OU_CORP}"
OU_DISABLED = f"OU=Disabled,{OU_CORP}"
CN_USERS = f"CN=Users,{DOMAIN_DN}"
CN_BUILTIN = f"CN=Builtin,{DOMAIN_DN}"
OU_DC = f"OU=Domain Controllers,{DOMAIN_DN}"

NORMAL = UAC["NORMAL_ACCOUNT"]
DISABLED = UAC["ACCOUNTDISABLE"]
PNE = UAC["DONT_EXPIRE_PASSWD"]
WORKSTATION = UAC["WORKSTATION_TRUST_ACCOUNT"]
DC_TRUST = UAC["SERVER_TRUST_ACCOUNT"]
UNCONSTRAINED = UAC["TRUSTED_FOR_DELEGATION"]

GLOBAL_SEC = -2147483646
DOMAIN_LOCAL_SEC = -2147483644
BUILTIN_LOCAL_SEC = -2147483643
UNIVERSAL_SEC = -2147483640

USER_CLASSES = ["top", "person", "organizationalPerson", "user"]
COMPUTER_CLASSES = USER_CLASSES + ["computer"]
GMSA_CLASSES = COMPUTER_CLASSES + ["msDS-GroupManagedServiceAccount"]


def ago(days: float = 0, hours: float = 0, minutes: float = 0) -> datetime:
    return REF - timedelta(days=days, hours=hours, minutes=minutes)


def ft(days: float | None) -> int | None:
    return None if days is None else datetime_to_filetime(ago(days))


def iso(days: float = 0, hours: float = 0, minutes: float = 0) -> str:
    return ago(days, hours, minutes).isoformat()


class MockDomain:
    def __init__(self) -> None:
        self.users: list[dict] = []
        self.computers: list[dict] = []
        self.gmsa: list[dict] = []
        self.groups: dict[str, dict] = {}
        self.next_rid = 1103
        self.protected_orphans: set[str] = set()

    def _rid(self) -> int:
        rid = self.next_rid
        self.next_rid += 1
        return rid

    # -- groups ---------------------------------------------------------------------------
    def group(self, name: str, parent: str, rid: int | None = None, builtin: bool = False,
              group_type: int = GLOBAL_SEC, sam: str | None = None) -> dict:
        sid = f"S-1-5-32-{rid}" if builtin else f"{DOMAIN_SID}-{rid or self._rid()}"
        rec = {
            "distinguishedName": f"CN={name},{parent}",
            "objectClass": ["top", "group"],
            "objectSid": sid,
            "sAMAccountName": sam or name,
            "whenCreated": iso(days=2400 if (rid and rid < 1000) else 900),
            "whenChanged": iso(days=30),
            "member": [],
            "memberOf": [],
            "groupType": group_type,
            "adminCount": None,
            "managedBy": None,
            "sIDHistory": [],
        }
        self.groups[name] = rec
        return rec

    def add(self, group: str, *member_dns: str) -> None:
        self.groups[group]["member"].extend(member_dns)

    # -- users ----------------------------------------------------------------------------
    def user(self, sam: str, ou: str, *, cn: str | None = None, display: str | None = None,
             flags: int = 0, logon_days: float | None = 3, pwd_days: float = 45, created_days: float = 700,
             pgid: int = 513, rid: int | None = None, groups: tuple[str, ...] = (), spn: tuple[str, ...] = (),
             manager: str | None = None, workstations: str | None = None, computed: int = 0,
             expires_days: float | None = None, lockout_hours: float | None = None,
             sid_history: tuple[str, ...] = (), admin_count: int | None = None,
             title: str | None = None, department: str | None = None, bad_pwd: int = 0) -> dict:
        dn = f"CN={cn or display or sam},{ou}"
        rec = {
            "distinguishedName": dn,
            "objectClass": list(USER_CLASSES),
            "objectSid": f"{DOMAIN_SID}-{rid or self._rid()}",
            "sAMAccountName": sam,
            "whenCreated": iso(days=created_days),
            "whenChanged": iso(days=min(created_days, 10)),
            "userPrincipalName": f"{sam}@{DOMAIN}",
            "displayName": display or sam,
            "title": title,
            "department": department,
            "userAccountControl": NORMAL | flags,
            "msDS-User-Account-Control-Computed": computed,
            "primaryGroupID": pgid,
            "adminCount": admin_count,
            "lastLogonTimestamp": ft(logon_days),
            "pwdLastSet": ft(pwd_days),
            "accountExpires": FILETIME_NEVER if expires_days is None else ft(expires_days),
            "lockoutTime": 0 if lockout_hours is None else datetime_to_filetime(ago(hours=lockout_hours)),
            "badPwdCount": bad_pwd,
            "logonCount": 0 if logon_days is None else 250,
            "memberOf": [],
            "servicePrincipalName": list(spn),
            "managedBy": None,
            "manager": manager,
            "userWorkstations": workstations,
            "sIDHistory": list(sid_history),
            "msDS-SupportedEncryptionTypes": None,
        }
        self.users.append(rec)
        for g in groups:
            self.add(g, dn)
        return rec

    def computer(self, name: str, ou: str, *, flags: int = WORKSTATION, logon_days: float = 1, pgid: int = 515,
                 os_name: str = "Windows 11 Enterprise", spn: tuple[str, ...] = (), created_days: float = 600,
                 groups: tuple[str, ...] = ()) -> dict:
        fqdn = f"{name.lower()}.{DOMAIN}"
        dn = f"CN={name},{ou}"
        rec = {
            "distinguishedName": dn,
            "objectClass": list(COMPUTER_CLASSES),
            "objectSid": f"{DOMAIN_SID}-{self._rid()}",
            "sAMAccountName": f"{name}$",
            "whenCreated": iso(days=created_days),
            "whenChanged": iso(days=min(logon_days, created_days)),
            "dNSHostName": fqdn,
            "operatingSystem": os_name,
            "operatingSystemVersion": "10.0 (22631)" if "11" in os_name else "10.0 (20348)",
            "userAccountControl": flags,
            "primaryGroupID": pgid,
            "lastLogonTimestamp": ft(logon_days),
            "pwdLastSet": ft(min(logon_days + 12, created_days)),
            "memberOf": [],
            "servicePrincipalName": [f"HOST/{fqdn}", f"HOST/{name}", *spn],
            "managedBy": None,
            "sIDHistory": [],
            "msDS-SupportedEncryptionTypes": 28,
        }
        self.computers.append(rec)
        for g in groups:
            self.add(g, dn)
        return rec


def build() -> dict:
    d = MockDomain()

    # ---- well-known groups (resolved by RID/SID in the analyzers, never by name) ----------
    d.group("Domain Admins", CN_USERS, rid=512)
    d.group("Domain Users", CN_USERS, rid=513)
    d.group("Domain Computers", CN_USERS, rid=515)
    d.group("Domain Controllers", CN_USERS, rid=516)
    d.group("Schema Admins", CN_USERS, rid=518, group_type=UNIVERSAL_SEC)
    d.group("Enterprise Admins", CN_USERS, rid=519, group_type=UNIVERSAL_SEC)
    d.group("Administrators", CN_BUILTIN, rid=544, builtin=True, group_type=BUILTIN_LOCAL_SEC)
    d.group("Account Operators", CN_BUILTIN, rid=548, builtin=True, group_type=BUILTIN_LOCAL_SEC)
    d.group("Server Operators", CN_BUILTIN, rid=549, builtin=True, group_type=BUILTIN_LOCAL_SEC)
    d.group("Backup Operators", CN_BUILTIN, rid=551, builtin=True, group_type=BUILTIN_LOCAL_SEC)
    d.group("DnsAdmins", CN_USERS, rid=1101, group_type=DOMAIN_LOCAL_SEC)
    d.group("DnsUpdateProxy", CN_USERS, rid=1102)
    # Default nesting of a real domain
    d.add("Administrators", d.groups["Domain Admins"]["distinguishedName"], d.groups["Enterprise Admins"]["distinguishedName"])

    # ---- custom groups: the nested-escalation chains ----------------------------------
    for g in ("IT-Support", "Helpdesk-L2", "Deploy-Operators", "Server-Admins", "SQL-Backup-Ops",
              "Finance", "HR", "Sales", "VPN-Users", "All-Staff", "Project-A", "Project-B", "Legacy-Apps"):
        d.group(g, OU_GROUPS)
    gdn = {name: rec["distinguishedName"] for name, rec in d.groups.items()}
    d.add("Helpdesk-L2", gdn["IT-Support"])          # IT-Support  -> Helpdesk-L2
    d.add("Domain Admins", gdn["Helpdesk-L2"])       # Helpdesk-L2 -> Domain Admins   (!)
    d.add("Server-Admins", gdn["Deploy-Operators"])  # Deploy-Operators -> Server-Admins
    d.add("Administrators", gdn["Server-Admins"])    # Server-Admins -> BUILTIN\Administrators (!)
    d.add("Backup Operators", gdn["SQL-Backup-Ops"])  # SQL-Backup-Ops -> Backup Operators
    d.add("Project-A", gdn["Project-B"])             # harmless nesting cycle A <-> B
    d.add("Project-B", gdn["Project-A"])
    d.add("All-Staff", gdn["Finance"], gdn["HR"], gdn["Sales"])

    # ---- built-in accounts -------------------------------------------------------------
    d.user("Administrator", CN_USERS, rid=500, flags=PNE, logon_days=2, pwd_days=812, created_days=2400,
           groups=("Domain Admins", "Enterprise Admins", "Schema Admins", "Administrators"), display="Administrator")
    d.user("Guest", CN_USERS, rid=501, flags=DISABLED | UAC["PASSWD_NOTREQD"] | PNE, logon_days=None,
           pwd_days=2400, created_days=2400)
    d.user("krbtgt", CN_USERS, rid=502, flags=DISABLED, logon_days=None, pwd_days=903, created_days=2400,
           spn=("kadmin/changepw",), admin_count=1)

    # ---- Tier-0 admins -------------------------------------------------------------------
    d.user("adm.sokolov", OU_ADMINS, display="Adm Sokolov (Tier-0)", logon_days=1, pwd_days=80,
           groups=("Domain Admins", "Enterprise Admins", "Schema Admins"), title="Head of Infrastructure")
    d.user("adm.zhukov", OU_ADMINS, display="Adm Zhukov (Tier-0)", logon_days=4, pwd_days=35,
           groups=("Domain Admins",), title="AD Engineer")
    d.user("adm.old_it", OU_ADMINS, display="Adm Old IT", logon_days=241, pwd_days=611,
           groups=("Domain Admins",), title="(former) Sysadmin")
    d.user("adm.dns", OU_ADMINS, display="Adm DNS", logon_days=6, pwd_days=40, groups=("DnsAdmins",))
    # 3 disabled but still privileged
    d.user("adm.kairat", OU_ADMINS, display="Adm Kairat", flags=DISABLED, logon_days=180, pwd_days=400,
           groups=("Domain Admins",))
    d.user("adm.vendor", OU_ADMINS, display="Adm Vendor", flags=DISABLED, logon_days=300, pwd_days=500,
           groups=("Enterprise Admins",))
    d.user("adm.temp", OU_ADMINS, display="Adm Temp", flags=DISABLED, logon_days=120, pwd_days=160,
           groups=("Account Operators",))

    # ---- the two excessive-rights users (nested escalation) ------------------------------
    d.user("ivanov", OU_USERS, display="Ivan Ivanov", flags=PNE, logon_days=1, pwd_days=120,
           groups=("IT-Support", "VPN-Users"), title="IT Support Engineer", department="IT")
    d.user("s.kuznetsova", OU_USERS, display="Svetlana Kuznetsova", logon_days=2, pwd_days=60,
           groups=("Deploy-Operators",), title="DevOps Engineer", department="IT")

    # ---- hidden Domain Admin: primaryGroupID=512, NOT in the member attribute -------------
    d.user("m.petrov", OU_USERS, display="Maksim Petrov", pgid=512, logon_days=3, pwd_days=90,
           groups=("Domain Users", "Sales"), title="Sales Manager", department="Sales")

    # ---- password / auth issues ---------------------------------------------------------
    d.user("a.nurlanov", OU_USERS, display="Aidar Nurlanov", flags=UAC["DONT_REQ_PREAUTH"], logon_days=2,
           pwd_days=150, groups=("Finance",), department="Finance")
    d.user("temp.contractor", OU_USERS, display="Temp Contractor", flags=UAC["PASSWD_NOTREQD"], logon_days=9,
           pwd_days=30, groups=("VPN-Users",))
    d.user("b.omarova", OU_USERS, display="Bota Omarova", flags=UAC["ENCRYPTED_TEXT_PWD_ALLOWED"], logon_days=5,
           pwd_days=70, groups=("Finance", "Legacy-Apps"), department="Finance")
    d.user("d.omarov", OU_USERS, display="Daniyar Omarov", logon_days=1, pwd_days=50,
           computed=UAC_COMPUTED["LOCKOUT"], lockout_hours=2, bad_pwd=22, groups=("Sales",), department="Sales")
    d.user("contractor.ext01", OU_USERS, display="External Contractor 01", logon_days=33, pwd_days=100,
           expires_days=30, groups=("VPN-Users",))
    d.user("b.smagulov", OU_USERS, display="Berik Smagulov", logon_days=58, pwd_days=61,
           computed=UAC_COMPUTED["PASSWORD_EXPIRED"], groups=("HR",), department="HR")
    d.user("former.admin", OU_USERS, display="Former Admin", logon_days=7, pwd_days=200, admin_count=1,
           title="Network Engineer", department="IT")
    d.user("migrated.user", OU_USERS, display="Migrated User", logon_days=4, pwd_days=33,
           sid_history=("S-1-5-21-1004336348-1177238915-682003330-1109",), department="Finance")
    d.user("reception", OU_USERS, display="Reception Desk", flags=PNE, logon_days=0.5, pwd_days=300)
    d.user("h.sultanov", OU_USERS, display="Kh. Sultanov", logon_days=3, pwd_days=520, groups=("Sales",))
    d.user("i.tokayeva", OU_USERS, display="I. Tokayeva", logon_days=6, pwd_days=388, groups=("HR",))

    # ---- 10 inactive enabled users (lastLogonTimestamp older than 90 days / never) --------
    inactive = [
        ("i.alimov", "Ilyas Alimov", 402, 420, 0),
        ("j.baranova", "Yulia Baranova", 181, 200, 0),
        ("k.dzhaksybekov", "Kanat Dzhaksybekov", 121, 140, PNE),
        ("l.egorov", "Leonid Egorov", 131, 90, 0),
        ("m.fedorova", "Maria Fedorova", 250, 260, 0),
        ("n.gaziz", "Nurlan Gaziz", 366, 380, PNE),
        ("o.khan", "Oleg Khan", 200, 60, 0),
        ("p.lebedev", "Pavel Lebedev", 150, 170, 0),
        ("q.mamyrov", "Kuat Mamyrov", None, 300, 0),     # never logged on, created 300d ago
        ("r.nikitina", "Rita Nikitina", None, 150, 0),   # never logged on, created 150d ago
    ]
    for sam, name, logon, pwd, flags in inactive:
        created = 1000 if logon is not None else pwd
        d.user(sam, OU_USERS, display=name, flags=flags, logon_days=logon, pwd_days=pwd, created_days=created,
               groups=("All-Staff",))

    # ---- disabled leavers (stale but disabled -> not counted as inactive) ------------------
    for sam, name in [("s.orazov", "Serik Orazov"), ("t.popova", "Tatiana Popova"), ("u.rakhimov", "Ulan Rakhimov")]:
        d.user(sam, OU_DISABLED, display=name, flags=DISABLED, logon_days=420, pwd_days=500)

    # ---- healthy active users --------------------------------------------------------------
    healthy = [
        ("a.abenov", "Arman Abenov", "Finance"), ("b.akhmetova", "Bayan Akhmetova", "HR"),
        ("d.bekov", "Dias Bekov", "Sales"), ("g.zhunusova", "Gulnara Zhunusova", "Finance"),
        ("k.ismailov", "Kairat Ismailov", "Sales"), ("l.kim", "Lyudmila Kim", "HR"),
        ("m.nurpeisova", "Madina Nurpeisova", "Finance"), ("n.orlov", "Nikita Orlov", "Sales"),
        ("o.sadykova", "Olga Sadykova", "HR"), ("r.tulegenov", "Ruslan Tulegenov", "Finance"),
        ("t.utegenova", "Tomiris Utegenova", "Sales"), ("v.pak", "Viktor Pak", "Finance"),
        ("y.li", "Yana Li", "HR"), ("z.mukanov", "Zhandos Mukanov", "Sales"),
        ("e.serikbayeva", "Elmira Serikbayeva", "Finance"), ("p.volkova", "Polina Volkova", "Sales"),
    ]
    for i, (sam, name, dept) in enumerate(healthy):
        d.user(sam, OU_USERS, display=name, logon_days=(i % 9) + 0.3, pwd_days=20 + (i * 7) % 90,
               groups=(dept, "VPN-Users") if i % 3 == 0 else (dept,), department=dept,
               title="Specialist" if i % 2 else "Senior Specialist")
    d.add("Project-A", d.users[-1]["distinguishedName"])

    # ---- service accounts (OU=Service Accounts + svc_/sa_/srv_ prefixes + SPNs) -------------
    # ServiceAccount01: PNE(0.30) + pwd 730d(0.35) + elevated rights(0.50) + no owner(0.10)
    #                   + interactive logon(0.25), k=1.0  ->  1-(.70*.65*.50*.90*.75) = 0.8465 -> 85
    d.user("ServiceAccount01", OU_SVC, display="ServiceAccount01", flags=PNE, logon_days=1, pwd_days=730,
           created_days=1500, groups=("SQL-Backup-Ops",))
    owner = f"CN=Adm Zhukov (Tier-0),{OU_ADMINS}"
    d.user("svc_sql", OU_SVC, flags=PNE, logon_days=0.2, pwd_days=400, created_days=1300, manager=owner,
           workstations="SQL01", spn=("MSSQLSvc/sql01.corp.local:1433", "MSSQLSvc/sql01.corp.local"))
    d.user("svc_backup", OU_SVC, flags=PNE, logon_days=0.5, pwd_days=200, created_days=1100, manager=owner)
    d.user("svc_web", OU_SVC, flags=PNE, logon_days=0.1, pwd_days=150, created_days=900, manager=owner,
           workstations="WEB01", spn=("HTTP/intranet.corp.local",))
    d.user("sa_monitoring", OU_SVC, flags=PNE, logon_days=200, pwd_days=210, created_days=1200)
    d.user("srv_scan", OU_SVC, flags=PNE, logon_days=2, pwd_days=900, created_days=1600, manager=owner,
           workstations="SCAN01", spn=("HTTP/scan01.corp.local",))
    d.user("svc_app", OU_SVC, flags=PNE, logon_days=0.3, pwd_days=100, created_days=500, manager=owner,
           workstations="APP-SRV02")
    d.user("svc_deploy", OU_SVC, logon_days=0.4, pwd_days=60, created_days=400, manager=owner,
           workstations="APP-SRV02", spn=("HTTP/deploy.corp.local",))
    d.user("svc_old_ftp", OU_SVC, flags=DISABLED | PNE, logon_days=700, pwd_days=1400, created_days=2000)

    # ---- gMSA (healthy, auto-rotated) ----------------------------------------------------
    d.gmsa.append({
        "distinguishedName": f"CN=gmsa_iis,CN=Managed Service Accounts,{DOMAIN_DN}",
        "objectClass": list(GMSA_CLASSES), "objectSid": f"{DOMAIN_SID}-{d._rid()}",
        "sAMAccountName": "gmsa_iis$", "whenCreated": iso(days=300), "whenChanged": iso(days=5),
        "dNSHostName": "gmsa_iis.corp.local", "userAccountControl": WORKSTATION, "primaryGroupID": 515,
        "lastLogonTimestamp": ft(0.2), "pwdLastSet": ft(12), "memberOf": [],
        "servicePrincipalName": ["HTTP/portal.corp.local"], "managedBy": None, "msDS-ManagedPasswordInterval": 30,
    })

    # ---- computers --------------------------------------------------------------------------
    d.computer("DC01", OU_DC, flags=DC_TRUST | UNCONSTRAINED, pgid=516, os_name="Windows Server 2022 Standard",
               spn=("ldap/dc01.corp.local", "GC/dc01.corp.local/corp.local"), created_days=2400)
    for i in range(1, 15):
        d.computer(f"WS-{i:03d}", OU_WS, logon_days=(i % 7) + 0.5, created_days=300 + i * 11)
    d.computer("WS-017", OU_WS, logon_days=0.4)
    d.computer("WS-OLD-01", OU_WS, logon_days=151, created_days=1400)
    d.computer("WS-OLD-02", OU_WS, logon_days=222, created_days=1500)
    d.computer("LAPTOP-OLD-07", OU_WS, logon_days=403, created_days=1600, os_name="Windows 10 Pro")
    for name in ("SQL01", "FILE01", "SCAN01"):
        d.computer(name, OU_SRV, os_name="Windows Server 2019 Standard", logon_days=1)
    d.computer("WEB01", OU_SRV, os_name="Windows Server 2019 Standard", spn=("HTTP/intranet.corp.local",))
    d.computer("APP-SRV02", OU_SRV, flags=WORKSTATION | UNCONSTRAINED, os_name="Windows Server 2016 Standard")

    # ---- derived attributes: memberOf back-links, Domain Controllers/Computers membership -------
    by_dn = {r["distinguishedName"].lower(): r for r in d.users + d.computers + d.gmsa + list(d.groups.values())}
    for g in d.groups.values():
        for m in g["member"]:
            target = by_dn.get(m.lower())
            if target is not None:
                target["memberOf"].append(g["distinguishedName"])

    # adminCount=1 on everything reachable (via member) from protected groups — like SDProp
    protected = {d.groups[n]["distinguishedName"].lower() for n in (
        "Domain Admins", "Enterprise Admins", "Schema Admins", "Administrators",
        "Account Operators", "Server Operators", "Backup Operators")}
    stack = list(protected)
    seen: set[str] = set()
    while stack:
        g = stack.pop()
        if g in seen:
            continue
        seen.add(g)
        grp = by_dn[g]
        grp["adminCount"] = 1
        for m in grp["member"]:
            t = by_dn.get(m.lower())
            if t is None:
                continue
            if "group" in t["objectClass"]:
                stack.append(m.lower())
            else:
                t["adminCount"] = 1

    # ---- LDAP_IN_CHAIN results for critical groups (transitive `member`; no primaryGroupID!) ----
    in_chain: dict[str, list[str]] = {}
    for name in ("Domain Admins", "Schema Admins", "Enterprise Admins", "Administrators",
                 "Account Operators", "Server Operators", "Backup Operators", "DnsAdmins"):
        grp = d.groups[name]
        found: list[str] = []
        todo = list(grp["member"])
        visited: set[str] = set()
        while todo:
            m = todo.pop(0)
            if m.lower() in visited:
                continue
            visited.add(m.lower())
            found.append(m)
            t = by_dn.get(m.lower())
            if t is not None and "group" in t["objectClass"]:
                todo.extend(t["member"])
        in_chain[grp["objectSid"]] = sorted(found)

    # ---- domain root & fine-grained password policies -------------------------------------
    domain = {
        "distinguishedName": DOMAIN_DN, "objectSid": DOMAIN_SID, "name": "corp",
        "minPwdLength": 7, "maxPwdAge": -36288000000000, "minPwdAge": -864000000000,
        "lockoutThreshold": 0, "lockoutDuration": -18000000000, "lockOutObservationWindow": -18000000000,
        "pwdProperties": 1, "pwdHistoryLength": 24, "msDS-Behavior-Version": 7,
    }
    pso_parent = f"CN=Password Settings Container,CN=System,{DOMAIN_DN}"
    psos = [
        {"distinguishedName": f"CN=PSO-Tier0-Admins,{pso_parent}", "name": "PSO-Tier0-Admins",
         "msDS-PasswordSettingsPrecedence": 10, "msDS-MinimumPasswordLength": 16,
         "msDS-PasswordComplexityEnabled": True, "msDS-PasswordReversibleEncryptionEnabled": False,
         "msDS-LockoutThreshold": 5, "msDS-MaximumPasswordAge": -155520000000000,
         "msDS-PSOAppliesTo": [d.groups["Domain Admins"]["distinguishedName"]]},
        {"distinguishedName": f"CN=PSO-Legacy-Apps,{pso_parent}", "name": "PSO-Legacy-Apps",
         "msDS-PasswordSettingsPrecedence": 50, "msDS-MinimumPasswordLength": 6,
         "msDS-PasswordComplexityEnabled": False, "msDS-PasswordReversibleEncryptionEnabled": False,
         "msDS-LockoutThreshold": 10, "msDS-MaximumPasswordAge": 0,
         "msDS-PSOAppliesTo": [d.groups["Legacy-Apps"]["distinguishedName"]]},
    ]

    # ---- Security-log excerpt (last 24h): spray, brute force, interactive service logon -------
    events: list[dict] = []

    def ev(event_id: int, when: datetime, user: str, ip: str, ws: str | None = None,
           logon_type: int | None = None, status: str | None = None) -> None:
        events.append({"event_id": event_id, "time": when.isoformat(), "target_user": user,
                       "target_domain": "CORP", "source_ip": ip, "workstation": ws,
                       "logon_type": logon_type, "status": status})

    spray_targets = ["a.abenov", "b.akhmetova", "d.bekov", "g.zhunusova", "k.ismailov", "l.kim", "m.nurpeisova",
                     "n.orlov", "o.sadykova", "r.tulegenov", "t.utegenova", "v.pak", "y.li", "z.mukanov"]
    t0 = ago(hours=3, minutes=40)
    for i, target in enumerate(spray_targets):  # 14 accounts, 1-2 tries each, within ~15 minutes
        ev(4771, t0 + timedelta(seconds=63 * i), target, "10.0.13.77", "WS-GUEST-44", status="0x18")
        if i % 5 == 0:
            ev(4771, t0 + timedelta(seconds=63 * i + 20), target, "10.0.13.77", "WS-GUEST-44", status="0x18")
    t1 = ago(hours=2, minutes=12)
    for i in range(22):  # brute force against d.omarov, then lockout
        ev(4625, t1 + timedelta(seconds=24 * i), "d.omarov", "10.0.8.19", "KIOSK-03", 3, "0xC000006A")
    ev(4740, t1 + timedelta(seconds=24 * 22), "d.omarov", "10.0.8.19", "KIOSK-03")
    ev(4624, ago(hours=20), "svc_backup", "10.0.5.40", "WS-017", 10)  # service account RDP logon
    for i, (sam, _, _) in enumerate(healthy[:12]):  # normal noise
        ev(4624, ago(hours=1 + i * 1.7), sam, f"10.0.4.{20 + i}", f"WS-{i + 1:03d}", 2 if i % 3 == 0 else 3)
    for i, sam in enumerate(["l.kim", "n.orlov", "y.li"]):  # isolated typos
        ev(4625, ago(hours=5 + i * 3), sam, f"10.0.4.{40 + i}", f"WS-{i + 4:03d}", 2, "0xC000006A")
    events.sort(key=lambda e: e["time"])

    snapshot = {
        "schema": SNAPSHOT_SCHEMA,
        "source": "mock",
        "collected_at": REF.isoformat(),
        "collector": {"name": "mock", "bind_user": "CORP\\svc_ira_reader (mock)", "read_only": True, "warnings": []},
        "domain": normalize_record("domain", domain),
        "users": [normalize_record("users", u) for u in d.users],
        "computers": [normalize_record("computers", c) for c in d.computers],
        "gmsa": [normalize_record("gmsa", g) for g in d.gmsa],
        "groups": [normalize_record("groups", g) for g in d.groups.values()],
        "psos": [normalize_record("psos", p) for p in psos],
        "in_chain": in_chain,
        "auth_events": {"status": "ok", "source": "mock Security log (DC01, last 24h)",
                        "detail": f"{len(events)} events", "window_hours": 24, "events": events},
    }
    return snapshot


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", default=str(ROOT / "backend" / "data" / "mock_ad.json"))
    args = ap.parse_args()
    snap = build()
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(snap, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {out} — users={len(snap['users'])} computers={len(snap['computers'])} "
          f"groups={len(snap['groups'])} gmsa={len(snap['gmsa'])} psos={len(snap['psos'])} "
          f"events={len(snap['auth_events']['events'])}")


if __name__ == "__main__":
    main()

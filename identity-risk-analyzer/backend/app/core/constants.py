"""All AD magic numbers live here. Groups are resolved by SID/RID, never by (localized) name."""
from __future__ import annotations

# --- userAccountControl bit flags -------------------------------------------------
UAC = {
    "ACCOUNTDISABLE": 0x0002,
    "PASSWD_NOTREQD": 0x0020,
    "ENCRYPTED_TEXT_PWD_ALLOWED": 0x0080,  # reversible encryption
    "NORMAL_ACCOUNT": 0x0200,
    "WORKSTATION_TRUST_ACCOUNT": 0x1000,
    "SERVER_TRUST_ACCOUNT": 0x2000,  # domain controller
    "DONT_EXPIRE_PASSWD": 0x10000,  # Password Never Expires
    "TRUSTED_FOR_DELEGATION": 0x80000,  # unconstrained delegation
    "DONT_REQ_PREAUTH": 0x400000,  # AS-REP roasting
}

# msDS-User-Account-Control-Computed (constructed attribute)
UAC_COMPUTED = {"LOCKOUT": 0x0010, "PASSWORD_EXPIRED": 0x800000}

# --- LDAP bitwise / chain matching-rule OIDs ---------------------------------------
LDAP_BIT_AND = "1.2.840.113556.1.4.803"
LDAP_BIT_OR = "1.2.840.113556.1.4.804"
LDAP_IN_CHAIN = "1.2.840.113556.1.4.1941"  # transitive (nested) membership

# --- Well-known RIDs (append to domain SID; Builtin groups use S-1-5-32-<rid>) ------
CRITICAL_RIDS = {
    512: "Domain Admins",
    518: "Schema Admins",
    519: "Enterprise Admins",
    544: "Administrators",
    548: "Account Operators",
    549: "Server Operators",
    551: "Backup Operators",
    502: "krbtgt",
}
BUILTIN_RIDS = {544, 548, 549, 551}  # live under S-1-5-32
RID_ADMINISTRATOR = 500
RID_GUEST = 501
RID_KRBTGT = 502
RID_DOMAIN_ADMINS = 512
RID_DOMAIN_USERS = 513
RID_DOMAIN_COMPUTERS = 515
RID_DOMAIN_CONTROLLERS = 516
RID_ADMINISTRATORS = 544

# Critical *groups* (krbtgt is a user and is handled by the extra analyzer).
CRITICAL_GROUP_RIDS = {rid: name for rid, name in CRITICAL_RIDS.items() if rid != RID_KRBTGT}
# Tier-0 groups: membership makes the object Tier-0 -> criticality multiplier k.
TIER0_GROUP_RIDS = {512, 518, 519, 544}
# Operator groups: elevated rights, flagged as privileged, but not k-amplified.
# DnsAdmins has no fixed RID -> resolved by sAMAccountName.
DNSADMINS_SAM = "DnsAdmins"
# Preference order when choosing the "most critical" escalation target to show.
CRITICAL_PREFERENCE = [512, 519, 518, 544, 548, 549, 551, -1]  # -1 = DnsAdmins

# --- Security event IDs (Security log on DCs) --------------------------------------
EVENTS = {
    "FAILED_LOGON": 4625,
    "KERB_PREAUTH_FAIL": 4771,
    "NTLM_VALIDATE": 4776,
    "LOCKOUT": 4740,
    "SUCCESS_LOGON": 4624,
}
LOGON_TYPE_INTERACTIVE = 2
LOGON_TYPE_REMOTE_INTERACTIVE = 10
INTERACTIVE_LOGON_TYPES = {LOGON_TYPE_INTERACTIVE, LOGON_TYPE_REMOTE_INTERACTIVE}

# --- Domain password policy -------------------------------------------------------
PWD_PROPERTIES = {"COMPLEXITY": 0x1, "STORE_CLEARTEXT": 0x10}

# --- Time -------------------------------------------------------------------------
FILETIME_NEVER = 0x7FFFFFFFFFFFFFFF
FILETIME_EPOCH_DIFF_SECONDS = 11644473600  # 1601-01-01 -> 1970-01-01
FILETIME_TICKS_PER_SECOND = 10_000_000

# --- Attribute hygiene (HARD SECURITY RULE) ----------------------------------------
# Secrets that must never be requested, stored, logged or displayed. The collector
# uses an explicit allow-list; this deny-list is defence in depth for snapshots.
FORBIDDEN_ATTRIBUTES = frozenset(
    a.lower()
    for a in (
        "unicodePwd",
        "userPassword",
        "dBCSPwd",
        "ntPwdHistory",
        "lmPwdHistory",
        "supplementalCredentials",
        "unixUserPassword",
        "msDS-ManagedPassword",
        "ms-Mcs-AdmPwd",
        "msLAPS-Password",
        "msLAPS-EncryptedPassword",
        "msLAPS-EncryptedPasswordHistory",
        "msLAPS-EncryptedDSRMPassword",
        "msDS-KeyCredentialLink",
        "msFVE-RecoveryPassword",
        "trustAuthIncoming",
        "trustAuthOutgoing",
        "initialAuthIncoming",
        "initialAuthOutgoing",
        "currentValue",
        "priorValue",
        "description",  # admins often paste passwords into descriptions -> never collected
    )
)

CATEGORIES = ["Stale", "Privileged", "Passwords", "Service", "Config"]
CATEGORY_PENALTY_CAP = 20

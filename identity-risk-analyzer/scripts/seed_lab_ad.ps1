<#
.SYNOPSIS
  Builds a LAB Active Directory that mirrors the offline demo dataset (backend/data/mock_ad.json),
  so the Identity Risk Analyzer demo shows the same findings live.

.DESCRIPTION
  Creates OUs, groups (with the nested-escalation chains), users, service accounts and computers with the
  same risky configuration as the mock domain:
    * 10 inactive users*, 7 service accounts with Password Never Expires, 3 disabled privileged accounts,
      2 users with excessive rights via nested groups (ivanov -> IT-Support -> Helpdesk-L2 -> Domain Admins),
      ServiceAccount01 (PNE, no owner, interactive logon allowed, elevated rights via Backup Operators),
      a hidden Domain Admin via primaryGroupID=512, an AS-REP roastable user, lockoutThreshold=0, ...

  !!! THIS SCRIPT WRITES TO ACTIVE DIRECTORY AND WEAKENS THE DOMAIN PASSWORD POLICY. LAB ONLY. !!!
  (The analyzer itself is strictly read-only; only this seeding script writes.)

  * TIMESTAMPS: lastLogonTimestamp and pwdLastSet cannot be back-dated through LDAP (pwdLastSet accepts only
    0 or -1). To make freshly created objects look "730 days old" either:
      a) run the analyzer with ANALYSIS_DATE set in the future (e.g. ANALYSIS_DATE=2028-09-24T00:00:00Z) and
         accept that every object then looks old, or tune the thresholds in Settings; or
      b) SINGLE LAB DC ONLY: snapshot the VM, move the DC clock back, create the objects, then restore the
         clock (w32tm /resync). Never do this on a DC with replication partners.
  sIDHistory cannot be written without migration tooling (DsAddSidHistory) and is not reproduced here.

.PARAMETER IAcknowledgeLabOnly
  Mandatory switch - confirms you are running against a disposable lab domain.

.EXAMPLE
  # On a Windows Server 2019+ lab DC (RSAT ActiveDirectory module), as a Domain Admin of the LAB:
  .\seed_lab_ad.ps1 -IAcknowledgeLabOnly
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory = $true)][switch]$IAcknowledgeLabOnly,
    [int]$MaxExistingUsers = 300
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module ActiveDirectory

$domain    = Get-ADDomain
$domainDN  = $domain.DistinguishedName
$domainSid = $domain.DomainSID.Value
$dnsRoot   = $domain.DNSRoot

# ---- safety: refuse anything that looks like a production directory ----------------------------------------
$existing = (Get-ADUser -Filter * -ResultSetSize ($MaxExistingUsers + 1) | Measure-Object).Count
if ($existing -gt $MaxExistingUsers) {
    throw "Domain $dnsRoot already has more than $MaxExistingUsers users - this does not look like a lab. Aborting."
}
if (-not $PSCmdlet.ShouldProcess($dnsRoot, 'Seed LAB objects and weaken the default password policy')) { return }

function New-RandomPassword {
    # Random per-account password; never printed or stored anywhere.
    $chars = [char[]]'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#%*+-=?@'
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $pwd = -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
    return (ConvertTo-SecureString -String ($pwd + 'Aa1!') -AsPlainText -Force)
}

function Ensure-OU([string]$Name, [string]$Path) {
    $dn = "OU=$Name,$Path"
    if (-not (Get-ADOrganizationalUnit -Filter "DistinguishedName -eq '$dn'" -ErrorAction SilentlyContinue)) {
        New-ADOrganizationalUnit -Name $Name -Path $Path -ProtectedFromAccidentalDeletion $false | Out-Null
    }
    return $dn
}

function Ensure-Group([string]$Name, [string]$Path, [string]$Scope = 'Global') {
    $g = Get-ADGroup -Filter "SamAccountName -eq '$Name'" -ErrorAction SilentlyContinue
    if (-not $g) { $g = New-ADGroup -Name $Name -SamAccountName $Name -GroupScope $Scope -GroupCategory Security -Path $Path -PassThru }
    return $g
}

function Ensure-User {
    param([string]$Sam, [string]$Path, [string]$Display = $Sam, [bool]$Enabled = $true, [bool]$Pne = $false,
          [string[]]$Groups = @(), [string[]]$Spn = @(), [string]$Workstations, [string]$Manager,
          [bool]$NoPreauth = $false, [bool]$NotRequired = $false, [bool]$Reversible = $false,
          [Nullable[datetime]]$Expires = $null, [string]$Title, [string]$Department)
    $u = Get-ADUser -Filter "SamAccountName -eq '$Sam'" -ErrorAction SilentlyContinue
    if (-not $u) {
        $newUser = @{
            Name = $Display; SamAccountName = $Sam; UserPrincipalName = "$Sam@$dnsRoot"; DisplayName = $Display
            Path = $Path; AccountPassword = (New-RandomPassword); Enabled = $true; PasswordNeverExpires = $Pne
            ChangePasswordAtLogon = $false
        }
        if ($Title) { $newUser.Title = $Title }
        if ($Department) { $newUser.Department = $Department }
        $u = New-ADUser @newUser -PassThru
    }
    if ($Spn.Count -gt 0) { Set-ADUser $u -ServicePrincipalNames @{ Add = $Spn } }
    if ($Workstations) { Set-ADUser $u -LogonWorkstations $Workstations }
    if ($Manager) { Set-ADUser $u -Manager $Manager }
    if ($Expires) { Set-ADAccountExpiration $u -DateTime $Expires }
    Set-ADAccountControl $u -DoesNotRequirePreAuth $NoPreauth -PasswordNotRequired $NotRequired `
        -AllowReversiblePasswordEncryption $Reversible -PasswordNeverExpires $Pne
    foreach ($g in $Groups) { Add-ADGroupMember -Identity $g -Members $u -ErrorAction SilentlyContinue }
    if (-not $Enabled) { Disable-ADAccount $u }
    return $u
}

Write-Host "Seeding LAB domain $dnsRoot ..." -ForegroundColor Cyan

# ---- OUs --------------------------------------------------------------------------------------------------
$ouCorp   = Ensure-OU 'Corp' $domainDN
$ouUsers  = Ensure-OU 'Users' $ouCorp
$ouAdmins = Ensure-OU 'Admins' $ouCorp
$ouSvc    = Ensure-OU 'Service Accounts' $ouCorp
$ouGroups = Ensure-OU 'Groups' $ouCorp
$ouWs     = Ensure-OU 'Workstations' $ouCorp
$ouSrv    = Ensure-OU 'Servers' $ouCorp
$ouDis    = Ensure-OU 'Disabled' $ouCorp

# ---- well-known groups BY SID (locale-proof: works on a Russian-locale DC too) ----------------------------
$DA   = Get-ADGroup -Identity "$domainSid-512"
$DU   = Get-ADGroup -Identity "$domainSid-513"
$SA   = Get-ADGroup -Identity "$domainSid-518"
$EA   = Get-ADGroup -Identity "$domainSid-519"
$ADM  = Get-ADGroup -Identity 'S-1-5-32-544'
$AO   = Get-ADGroup -Identity 'S-1-5-32-548'
$BO   = Get-ADGroup -Identity 'S-1-5-32-551'
$DNSA = Get-ADGroup -Filter "SamAccountName -eq 'DnsAdmins'" -ErrorAction SilentlyContinue

# ---- custom groups and the nested-escalation chains -----------------------------------------------------------
$names = 'IT-Support', 'Helpdesk-L2', 'Deploy-Operators', 'Server-Admins', 'SQL-Backup-Ops', 'Finance', 'HR', 'Sales',
         'VPN-Users', 'All-Staff', 'Project-A', 'Project-B', 'Legacy-Apps'
$G = @{}
foreach ($n in $names) { $G[$n] = Ensure-Group $n $ouGroups }
Add-ADGroupMember $G['Helpdesk-L2'] -Members $G['IT-Support'] -ErrorAction SilentlyContinue      # IT-Support  -> Helpdesk-L2
Add-ADGroupMember $DA -Members $G['Helpdesk-L2'] -ErrorAction SilentlyContinue                    # Helpdesk-L2 -> Domain Admins (!)
Add-ADGroupMember $G['Server-Admins'] -Members $G['Deploy-Operators'] -ErrorAction SilentlyContinue
Add-ADGroupMember $ADM -Members $G['Server-Admins'] -ErrorAction SilentlyContinue                 # -> BUILTIN\Administrators (!)
Add-ADGroupMember $BO -Members $G['SQL-Backup-Ops'] -ErrorAction SilentlyContinue                # -> Backup Operators
Add-ADGroupMember $G['Project-A'] -Members $G['Project-B'] -ErrorAction SilentlyContinue          # harmless cycle
Add-ADGroupMember $G['Project-B'] -Members $G['Project-A'] -ErrorAction SilentlyContinue
Add-ADGroupMember $G['All-Staff'] -Members $G['Finance'], $G['HR'], $G['Sales'] -ErrorAction SilentlyContinue

# ---- Tier-0 admins ----------------------------------------------------------------------------------------------
$zhukov = Ensure-User -Sam 'adm.zhukov' -Path $ouAdmins -Display 'Adm Zhukov (Tier-0)' -Groups @($DA) -Title 'AD Engineer'
Ensure-User -Sam 'adm.sokolov' -Path $ouAdmins -Display 'Adm Sokolov (Tier-0)' -Groups @($DA, $EA, $SA) | Out-Null
Ensure-User -Sam 'adm.old_it' -Path $ouAdmins -Display 'Adm Old IT' -Groups @($DA) | Out-Null        # keep unused -> inactive admin
if ($DNSA) { Ensure-User -Sam 'adm.dns' -Path $ouAdmins -Display 'Adm DNS' -Groups @($DNSA) | Out-Null }
# 3 disabled but still privileged
Ensure-User -Sam 'adm.kairat' -Path $ouAdmins -Display 'Adm Kairat' -Groups @($DA) -Enabled $false | Out-Null
Ensure-User -Sam 'adm.vendor' -Path $ouAdmins -Display 'Adm Vendor' -Groups @($EA) -Enabled $false | Out-Null
Ensure-User -Sam 'adm.temp' -Path $ouAdmins -Display 'Adm Temp' -Groups @($AO) -Enabled $false | Out-Null

# ---- excessive rights via nesting ----------------------------------------------------------------------------
Ensure-User -Sam 'ivanov' -Path $ouUsers -Display 'Ivan Ivanov' -Pne $true -Groups @($G['IT-Support'], $G['VPN-Users']) -Title 'IT Support Engineer' -Department 'IT' | Out-Null
Ensure-User -Sam 's.kuznetsova' -Path $ouUsers -Display 'Svetlana Kuznetsova' -Groups @($G['Deploy-Operators']) -Title 'DevOps Engineer' -Department 'IT' | Out-Null

# ---- hidden Domain Admin via primaryGroupID=512 --------------------------------------------------------------
$petrov = Ensure-User -Sam 'm.petrov' -Path $ouUsers -Display 'Maksim Petrov' -Groups @($G['Sales']) -Department 'Sales'
Add-ADGroupMember $DA -Members $petrov -ErrorAction SilentlyContinue          # must be a member before it can be primary
Set-ADUser $petrov -Replace @{ primaryGroupID = 512 }                          # AD drops the explicit DA member link
Add-ADGroupMember $DU -Members $petrov -ErrorAction SilentlyContinue          # keep Domain Users as explicit membership

# ---- password / auth issues -----------------------------------------------------------------------------------
Ensure-User -Sam 'a.nurlanov' -Path $ouUsers -Display 'Aidar Nurlanov' -NoPreauth $true -Groups @($G['Finance']) | Out-Null
Ensure-User -Sam 'temp.contractor' -Path $ouUsers -Display 'Temp Contractor' -NotRequired $true -Groups @($G['VPN-Users']) | Out-Null
Ensure-User -Sam 'b.omarova' -Path $ouUsers -Display 'Bota Omarova' -Reversible $true -Groups @($G['Finance'], $G['Legacy-Apps']) | Out-Null
Ensure-User -Sam 'd.omarov' -Path $ouUsers -Display 'Daniyar Omarov' -Groups @($G['Sales']) | Out-Null
Ensure-User -Sam 'contractor.ext01' -Path $ouUsers -Display 'External Contractor 01' -Expires ((Get-Date).AddDays(-30)) | Out-Null
Ensure-User -Sam 'reception' -Path $ouUsers -Display 'Reception Desk' -Pne $true | Out-Null
$former = Ensure-User -Sam 'former.admin' -Path $ouUsers -Display 'Former Admin'
Set-ADUser $former -Replace @{ adminCount = 1 }                               # orphaned AdminSDHolder marker

# ---- 10 inactive users (never log on with them; see TIMESTAMPS note above) -------------------------------------
foreach ($s in 'i.alimov', 'j.baranova', 'k.dzhaksybekov', 'l.egorov', 'm.fedorova', 'n.gaziz', 'o.khan', 'p.lebedev', 'q.mamyrov', 'r.nikitina') {
    $pne = $s -in @('k.dzhaksybekov', 'n.gaziz')
    Ensure-User -Sam $s -Path $ouUsers -Pne $pne -Groups @($G['All-Staff']) | Out-Null
}
foreach ($s in 's.orazov', 't.popova', 'u.rakhimov') { Ensure-User -Sam $s -Path $ouDis -Enabled $false | Out-Null }
foreach ($s in 'a.abenov', 'b.akhmetova', 'd.bekov', 'g.zhunusova', 'k.ismailov', 'l.kim', 'm.nurpeisova', 'n.orlov',
               'o.sadykova', 'r.tulegenov', 't.utegenova', 'v.pak', 'y.li', 'z.mukanov', 'e.serikbayeva', 'p.volkova') {
    Ensure-User -Sam $s -Path $ouUsers -Groups @($G['Sales']) | Out-Null
}

# ---- service accounts (7 with PNE) ------------------------------------------------------------------------------
$owner = $zhukov.DistinguishedName
Ensure-User -Sam 'ServiceAccount01' -Path $ouSvc -Pne $true -Groups @($G['SQL-Backup-Ops']) | Out-Null   # no owner, no workstation restriction
Ensure-User -Sam 'svc_sql' -Path $ouSvc -Pne $true -Manager $owner -Workstations 'SQL01' -Spn @("MSSQLSvc/sql01.$($dnsRoot):1433", "MSSQLSvc/sql01.$dnsRoot") | Out-Null
Ensure-User -Sam 'svc_backup' -Path $ouSvc -Pne $true -Manager $owner | Out-Null
Ensure-User -Sam 'svc_web' -Path $ouSvc -Pne $true -Manager $owner -Workstations 'WEB01' -Spn @("HTTP/intranet.$dnsRoot") | Out-Null
Ensure-User -Sam 'sa_monitoring' -Path $ouSvc -Pne $true | Out-Null
Ensure-User -Sam 'srv_scan' -Path $ouSvc -Pne $true -Manager $owner -Workstations 'SCAN01' -Spn @("HTTP/scan01.$dnsRoot") | Out-Null
Ensure-User -Sam 'svc_app' -Path $ouSvc -Pne $true -Manager $owner -Workstations 'APP-SRV02' | Out-Null
Ensure-User -Sam 'svc_deploy' -Path $ouSvc -Manager $owner -Workstations 'APP-SRV02' -Spn @("HTTP/deploy.$dnsRoot") | Out-Null
Ensure-User -Sam 'svc_old_ftp' -Path $ouSvc -Pne $true -Enabled $false | Out-Null

# ---- computers ------------------------------------------------------------------------------------------------------
foreach ($i in 1..14) { $n = 'WS-{0:D3}' -f $i; if (-not (Get-ADComputer -Filter "Name -eq '$n'" -ErrorAction SilentlyContinue)) { New-ADComputer -Name $n -Path $ouWs } }
foreach ($n in 'WS-017', 'WS-OLD-01', 'WS-OLD-02', 'LAPTOP-OLD-07') { if (-not (Get-ADComputer -Filter "Name -eq '$n'" -ErrorAction SilentlyContinue)) { New-ADComputer -Name $n -Path $ouWs } }
foreach ($n in 'SQL01', 'FILE01', 'SCAN01', 'WEB01', 'APP-SRV02') { if (-not (Get-ADComputer -Filter "Name -eq '$n'" -ErrorAction SilentlyContinue)) { New-ADComputer -Name $n -Path $ouSrv } }
try {
    # duplicate SPN with svc_web; DCs since 2012 R2 reject duplicates, so this may legitimately fail
    Set-ADComputer 'WEB01' -ServicePrincipalNames @{ Add = "HTTP/intranet.$dnsRoot" }
} catch { Write-Warning "Duplicate SPN rejected by the DC (expected on 2012 R2+): $($_.Exception.Message)" }
Set-ADAccountControl (Get-ADComputer 'APP-SRV02') -TrustedForDelegation $true           # unconstrained delegation on a non-DC

# ---- weak password policy + a weak PSO (LAB ONLY!) ------------------------------------------------------------------
Set-ADDefaultDomainPasswordPolicy -Identity $dnsRoot -MinPasswordLength 7 -LockoutThreshold 0
if (-not (Get-ADFineGrainedPasswordPolicy -Filter "Name -eq 'PSO-Legacy-Apps'" -ErrorAction SilentlyContinue)) {
    New-ADFineGrainedPasswordPolicy -Name 'PSO-Legacy-Apps' -Precedence 50 -MinPasswordLength 6 -ComplexityEnabled $false `
        -LockoutThreshold 10 -LockoutDuration '00:15:00' -LockoutObservationWindow '00:15:00' -MaxPasswordAge '365.00:00:00' `
        -ReversibleEncryptionEnabled $false
    Add-ADFineGrainedPasswordPolicySubject 'PSO-Legacy-Apps' -Subjects $G['Legacy-Apps']
}
if (-not (Get-ADFineGrainedPasswordPolicy -Filter "Name -eq 'PSO-Tier0-Admins'" -ErrorAction SilentlyContinue)) {
    New-ADFineGrainedPasswordPolicy -Name 'PSO-Tier0-Admins' -Precedence 10 -MinPasswordLength 16 -ComplexityEnabled $true `
        -LockoutThreshold 5 -LockoutDuration '00:30:00' -LockoutObservationWindow '00:30:00' -MaxPasswordAge '180.00:00:00' `
        -ReversibleEncryptionEnabled $false
    Add-ADFineGrainedPasswordPolicySubject 'PSO-Tier0-Admins' -Subjects $DA
}

# ---- least-privilege reader account for the analyzer ---------------------------------------------------------------
# A plain Domain Users member. Add it to "Event Log Readers" (on the DCs) only if you enable EVENTLOG_MODE.
Ensure-User -Sam 'svc_ira_reader' -Path $ouSvc -Display 'Identity Risk Analyzer (read-only)' -Manager $owner | Out-Null
Write-Host "Set a password for svc_ira_reader yourself (Set-ADAccountPassword svc_ira_reader -Reset) and put it in .env." -ForegroundColor Yellow

Write-Host "Done. Run the analyzer with SOURCE=ldap. See the TIMESTAMPS note in this script's help for age-based findings." -ForegroundColor Green

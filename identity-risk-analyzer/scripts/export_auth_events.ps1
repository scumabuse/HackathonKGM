<#
.SYNOPSIS
  Exports authentication events from a DC's Security log to the JSON format the analyzer reads
  (EVENTLOG_MODE=file, EVENTLOG_PATH=<output>). Read-only.

.DESCRIPTION
  Collects 4624 (logon), 4625 (failed logon), 4771 (Kerberos pre-auth failed), 4776 (NTLM validation)
  and 4740 (lockout) for the last N hours. Only metadata is exported - account, source IP, workstation,
  logon type, status, time. Security events contain no passwords.
  Requires membership in "Event Log Readers" on the DC (Domain Admin is NOT required).

.EXAMPLE
  .\export_auth_events.ps1 -ComputerName dc01.corp.local -Hours 24 -OutFile .\auth_events.json
#>
[CmdletBinding()]
param(
    [string]$ComputerName = $env:COMPUTERNAME,
    [int]$Hours = 24,
    [string]$OutFile = '.\auth_events.json',
    [int]$MaxEvents = 50000
)
$ErrorActionPreference = 'Stop'

$filter = @{ LogName = 'Security'; Id = 4624, 4625, 4771, 4776, 4740; StartTime = (Get-Date).AddHours(-$Hours) }
$raw = Get-WinEvent -ComputerName $ComputerName -FilterHashtable $filter -MaxEvents $MaxEvents -ErrorAction SilentlyContinue

$events = foreach ($e in $raw) {
    $xml = [xml]$e.ToXml()
    $d = @{}
    foreach ($n in $xml.Event.EventData.Data) { $d[$n.Name] = $n.'#text' }
    $ws = if ($d['WorkstationName']) { $d['WorkstationName'] } elseif ($d['Workstation']) { $d['Workstation'] } elseif ($e.Id -eq 4740) { $d['TargetDomainName'] } else { $null }
    $status = if ($d['SubStatus'] -and $d['SubStatus'] -ne '0x0') { $d['SubStatus'] } else { $d['Status'] }
    $ip = $d['IpAddress']
    if ($ip -in @($null, '', '-')) { $ip = $null } else { $ip = $ip -replace '^::ffff:', '' }
    [pscustomobject]@{
        event_id      = $e.Id
        time          = $e.TimeCreated.ToUniversalTime().ToString('o')
        target_user   = $d['TargetUserName']
        target_domain = $d['TargetDomainName']
        source_ip     = $ip
        workstation   = $ws
        logon_type    = if ($d['LogonType']) { [int]$d['LogonType'] } else { $null }
        status        = $status
    }
}

@{ events = @($events) } | ConvertTo-Json -Depth 4 | Set-Content -Path $OutFile -Encoding UTF8
Write-Host "Exported $(@($events).Count) events from $ComputerName to $OutFile"

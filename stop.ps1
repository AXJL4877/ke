# Stop KE Studio + all contract local backends (ports 8000 / 3000 + pids.locals + ports.json)
# Keep ASCII-only.
# Only shell + keep modules: $env:KE_STOP_LOCALS = "0"
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Logs = Join-Path $Root "logs"
$PidFile = Join-Path $Logs "pids.json"
$ModulesDir = Join-Path $Root "backend\modules"

function Stop-PortListeners {
  param([int]$Port)
  if ($Port -le 0) { return }
  try {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
      $procId = $c.OwningProcess
      if ($procId -and $procId -gt 0) {
        Write-Host "[ke] stopping PID $procId on :$Port"
        cmd /c "taskkill /F /T /PID $procId" 1>$null 2>$null
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
      }
    }
  } catch {
    $lines = netstat -ano | Select-String ":$Port\s+.*LISTENING"
    foreach ($line in $lines) {
      $parts = ($line.ToString() -split "\s+") | Where-Object { $_ }
      $procId = $parts[-1]
      if ($procId -match "^\d+$" -and [int]$procId -gt 0) {
        Write-Host "[ke] stopping PID $procId on :$Port"
        cmd /c "taskkill /F /T /PID $procId" 1>$null 2>$null
      }
    }
  }
}

function Stop-PidTree {
  param([int]$ProcId, [string]$Name)
  if (-not $ProcId -or $ProcId -le 0) { return }
  Write-Host "[ke] stopping $Name PID $ProcId (tree)"
  cmd /c "taskkill /F /T /PID $ProcId" 1>$null 2>$null
  Stop-Process -Id $ProcId -Force -ErrorAction SilentlyContinue
}

function Get-PortFromUrl {
  param([string]$Url)
  if (-not $Url) { return $null }
  try {
    $u = [Uri]$Url
    if ($u.Port -gt 0) { return [int]$u.Port }
    if ($u.Scheme -eq "https") { return 443 }
    return 80
  } catch {
    return $null
  }
}

function Get-ContractServiceIds {
  $ids = New-Object System.Collections.Generic.HashSet[string]
  if (-not (Test-Path $ModulesDir)) { return @() }
  Get-ChildItem -Path $ModulesDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.Name.StartsWith("_") -or $_.Name.StartsWith(".")) { return }
    $contractPath = Join-Path $_.FullName "integration.contract.json"
    if (-not (Test-Path $contractPath)) { return }
    try {
      $c = Get-Content $contractPath -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch { return }
    if ($c.source -and $c.source.service_id) {
      [void]$ids.Add([string]$c.source.service_id)
    }
    if ($c.depends_on) {
      foreach ($dep in @($c.depends_on)) {
        if ($dep -and $dep.service_id) {
          [void]$ids.Add([string]$dep.service_id)
        }
      }
    }
  }
  return @($ids)
}

function Stop-ContractLocalPorts {
  $serviceIds = Get-ContractServiceIds
  if ($serviceIds.Count -eq 0) { return }
  if ($env:SCENE_STUDIO_PORTS_FILE) { $regFile = $env:SCENE_STUDIO_PORTS_FILE }
  else { $regFile = Join-Path $env:USERPROFILE ".scene-studio\ports.json" }
  if (-not (Test-Path $regFile)) { return }
  try {
    $reg = Get-Content $regFile -Raw -Encoding UTF8 | ConvertFrom-Json
  } catch { return }
  foreach ($sid in $serviceIds) {
    $entry = $reg.$sid
    if (-not $entry) { continue }
    $base = $null
    if ($entry.baseUrl) { $base = [string]$entry.baseUrl }
    elseif ($entry.base_url) { $base = [string]$entry.base_url }
    if (-not $base) { continue }
    $port = Get-PortFromUrl $base
    if ($port -and $port -ne 8000 -and $port -ne 3000) {
      Write-Host "[ke] stopping contract local $sid on :$port"
      Stop-PortListeners $port
    }
  }
}

$stopLocals = -not ($env:KE_STOP_LOCALS -eq "0" -or $env:KE_STOP_LOCALS -eq "false")

if (Test-Path $PidFile) {
  try {
    $pids = Get-Content $PidFile -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($name in @("backend", "frontend")) {
      $id = $pids.$name
      if ($id) { Stop-PidTree -ProcId ([int]$id) -Name $name }
    }
    if ($stopLocals -and $pids.locals) {
      $pids.locals.PSObject.Properties | ForEach-Object {
        Stop-PidTree -ProcId ([int]$_.Value) -Name ("local:" + $_.Name)
      }
    } elseif (-not $stopLocals) {
      Write-Host "[ke] KE_STOP_LOCALS=0; leaving local backends running"
    }
  } catch { }
}

Stop-PortListeners 8000
Stop-PortListeners 3000

if ($stopLocals) {
  Stop-ContractLocalPorts
}

Start-Sleep -Seconds 1
Stop-PortListeners 8000
Stop-PortListeners 3000
if ($stopLocals) {
  Stop-ContractLocalPorts
}

if (Test-Path $PidFile) {
  try {
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
  } catch { }
}

Write-Host "[ke] stopped. Logs kept under $Logs"
Write-Host "     local logs: $Logs\locals\"

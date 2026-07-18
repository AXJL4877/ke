# Stop KE Studio + local backends started by ke (ports 8000 / 3000 + pids.locals)
# Keep ASCII-only.
# Only shell: $env:KE_STOP_LOCALS = "0"
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Logs = Join-Path $Root "logs"
$PidFile = Join-Path $Logs "pids.json"

function Stop-PortListeners {
  param([int]$Port)
  try {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
      $procId = $c.OwningProcess
      if ($procId -and $procId -gt 0) {
        Write-Host "[ke] stopping PID $procId on :$Port"
        # Kill process tree (uvicorn workers / npm children)
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

if (Test-Path $PidFile) {
  try {
    $pids = Get-Content $PidFile -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($name in @("backend", "frontend")) {
      $id = $pids.$name
      if ($id) { Stop-PidTree -ProcId ([int]$id) -Name $name }
    }
    $stopLocals = -not ($env:KE_STOP_LOCALS -eq "0" -or $env:KE_STOP_LOCALS -eq "false")
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

Start-Sleep -Seconds 1
Stop-PortListeners 8000
Stop-PortListeners 3000

Write-Host "[ke] stopped. Logs kept under $Logs"
Write-Host "     local logs: $Logs\locals\"

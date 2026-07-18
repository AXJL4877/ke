# Stop KE Studio silent processes (ports 8000 / 3000)
# Keep ASCII-only.
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
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
      }
    }
  } catch {
    # Fallback: netstat parse
    $lines = netstat -ano | Select-String ":$Port\s+.*LISTENING"
    foreach ($line in $lines) {
      $parts = ($line.ToString() -split "\s+") | Where-Object { $_ }
      $procId = $parts[-1]
      if ($procId -match "^\d+$" -and [int]$procId -gt 0) {
        Write-Host "[ke] stopping PID $procId on :$Port"
        Stop-Process -Id ([int]$procId) -Force -ErrorAction SilentlyContinue
      }
    }
  }
}

if (Test-Path $PidFile) {
  try {
    $pids = Get-Content $PidFile -Raw | ConvertFrom-Json
    foreach ($name in @("backend", "frontend")) {
      $id = $pids.$name
      if ($id) {
        Write-Host "[ke] stopping recorded $name PID $id"
        Stop-Process -Id ([int]$id) -Force -ErrorAction SilentlyContinue
      }
    }
  } catch { }
}

Stop-PortListeners 8000
Stop-PortListeners 3000

# Child npm / node / uvicorn may linger under different PIDs
Start-Sleep -Seconds 1
Stop-PortListeners 8000
Stop-PortListeners 3000

Write-Host "[ke] stopped. Logs kept under $Logs"

# KE Studio silent start: backend :8000 + frontend :3000 (no console windows)
# Keep this file ASCII-only to avoid PowerShell encoding issues on Windows.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$Logs = Join-Path $Root "logs"
New-Item -ItemType Directory -Force -Path $Logs | Out-Null
$BackendLog = Join-Path $Logs "backend.log"
$FrontendLog = Join-Path $Logs "frontend.log"
$PidFile = Join-Path $Logs "pids.json"

function Refresh-PathFromRegistry {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
  foreach ($p in @(
    "$env:ProgramFiles\nodejs",
    "$env:LOCALAPPDATA\Microsoft\WinGet\Links",
    "$env:LOCALAPPDATA\Programs\Python\Python312",
    "$env:LOCALAPPDATA\Programs\Python\Python311"
  )) {
    if (Test-Path $p) { $env:Path = "$p;$env:Path" }
  }
}

function Show-LogTail {
  param([string]$Path, [int]$Lines = 40)
  if (Test-Path $Path) {
    Write-Host "----- last lines of $Path -----"
    Get-Content $Path -Tail $Lines -ErrorAction SilentlyContinue
  }
}

function Test-PortListening {
  param([int]$Port)
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $c.Connect("127.0.0.1", $Port)
    $c.Close()
    return $true
  } catch {
    return $false
  }
}

Refresh-PathFromRegistry

$PythonExe = $null
$PythonArgs = @()
if (Get-Command python -ErrorAction SilentlyContinue) {
  $PythonExe = (Get-Command python).Source
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
  $PythonExe = (Get-Command py).Source
  $PythonArgs = @("-3")
} else {
  throw "Python not found. Install Python 3.11+ and add it to PATH."
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js not found. Install Node.js >= 18 and add it to PATH."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm not found."
}

Write-Host "[ke] checking backend deps..."
Push-Location $Backend
try {
  New-Item -ItemType Directory -Force -Path "data" | Out-Null
  & $PythonExe @PythonArgs -c "import fastapi, uvicorn, sqlalchemy, pydantic_settings" 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[ke] pip install -r requirements.txt ..."
    & $PythonExe @PythonArgs -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw "pip install failed" }
  }
} finally {
  Pop-Location
}

Write-Host "[ke] checking frontend deps..."
Push-Location $Frontend
try {
  if (-not (Test-Path "node_modules")) {
    Write-Host "[ke] npm install..."
    $env:npm_config_registry = "https://registry.npmmirror.com"
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
  }
} finally {
  Pop-Location
}

# --- Local HTTP backends: default SKIP at boot (on-demand via worker) ---
# Opt-in full start: $env:KE_AUTO_START_LOCAL='1'
# This avoids popping module consoles when only the ke shell is needed.
$StartLocals = Join-Path $Root "scripts\Start-LocalServices.ps1"
$autoLocals = $env:KE_AUTO_START_LOCAL -eq "1" -or $env:KE_AUTO_START_LOCAL -eq "true"
if ($autoLocals) {
  if (Test-Path $StartLocals) {
    Write-Host "[ke] KE_AUTO_START_LOCAL=1, starting all contract backends (silent)..."
    try {
      & $StartLocals -KeRoot $Root -WaitSeconds 90
    } catch {
      Write-Warning "[ke] local service start had errors: $($_.Exception.Message)"
      Write-Warning "[ke] continuing shell start; check logs\locals\"
    }
  } else {
    Write-Host "[ke] scripts\Start-LocalServices.ps1 missing; skip local backends"
  }
} else {
  Write-Host "[ke] skip local backends at startup (on-demand when tasks run; set KE_AUTO_START_LOCAL=1 to start all now)"
}

$pids = @{ backend = $null; frontend = $null; locals = @{} }
if (Test-Path $PidFile) {
  try {
    $prev = Get-Content $PidFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($prev.locals) {
      $prev.locals.PSObject.Properties | ForEach-Object {
        $pids.locals[$_.Name] = $_.Value
      }
    }
  } catch { }
}

# --- Backend (silent) ---
if (Test-PortListening 8000) {
  Write-Host "[ke] backend already listening on :8000 (reuse)"
} else {
  Write-Host "[ke] starting backend silently -> $BackendLog"
  "" | Set-Content -Path $BackendLog -Encoding UTF8
  $pyArgLit = if ($PythonArgs.Count) { ($PythonArgs | ForEach-Object { "'$_'" }) -join ", " } else { "" }
  $backendCmd = @"
`$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath '$Backend'
`$env:PYTHONPATH = '.'
`$pyArgs = @($pyArgLit)
& '$PythonExe' @pyArgs -m uvicorn api.main:app --reload --host 127.0.0.1 --port 8000 *>> '$BackendLog' 2>&1
"@
  $be = Start-Process powershell -WindowStyle Hidden -PassThru -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command", $backendCmd
  )
  $pids.backend = $be.Id
}

$ok = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 1
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -UseBasicParsing -TimeoutSec 1
    if ($r.StatusCode -eq 200) { $ok = $true; break }
  } catch { }
}
if (-not $ok) {
  Write-Warning "[ke] backend health check timed out. Log tail:"
  Show-LogTail $BackendLog
  throw "Backend failed to start. See $BackendLog"
}
Write-Host "[ke] backend ready"

# --- Frontend (silent) ---
if (Test-PortListening 3000) {
  Write-Host "[ke] frontend already listening on :3000 (reuse)"
} else {
  Write-Host "[ke] starting frontend silently -> $FrontendLog"
  "" | Set-Content -Path $FrontendLog -Encoding UTF8
  $frontendCmd = @"
`$ErrorActionPreference = 'Continue'
Set-Location '$Frontend'
npm run dev *>> '$FrontendLog' 2>&1
"@
  $fe = Start-Process powershell -WindowStyle Hidden -PassThru -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command", $frontendCmd
  )
  $pids.frontend = $fe.Id
}

$feOk = $false
for ($i = 0; $i -lt 50; $i++) {
  Start-Sleep -Seconds 1
  if (Test-PortListening 3000) { $feOk = $true; break }
}
if (-not $feOk) {
  Write-Warning "[ke] frontend did not open :3000 in time. Log tail:"
  Show-LogTail $FrontendLog
  Write-Warning "[ke] opening browser anyway; check $FrontendLog if page fails."
} else {
  Write-Host "[ke] frontend ready"
}

($pids | ConvertTo-Json -Depth 5) | Set-Content -Path $PidFile -Encoding UTF8

Start-Process "http://localhost:3000"

Write-Host ""
Write-Host "[ke] started silently (no console windows)"
Write-Host "     frontend: http://localhost:3000"
Write-Host "     backend:  http://127.0.0.1:8000"
Write-Host "     docs:     http://127.0.0.1:8000/docs"
Write-Host "     locals:   logs\locals\  (contract backends)"
Write-Host "     logs:     $Logs"
Write-Host "     stop:     .\stop.bat  (or close last KE browser tab / 退出 KE)"
Write-Host "     boot all locals: `$env:KE_AUTO_START_LOCAL='1'"
Write-Host "     manual locals: .\scripts\Start-LocalServices.ps1"

# KE Studio one-click start: backend :8000 + frontend :3000
# Keep this file ASCII-only to avoid PowerShell encoding issues on Windows.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"

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

Write-Host "[ke] starting backend http://127.0.0.1:8000 ..."
$pyArgLit = if ($PythonArgs.Count) { ($PythonArgs | ForEach-Object { "'$_'" }) -join ", " } else { "" }
$backendCmd = @"
Set-Location '$Backend'
`$env:PYTHONPATH = '.'
Write-Host 'KE Backend  |  http://127.0.0.1:8000  |  Ctrl+C to stop'
`$pyArgs = @($pyArgLit)
& '$PythonExe' @pyArgs -m uvicorn api.main:app --reload --host 127.0.0.1 --port 8000
"@
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-Command", $backendCmd
)

$ok = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -UseBasicParsing -TimeoutSec 1
    if ($r.StatusCode -eq 200) { $ok = $true; break }
  } catch { }
}
if (-not $ok) {
  Write-Warning "[ke] backend health check timed out; starting frontend anyway. Check the Backend window."
} else {
  Write-Host "[ke] backend ready"
}

Write-Host "[ke] starting frontend http://localhost:3000 ..."
$frontendCmd = @"
Set-Location '$Frontend'
Write-Host 'KE Frontend  |  http://localhost:3000  |  Ctrl+C to stop'
npm run dev
"@
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-Command", $frontendCmd
)

Start-Sleep -Seconds 3
Start-Process "http://localhost:3000"

Write-Host ""
Write-Host "[ke] opened Backend + Frontend windows"
Write-Host "     frontend: http://localhost:3000"
Write-Host "     backend:  http://127.0.0.1:8000"
Write-Host "     docs:     http://127.0.0.1:8000/docs"
Write-Host "Close a window or press Ctrl+C to stop that process."

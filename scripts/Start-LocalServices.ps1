# Silently start local HTTP backends declared by ke module integration contracts.
# ASCII-only. Called from start.ps1 (default) or on-demand from task worker:
#   .\scripts\Start-LocalServices.ps1
#   .\scripts\Start-LocalServices.ps1 -ServiceIds download -ServiceIds asr
# Skip all: $env:KE_AUTO_START_LOCAL='0' (checked in start.ps1)
#
# Wait strategy:
# - Spawn all missing services first, then wait in PARALLEL under one WaitSeconds budget
#   (not N * WaitSeconds sequential).
# - Fail-fast when the launcher process exits without /health, or logs show a fatal error.
# - "pip install" / Creating .venv is status only — does not extend the budget.
# - TCP probe before HTTP health (closed ports skip instantly).
# - Silent start via UTF-8 -File bootstrap (Chinese paths safe; no ANSI -Command).
# - Resolve module folders: ke/deps first, then mo_kuai / Desktop.
param(
  [string]$KeRoot = "",
  [int]$WaitSeconds = 45,
  [switch]$NoWait,
  [string[]]$ServiceIds = @()
)

$ErrorActionPreference = "Continue"

if (-not $KeRoot) {
  $KeRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
}
$KeRoot = (Resolve-Path $KeRoot).Path
$ModulesDir = Join-Path $KeRoot "backend\modules"
$LogsDir = Join-Path $KeRoot "logs\locals"
$PidFile = Join-Path $KeRoot "logs\pids.json"
New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $KeRoot "logs") | Out-Null

$filterIds = @()
if ($ServiceIds -and $ServiceIds.Count -gt 0) {
  $filterIds = @($ServiceIds | ForEach-Object { [string]$_ } | Where-Object { $_ })
}

function Test-TcpOpen {
  # Fast reject closed ports — avoid Invoke-RestMethod hanging ~TimeoutSec each.
  param([string]$HostName = "127.0.0.1", [int]$Port, [int]$TimeoutMs = 200)
  if ($Port -le 0) { return $false }
  $client = $null
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
      return $false
    }
    $client.EndConnect($iar)
    return $true
  } catch {
    return $false
  } finally {
    if ($client) { try { $client.Close() } catch { } }
  }
}

function Get-UrlHostPort {
  param([string]$BaseUrl)
  try {
    $u = [Uri]$BaseUrl
    $port = $u.Port
    if ($port -lt 1) {
      $port = if ($u.Scheme -eq "https") { 443 } else { 80 }
    }
    return @{ Host = $u.Host; Port = [int]$port }
  } catch {
    return $null
  }
}

function Test-HealthLabel {
  param([string]$BaseUrl, [string]$ExpectLabel, [string]$HealthPath = "/health")
  $hp = Get-UrlHostPort -BaseUrl $BaseUrl
  if ($null -eq $hp) { return $false }
  if (-not (Test-TcpOpen -HostName $hp.Host -Port $hp.Port -TimeoutMs 200)) {
    return $false
  }
  try {
    $u = $BaseUrl.TrimEnd("/") + $HealthPath
    $r = Invoke-RestMethod -Uri $u -TimeoutSec 1 -ErrorAction Stop
    if ($null -eq $r) { return $false }
    $svc = $r.service
    return ($svc -eq $ExpectLabel)
  } catch {
    return $false
  }
}

function Test-ProcessAlive {
  param([System.Diagnostics.Process]$Proc)
  if ($null -eq $Proc) { return $false }
  try {
    $Proc.Refresh()
    return -not $Proc.HasExited
  } catch {
    return $false
  }
}

function Get-LogTailText {
  param([string]$LogPath, [int]$TailLines = 40)
  $parts = New-Object System.Collections.Generic.List[string]
  foreach ($p in @($LogPath, ($LogPath + ".err"))) {
    if (-not (Test-Path -LiteralPath $p)) { continue }
    try {
      $lines = Get-Content -LiteralPath $p -Tail $TailLines -ErrorAction Stop
      if ($lines) { [void]$parts.Add(($lines -join "`n")) }
    } catch { }
  }
  return ($parts -join "`n")
}

function Get-StartupFailureReason {
  # Fail-fast only on clear terminal errors. Do not treat "Installing..." as failure.
  param([string]$LogPath)
  $text = Get-LogTailText -LogPath $LogPath -TailLines 60
  if (-not $text) { return $null }

  $patterns = @(
    @{ Re = '(?im)^Traceback \(most recent call last\):'; Hint = "python traceback" },
    @{ Re = '(?i)ModuleNotFoundError:'; Hint = "ModuleNotFoundError" },
    @{ Re = '(?i)ImportError:'; Hint = "ImportError" },
    @{ Re = '(?i)SyntaxError:'; Hint = "SyntaxError" },
    @{ Re = '(?i)Fatal Python error'; Hint = "Fatal Python error" },
    @{ Re = '(?i)ERROR:\s+(Could not|No matching distribution|Invalid requirement)'; Hint = "pip error" },
    @{ Re = '(?i)Could not install packages'; Hint = "pip install failed" },
    @{ Re = '(?i)Address already in use'; Hint = "port bind failed" },
    @{ Re = '(?i)error while attempting to bind'; Hint = "port bind failed" },
    @{ Re = '(?i)PermissionError:'; Hint = "PermissionError" },
    @{ Re = '(?i)The system cannot find the (file|path)'; Hint = "missing file/path" },
    @{ Re = '(?i)cannot be loaded because running scripts is disabled'; Hint = "execution policy" }
  )
  foreach ($p in $patterns) {
    if ($text -match $p.Re) { return $p.Hint }
  }
  return $null
}

function Get-StartupBusyHint {
  param([string]$LogPath)
  $text = Get-LogTailText -LogPath $LogPath -TailLines 20
  if (-not $text) { return $null }
  if ($text -match '(?i)Installing dependencies|pip install|Collecting |Downloading |Creating \.venv|Building wheel') {
    return "installing deps"
  }
  if ($text -match '(?i)Starting API|Uvicorn running|Application startup') {
    return "starting server"
  }
  return $null
}

function Find-LiveBase {
  param(
    [string]$ServiceId,
    [string]$Label,
    [int]$DefaultPort,
    [int]$MaxTries = 12,
    # Limit how many defaultPort+i candidates to HTTP-probe (TCP already filters).
    # Pre-start: use 2; wait loop: use 4. Full MaxTries only when needed.
    [int]$ProbeTries = -1
  )
  if ($ProbeTries -lt 0) { $ProbeTries = $MaxTries }
  $probeN = [Math]::Max(1, [Math]::Min($MaxTries, $ProbeTries))

  $cands = New-Object System.Collections.Generic.List[string]
  $envName = ($ServiceId.ToUpper() -replace "-", "_") + "_BASE_URL"
  $envVal = [Environment]::GetEnvironmentVariable($envName)
  if ($envVal) { [void]$cands.Add([string]$envVal.TrimEnd("/")) }

  if ($env:SCENE_STUDIO_PORTS_FILE) { $regFile = $env:SCENE_STUDIO_PORTS_FILE }
  else { $regFile = Join-Path $env:USERPROFILE ".scene-studio\ports.json" }
  if (Test-Path $regFile) {
    try {
      $reg = Get-Content $regFile -Raw -Encoding UTF8 | ConvertFrom-Json
      $entry = $reg.$ServiceId
      if ($entry -and $entry.baseUrl) { [void]$cands.Add([string]$entry.baseUrl) }
    } catch { }
  }
  if ($DefaultPort -gt 0) {
    for ($i = 0; $i -lt $probeN; $i++) {
      [void]$cands.Add("http://127.0.0.1:$($DefaultPort + $i)")
    }
  }
  $seen = @{}
  foreach ($b in $cands) {
    if (-not $b) { continue }
    $key = $b.TrimEnd("/").ToLowerInvariant()
    if ($seen.ContainsKey($key)) { continue }
    $seen[$key] = $true
    if (Test-HealthLabel -BaseUrl $b -ExpectLabel $Label) { return $b.TrimEnd("/") }
  }
  return $null
}

function Resolve-ModuleFolder {
  param([string]$ManifestPath, [string]$ServiceId, [string]$Label)
  if ($ManifestPath) {
    $p = $ManifestPath
    if (-not [System.IO.Path]::IsPathRooted($p)) {
      $p = Join-Path $KeRoot $p
    }
    if (Test-Path $p) {
      $full = (Resolve-Path $p).Path
      return Split-Path -Parent $full
    }
  }
  $names = New-Object System.Collections.Generic.List[string]
  if ($Label) { [void]$names.Add($Label) }
  [void]$names.Add($ServiceId)
  # Prefer project deps/ (assembled host) before sibling mo_kuai / Desktop scans.
  $roots = @(
    (Join-Path $KeRoot "deps"),
    (Join-Path $KeRoot "..\deps"),
    (Join-Path $KeRoot ".."),
    (Join-Path $KeRoot "..\mo_kuai"),
    (Join-Path $env:USERPROFILE "Desktop\mo_kuai"),
    (Join-Path $env:USERPROFILE "Desktop"),
    "D:\Desktop\mo_kuai",
    "D:\Desktop"
  )
  foreach ($name in $names) {
    foreach ($root in $roots) {
      if (-not $root) { continue }
      $cand = Join-Path $root $name
      if (Test-Path (Join-Path $cand "module.json")) {
        return (Resolve-Path $cand).Path
      }
    }
  }

  # Generic fallback: inspect direct child manifests and match by declared id
  # or local.label. This avoids maintaining module-specific folder aliases.
  foreach ($root in $roots) {
    if (-not $root -or -not (Test-Path -LiteralPath $root -PathType Container)) { continue }
    try {
      foreach ($child in @(Get-ChildItem -LiteralPath $root -Directory -ErrorAction Stop)) {
        $manifest = Join-Path $child.FullName "module.json"
        if (-not (Test-Path -LiteralPath $manifest -PathType Leaf)) { continue }
        try {
          $data = Get-Content -LiteralPath $manifest -Raw -Encoding UTF8 | ConvertFrom-Json
          $idMatch = ([string]$data.id -eq $ServiceId)
          $labelMatch = ($data.local -and [string]$data.local.label -eq $Label)
          if ($idMatch -or $labelMatch) {
            return (Resolve-Path -LiteralPath $child.FullName).Path
          }
        } catch { }
      }
    } catch { }
  }
  return $null
}

function Resolve-StartScript {
  param([string]$Folder, $LocalBlock)
  # Prefer API-only starts (no browser). Avoid start_web when possible.
  $preferred = @(
    "start_api.ps1",
    "start_api.bat",
    "start.ps1",
    "start.bat"
  )
  if ($LocalBlock -and $LocalBlock.start -and $LocalBlock.start.windows) {
    $declared = [string]$LocalBlock.start.windows.script
    if ($declared -and (Test-Path (Join-Path $Folder $declared))) {
      # If declared is start_web.*, try API-first siblings first
      if ($declared -match "start_web") {
        foreach ($s in $preferred) {
          $p = Join-Path $Folder $s
          if (Test-Path $p) { return $p }
        }
      }
      return (Join-Path $Folder $declared)
    }
  }
  foreach ($s in $preferred) {
    $p = Join-Path $Folder $s
    if (Test-Path $p) { return $p }
  }
  foreach ($s in @("start_web.ps1", "start_web.bat")) {
    $p = Join-Path $Folder $s
    if (Test-Path $p) { return $p }
  }
  return $null
}

function Get-PythonVenvCandidates {
  param(
    [string]$Folder,
    [int]$MaxDepth = 3
  )
  $found = New-Object System.Collections.Generic.List[string]
  $queue = New-Object System.Collections.Queue
  $queue.Enqueue([pscustomobject]@{ Path = $Folder; Depth = 0 })
  $skipNames = @(".git", "node_modules", "dist", "build", "outputs", "__pycache__")

  while ($queue.Count -gt 0) {
    $item = $queue.Dequeue()
    if ($item.Depth -gt $MaxDepth) { continue }
    try {
      Get-ChildItem -LiteralPath $item.Path -Directory -Force -ErrorAction Stop | ForEach-Object {
        if ($_.Name -eq ".venv") {
          [void]$found.Add($_.FullName)
          return
        }
        if ($item.Depth -lt $MaxDepth -and $skipNames -notcontains $_.Name) {
          $queue.Enqueue([pscustomobject]@{
            Path = $_.FullName
            Depth = $item.Depth + 1
          })
        }
      }
    } catch { }
  }
  return $found
}

function Test-PythonVenvHealthy {
  param([string]$VenvPath)
  $cfg = Join-Path $VenvPath "pyvenv.cfg"
  $python = Join-Path $VenvPath "Scripts\python.exe"
  if (-not (Test-Path -LiteralPath $cfg -PathType Leaf)) { return $false }
  if (-not (Test-Path -LiteralPath $python -PathType Leaf)) { return $false }

  # Structural files can both exist in a copied/truncated venv. Execute a
  # minimal probe as the final check; a valid environment returns exit code 0.
  try {
    & $python -c "import sys; assert sys.prefix" 1>$null 2>$null
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  }
}

function Repair-BrokenPythonVenvs {
  param([string]$Folder)
  if ($env:KE_REPAIR_VENV -eq "0" -or $env:KE_REPAIR_VENV -eq "false") {
    Write-Host "[ke-local] KE_REPAIR_VENV=0, skip venv preflight"
    return $true
  }

  $ok = $true
  foreach ($venv in (Get-PythonVenvCandidates -Folder $Folder)) {
    if (Test-PythonVenvHealthy -VenvPath $venv) {
      Write-Host "[ke-local] venv healthy: $venv"
      continue
    }

    # Only directories literally named .venv under the resolved module folder
    # are eligible. Never delete an arbitrary Python path.
    $leaf = Split-Path -Leaf $venv
    $fullFolder = [System.IO.Path]::GetFullPath($Folder).TrimEnd("\")
    $fullVenv = [System.IO.Path]::GetFullPath($venv)
    if ($leaf -ne ".venv" -or -not $fullVenv.StartsWith($fullFolder + "\", [System.StringComparison]::OrdinalIgnoreCase)) {
      Write-Warning "[ke-local] refuse to remove unsafe venv path: $venv"
      $ok = $false
      continue
    }

    Write-Warning "[ke-local] broken .venv detected; removing so module start script can rebuild: $venv"
    try {
      Remove-Item -LiteralPath $venv -Recurse -Force -ErrorAction Stop
    } catch {
      Write-Warning "[ke-local] cannot remove broken .venv: $($_.Exception.Message)"
      $ok = $false
    }
  }
  return $ok
}

function Start-ServiceSilent {
  param(
    [string]$ServiceId,
    [string]$Folder,
    [string]$ScriptPath,
    [string]$LogPath
  )
  # Use UTF-8 -File bootstrap (not -Command). Embedding Chinese paths in -Command
  # goes through the ANSI code page and can break cwd/logs (empty log + instant exit).
  $errLog = $LogPath + ".err"
  "" | Set-Content -Path $LogPath -Encoding UTF8
  "" | Set-Content -Path $errLog -Encoding UTF8

  $bootPath = Join-Path $LogsDir ("{0}.boot.ps1" -f $ServiceId)
  $ext = [System.IO.Path]::GetExtension($ScriptPath).ToLowerInvariant()
  if ($ext -eq ".ps1") {
    $runLine = "& `$scriptPath *>> `$logPath 2>> `$errPath"
  } else {
    $runLine = "cmd.exe /c `"`"`$scriptPath`"`" *>> `$logPath 2>> `$errPath"
  }
  $boot = @"
`$ErrorActionPreference = 'Continue'
`$env:KE_SILENT = '1'
`$folder = $($Folder | ConvertTo-Json -Compress)
`$scriptPath = $($ScriptPath | ConvertTo-Json -Compress)
`$logPath = $($LogPath | ConvertTo-Json -Compress)
`$errPath = $($errLog | ConvertTo-Json -Compress)
Set-Location -LiteralPath `$folder
$runLine
"@
  # UTF-8 with BOM so powershell -File parses non-ASCII paths correctly on Windows.
  $utf8Bom = New-Object System.Text.UTF8Encoding $true
  [System.IO.File]::WriteAllText($bootPath, $boot, $utf8Bom)

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "powershell.exe"
  $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$bootPath`""
  $psi.WorkingDirectory = $Folder
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardInput = $false
  $psi.RedirectStandardOutput = $false
  $psi.RedirectStandardError = $false
  if ($psi.EnvironmentVariables.ContainsKey("KE_SILENT")) {
    $psi.EnvironmentVariables["KE_SILENT"] = "1"
  } else {
    $psi.EnvironmentVariables.Add("KE_SILENT", "1")
  }

  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $psi
  [void]$proc.Start()
  Write-Host "[ke-local] spawned pid=$($proc.Id) CreateNoWindow=1 KE_SILENT=1 UTF8-File ($ServiceId)"
  return $proc
}

function Collect-Services {
  $map = @{}
  if (-not (Test-Path $ModulesDir)) { return $map }

  Get-ChildItem -Path $ModulesDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.Name.StartsWith("_") -or $_.Name.StartsWith(".")) { return }
    $contractPath = Join-Path $_.FullName "integration.contract.json"
    if (-not (Test-Path $contractPath)) { return }
    try {
      $c = Get-Content $contractPath -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
      Write-Warning "[ke-local] bad contract: $contractPath"
      return
    }
    $deps = @()
    if ($c.source) { $deps += $c.source }
    if ($c.depends_on) { $deps += @($c.depends_on) }
    foreach ($dep in $deps) {
      if (-not $dep) { continue }
      $sid = [string]$dep.service_id
      if (-not $sid) { continue }
      if ($map.ContainsKey($sid)) { continue }
      $label = [string]$dep.label
      if (-not $label) { $label = $sid }
      $port = 0
      if ($dep.default_port) { $port = [int]$dep.default_port }
      elseif ($dep.defaultPort) { $port = [int]$dep.defaultPort }
      $tries = 12
      if ($dep.max_tries) { $tries = [int]$dep.max_tries }
      elseif ($dep.maxTries) { $tries = [int]$dep.maxTries }
      $manifestPath = $null
      if ($dep.manifest_path) { $manifestPath = [string]$dep.manifest_path }
      $folder = Resolve-ModuleFolder -ManifestPath $manifestPath -ServiceId $sid -Label $label
      $local = $null
      $healthPath = "/health"
      if ($folder -and (Test-Path (Join-Path $folder "module.json"))) {
        try {
          $mj = Get-Content (Join-Path $folder "module.json") -Raw -Encoding UTF8 | ConvertFrom-Json
          $local = $mj.local
          if ($local.label) { $label = [string]$local.label }
          if ($local.defaultPort -and $port -le 0) { $port = [int]$local.defaultPort }
          if ($local.maxTries) { $tries = [int]$local.maxTries }
          if ($local.healthPath) { $healthPath = [string]$local.healthPath }
        } catch { }
      }
      $script = $null
      if ($folder) { $script = Resolve-StartScript -Folder $folder -LocalBlock $local }
      $map[$sid] = [pscustomobject]@{
        service_id = $sid
        label      = $label
        port       = $port
        max_tries  = $tries
        folder     = $folder
        script     = $script
        healthPath = $healthPath
        module_id  = [string]$c.module_id
      }
    }
  }
  return $map
}

Write-Host "[ke-local] scanning integration contracts under backend\modules ..."
if ($filterIds.Count -gt 0) {
  Write-Host "[ke-local] filter service_ids: $($filterIds -join ', ')"
}
$allServices = Collect-Services
$services = $allServices
if ($filterIds.Count -gt 0) {
  $services = @{}
  foreach ($sid in $filterIds) {
    if ($allServices.ContainsKey($sid)) {
      $services[$sid] = $allServices[$sid]
    } else {
      Write-Warning "[ke-local] service_id not found in contracts: $sid"
    }
  }
}
if ($services.Count -eq 0) {
  Write-Host "[ke-local] no contract sources/depends_on found (nothing to start)"
  return @{ started = @(); skipped = @(); failed = @(); reused = @() }
}

$started = @()
$reused = @()
$failed = @()
$skipped = @()
$pidMap = @{}
# Pending starts: spawn all first, then wait in parallel (one shared deadline).
$pending = New-Object System.Collections.Generic.List[object]

foreach ($sid in ($services.Keys | Sort-Object)) {
  $svc = $services[$sid]
  Write-Host "[ke-local] --- $($svc.service_id) (label=$($svc.label), from module $($svc.module_id)) ---"

  $live = Find-LiveBase -ServiceId $svc.service_id -Label $svc.label -DefaultPort $svc.port -MaxTries $svc.max_tries -ProbeTries 2
  if ($live) {
    Write-Host "[ke-local] already online: $live"
    $reused += $svc.service_id
    continue
  }

  if (-not $svc.folder) {
    Write-Warning "[ke-local] folder not found for $($svc.service_id); start it manually or fix manifest_path"
    $failed += $svc.service_id
    continue
  }
  if (-not $svc.script) {
    Write-Warning "[ke-local] no start script in $($svc.folder)"
    $failed += $svc.service_id
    continue
  }

  if (-not (Repair-BrokenPythonVenvs -Folder $svc.folder)) {
    Write-Warning "[ke-local] venv preflight failed for $($svc.service_id); not starting a known-broken environment"
    $failed += $svc.service_id
    continue
  }

  $log = Join-Path $LogsDir "$($svc.service_id).log"
  Write-Host "[ke-local] silent start: $($svc.script)"
  Write-Host "[ke-local] log: $log"
  try {
    $proc = Start-ServiceSilent -ServiceId $svc.service_id -Folder $svc.folder -ScriptPath $svc.script -LogPath $log
    if ($proc) { $pidMap[$svc.service_id] = $proc.Id }
    if ($NoWait) {
      $started += $svc.service_id
      continue
    }
    [void]$pending.Add([pscustomobject]@{
      svc      = $svc
      proc     = $proc
      log      = $log
      spawnedAt = Get-Date
      lastHint = ""
    })
  } catch {
    Write-Warning "[ke-local] start failed: $($_.Exception.Message)"
    $failed += $svc.service_id
  }
}

# Parallel wait: shared deadline = WaitSeconds (not N * WaitSeconds).
# Early fail when wrapper process dies without /health, or logs show a fatal error.
if ($pending.Count -gt 0) {
  Write-Host "[ke-local] waiting in parallel for $($pending.Count) service(s), budget=${WaitSeconds}s (fail-fast on dead process / log errors)"
  $deadline = (Get-Date).AddSeconds($WaitSeconds)
  $graceSeconds = 3
  $still = New-Object System.Collections.Generic.List[object]
  foreach ($item in $pending) { [void]$still.Add($item) }

  while ($still.Count -gt 0 -and (Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    $next = New-Object System.Collections.Generic.List[object]
    foreach ($item in $still) {
      $svc = $item.svc
      $live = Find-LiveBase -ServiceId $svc.service_id -Label $svc.label -DefaultPort $svc.port -MaxTries $svc.max_tries -ProbeTries 4
      if ($live) {
        Write-Host "[ke-local] ready: $($svc.service_id) -> $live"
        $started += $svc.service_id
        continue
      }

      $fatal = Get-StartupFailureReason -LogPath $item.log
      if ($fatal) {
        Write-Warning "[ke-local] early fail $($svc.service_id): $fatal. Log: $($item.log)"
        $failed += $svc.service_id
        continue
      }

      $alive = Test-ProcessAlive -Proc $item.proc
      $age = ((Get-Date) - $item.spawnedAt).TotalSeconds
      if (-not $alive -and $age -ge $graceSeconds) {
        # Re-check health once: start scripts may exit 0 when already online.
        $live2 = Find-LiveBase -ServiceId $svc.service_id -Label $svc.label -DefaultPort $svc.port -MaxTries $svc.max_tries -ProbeTries 4
        if ($live2) {
          Write-Host "[ke-local] ready: $($svc.service_id) -> $live2"
          $started += $svc.service_id
          continue
        }
        Write-Warning "[ke-local] early fail $($svc.service_id): process exited before /health. Log: $($item.log)"
        $failed += $svc.service_id
        continue
      }

      $busy = Get-StartupBusyHint -LogPath $item.log
      if ($busy -and $busy -ne $item.lastHint) {
        Write-Host "[ke-local] $($svc.service_id): $busy ..."
        $item.lastHint = $busy
      }
      [void]$next.Add($item)
    }
    $still = $next
  }

  foreach ($item in $still) {
    $svc = $item.svc
    $busy = Get-StartupBusyHint -LogPath $item.log
    $extra = if ($busy) { " (last seen: $busy; first run may still be installing)" } else { "" }
    Write-Warning "[ke-local] timed out waiting for $($svc.service_id)$extra. Log: $($item.log)"
    $failed += $svc.service_id
  }
}

# Merge into pids.json
$pidsObj = @{ backend = $null; frontend = $null; locals = @{} }
if (Test-Path $PidFile) {
  try {
    $prev = Get-Content $PidFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($prev.backend) { $pidsObj.backend = $prev.backend }
    if ($prev.frontend) { $pidsObj.frontend = $prev.frontend }
    if ($prev.locals) {
      $prev.locals.PSObject.Properties | ForEach-Object {
        $pidsObj.locals[$_.Name] = $_.Value
      }
    }
  } catch { }
}
foreach ($k in $pidMap.Keys) {
  $pidsObj.locals[$k] = $pidMap[$k]
}
($pidsObj | ConvertTo-Json -Depth 5) | Set-Content -Path $PidFile -Encoding UTF8

Write-Host ""
Write-Host "[ke-local] done. started=$($started -join ',') reused=$($reused -join ',') failed=$($failed -join ',')"
Write-Host "[ke-local] logs: $LogsDir"

return @{
  started = $started
  reused  = $reused
  failed  = $failed
  skipped = $skipped
  pids    = $pidMap
}

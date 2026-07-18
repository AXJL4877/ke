# Silently start local HTTP backends declared by ke module integration contracts.
# ASCII-only. Called from start.ps1; can also run alone:
#   .\scripts\Start-LocalServices.ps1
# Skip: $env:KE_AUTO_START_LOCAL = "0"
param(
  [string]$KeRoot = "",
  [int]$WaitSeconds = 90,
  [switch]$NoWait
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

if ($env:KE_AUTO_START_LOCAL -eq "0" -or $env:KE_AUTO_START_LOCAL -eq "false") {
  Write-Host "[ke-local] KE_AUTO_START_LOCAL=0, skip"
  return @{ started = @(); skipped = @(); failed = @(); reused = @() }
}

# service_id -> typical folder name under mo_kuai
$FolderAliases = @{
  download   = "video_download"
  asr        = "audio_asr"
  tts        = "text_to_voice"
  transcript = "video_transcript"
  "ai-in"    = "AI_in"
  compose    = "video_creat"
  remotion   = "video_remotion"
  richtext   = "rich_txt"
}

function Test-HealthLabel {
  param([string]$BaseUrl, [string]$ExpectLabel, [string]$HealthPath = "/health")
  try {
    $u = $BaseUrl.TrimEnd("/") + $HealthPath
    $r = Invoke-RestMethod -Uri $u -TimeoutSec 2 -ErrorAction Stop
    if ($null -eq $r) { return $false }
    $svc = $r.service
    return ($svc -eq $ExpectLabel)
  } catch {
    return $false
  }
}

function Find-LiveBase {
  param([string]$ServiceId, [string]$Label, [int]$DefaultPort, [int]$MaxTries = 12)
  $cands = New-Object System.Collections.Generic.List[string]
  $envName = ($ServiceId.ToUpper() -replace "-", "_") + "_BASE_URL"
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
    for ($i = 0; $i -lt [Math]::Max(1, $MaxTries); $i++) {
      [void]$cands.Add("http://127.0.0.1:$($DefaultPort + $i)")
    }
  }
  foreach ($b in $cands) {
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
  if ($FolderAliases.ContainsKey($ServiceId)) { [void]$names.Add($FolderAliases[$ServiceId]) }
  if ($Label) { [void]$names.Add($Label) }
  [void]$names.Add($ServiceId)
  $roots = @(
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

function Start-ServiceSilent {
  param(
    [string]$ServiceId,
    [string]$Folder,
    [string]$ScriptPath,
    [string]$LogPath
  )
  "" | Set-Content -Path $LogPath -Encoding UTF8
  $ext = [System.IO.Path]::GetExtension($ScriptPath).ToLowerInvariant()
  if ($ext -eq ".ps1") {
    $proc = Start-Process -FilePath "powershell.exe" -WorkingDirectory $Folder -WindowStyle Hidden -PassThru -ArgumentList @(
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", $ScriptPath
    ) -RedirectStandardOutput $LogPath -RedirectStandardError ($LogPath + ".err")
  } else {
    # cmd /c keeps the console-less process for long-running node/uvicorn bats
    $proc = Start-Process -FilePath "cmd.exe" -WorkingDirectory $Folder -WindowStyle Hidden -PassThru -ArgumentList @(
      "/c",
      "`"$ScriptPath`""
    ) -RedirectStandardOutput $LogPath -RedirectStandardError ($LogPath + ".err")
  }
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
$services = Collect-Services
if ($services.Count -eq 0) {
  Write-Host "[ke-local] no contract sources/depends_on found (nothing to start)"
  return @{ started = @(); skipped = @(); failed = @(); reused = @() }
}

$started = @()
$reused = @()
$failed = @()
$skipped = @()
$pidMap = @{}

foreach ($sid in ($services.Keys | Sort-Object)) {
  $svc = $services[$sid]
  Write-Host "[ke-local] --- $($svc.service_id) (label=$($svc.label), from module $($svc.module_id)) ---"

  $live = Find-LiveBase -ServiceId $svc.service_id -Label $svc.label -DefaultPort $svc.port -MaxTries $svc.max_tries
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

  $log = Join-Path $LogsDir "$($svc.service_id).log"
  Write-Host "[ke-local] silent start: $($svc.script)"
  Write-Host "[ke-local] log: $log"
  try {
    $proc = Start-ServiceSilent -ServiceId $svc.service_id -Folder $svc.folder -ScriptPath $svc.script -LogPath $log
    if ($proc) { $pidMap[$svc.service_id] = $proc.Id }
  } catch {
    Write-Warning "[ke-local] start failed: $($_.Exception.Message)"
    $failed += $svc.service_id
    continue
  }

  if ($NoWait) {
    $started += $svc.service_id
    continue
  }

  $ok = $false
  $deadline = (Get-Date).AddSeconds($WaitSeconds)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    $live = Find-LiveBase -ServiceId $svc.service_id -Label $svc.label -DefaultPort $svc.port -MaxTries $svc.max_tries
    if ($live) {
      Write-Host "[ke-local] ready: $live"
      $ok = $true
      break
    }
  }
  if ($ok) {
    $started += $svc.service_id
  } else {
    Write-Warning "[ke-local] timed out waiting for $($svc.service_id) (first run may still be installing deps). Log: $log"
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

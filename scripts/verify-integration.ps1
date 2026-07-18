# Verify ke module integration contracts (portable with the ke repo).
#
# Usage (from ke/):
#   .\scripts\verify-integration.ps1
#   .\scripts\verify-integration.ps1 -StrictManual
#   .\scripts\verify-integration.ps1 -Base http://127.0.0.1:8789 -Prefix /download-api -Module cj-download

param(
    [switch]$StrictManual,
    [string]$Base = "",
    [string]$Prefix = "",
    [string]$Module = "",
    [string]$ModulesDir = ""
)

$ErrorActionPreference = "Stop"
$KeRoot = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $KeRoot "backend"

if (-not $ModulesDir) {
    $ModulesDir = Join-Path $Backend "modules"
}

Push-Location $Backend
try {
    $env:PYTHONPATH = "."
    $args = @("-m", "scripts.check_contracts", "--modules-dir", $ModulesDir)
    if ($StrictManual) { $args += "--strict-manual" }
    if ($Base) { $args += @("--base", $Base) }
    if ($Prefix) { $args += @("--prefix", $Prefix) }
    if ($Module) { $args += @("--module", $Module) }

    Write-Host ">> python $($args -join ' ')"
    & python @args
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}

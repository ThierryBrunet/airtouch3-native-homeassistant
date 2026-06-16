#Requires -Version 5.1
<#
.SYNOPSIS
    Deploy native AirTouch 3 custom component to MazeppaHome via Samba.
#>
param(
    [string] $SambaHost = '192.168.31.233',
    [string] $SambaShare = 'config',
    [string] $SourceDir = (Join-Path $PSScriptRoot '..\airtouch3_custom_component'),
    [switch] $RestartHa
)

$ErrorActionPreference = 'Stop'

$source = (Resolve-Path $SourceDir).Path
$destRoot = "\\$SambaHost\$SambaShare\custom_components"
$dest = Join-Path $destRoot 'airtouch3'

if (-not (Test-Path $source)) {
    throw "Source not found: $source"
}

if (-not (Test-Path $destRoot)) {
    throw "Samba path not reachable: $destRoot"
}

Write-Host "Deploying $source -> $dest"

if (Test-Path $dest) {
    Remove-Item -LiteralPath $dest -Recurse -Force
}

$exclude = @('.git', '__pycache__', '*.pyc', 'readme.md', 'at3.PNG')
robocopy $source $dest /E /XD .git __pycache__ /XF at3.PNG /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) {
    throw "robocopy failed with exit code $LASTEXITCODE"
}

$wwwFiles = @('daikin-ac-panel-v11.js', 'daikin-ac-panel-v10.js', 'daikin-ac-panel-v9.js', 'daikin-ac-panel-v8.js', 'daikin-ac-panel-v7.js', 'daikin-ac-panel-v6.js', 'daikin-ac-panel-v5.js', 'daikin-ac-panel-v4.js', 'daikin-ac-panel-v3.js', 'daikin-ac-panel-v2.js', 'daikin-ac-panel.js')
foreach ($wwwFile in $wwwFiles) {
    $wwwSource = Join-Path $source "www\$wwwFile"
    $wwwDest = "\\$SambaHost\$SambaShare\www\$wwwFile"
    if (Test-Path $wwwSource) {
        Copy-Item -LiteralPath $wwwSource -Destination $wwwDest -Force
        Write-Host "Deployed dashboard card to $wwwDest" -ForegroundColor Green
    }
}

Write-Host "Deployed AirTouch 3 component to $dest" -ForegroundColor Green

if ($RestartHa) {
    Write-Host "Restart Home Assistant from Settings -> System -> Restart, then add the integration via UI."
}
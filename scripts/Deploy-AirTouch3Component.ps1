#Requires -Version 5.1
<#
.SYNOPSIS
    Deploy native AirTouch 3 custom component to Home Assistant via Samba.
.DESCRIPTION
    Copies airtouch3_custom_component to config/custom_components/airtouch3
    and dashboard JS files to config/www on the HA Samba share.

    When the share requires authentication, pass -Credential (recommended) or
    map the share first with net use / Explorer sign-in.
.EXAMPLE
    $cred = Get-Credential
    .\Deploy-AirTouch3Component.ps1 -SambaHost 192.168.31.50 -Credential $cred
.EXAMPLE
    .\Deploy-AirTouch3Component.ps1 -SambaHost homeassistant.local
#>
param(
    [string] $SambaHost = '192.168.31.233',
    [string] $SambaShare = 'config',
    [string] $SourceDir = (Join-Path $PSScriptRoot '..\airtouch3_custom_component'),
    [string] $PanelVersionFile = 'daikin-ac-panel-v22.js',
    [switch] $RestartHa,
    [switch] $SkipLovelaceResourceUpdate,
    [PSCredential] $Credential
)

$ErrorActionPreference = 'Stop'
$LatestPanelAlias = 'daikin-ac-panel.js'

$source = (Resolve-Path $SourceDir).Path
$shareRoot = "\\$SambaHost\$SambaShare"
$psDriveName = $null

function Get-ConfigPaths {
    param([string] $Root)
    [PSCustomObject]@{
        ComponentsRoot = Join-Path $Root 'custom_components'
        ComponentDest  = Join-Path $Root 'custom_components\airtouch3'
        WwwRoot        = Join-Path $Root 'www'
        StorageRoot    = Join-Path $Root '.storage'
    }
}

function Get-DaikinPanelResourceUrl {
    param([string] $PanelVersionFile)

    $versionTag = '0'
    if ($PanelVersionFile -match 'v(\d+)') {
        $versionTag = $Matches[1]
    }
    return "/local/daikin-ac-panel.js?v=$versionTag"
}

function Update-DaikinLovelaceResource {
    param(
        [string] $StorageRoot,
        [string] $ResourceUrl
    )

    $resourcePath = Join-Path $StorageRoot 'lovelace_resources'
    if (-not (Test-Path -LiteralPath $resourcePath)) {
        Write-Warning "Lovelace resources storage not found: $resourcePath"
        return
    }

    $normalizedUrl = $ResourceUrl.Trim()
    $raw = Get-Content -LiteralPath $resourcePath -Raw -Encoding UTF8
    if ($raw -match 'daikin-ac-panel') {
        $newRaw = $raw -replace '"/local/daikin-ac-panel[^"]*"', "`"$normalizedUrl`""
        if ($newRaw -ne $raw) {
            Set-Content -LiteralPath $resourcePath -Value $newRaw -Encoding UTF8
            Write-Host "Updated Lovelace resource -> $normalizedUrl" -ForegroundColor Green
        }
        else {
            Write-Host "Lovelace resource already set to $normalizedUrl" -ForegroundColor DarkGray
        }
        return
    }

    $json = $raw | ConvertFrom-Json
    $json.data.items += [PSCustomObject]@{
        id   = ([guid]::NewGuid().ToString('N'))
        url  = $normalizedUrl
        type = 'module'
    }
    $json | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $resourcePath -Encoding UTF8
    Write-Host "Added Lovelace resource -> $normalizedUrl" -ForegroundColor Green
}

try {
    if ($Credential) {
        $psDriveName = 'HaCfg' + ([guid]::NewGuid().ToString('N').Substring(0, 6))
        $null = New-PSDrive -Name $psDriveName -PSProvider FileSystem -Root $shareRoot -Credential $Credential -Scope Script
        $paths = Get-ConfigPaths -Root "${psDriveName}:\"
        Write-Host "Connected to $shareRoot using supplied credentials." -ForegroundColor Cyan
    }
    else {
        if (-not (Test-Path -LiteralPath $shareRoot)) {
            throw @"
Samba path not reachable: $shareRoot
Provide -Credential or sign in to the share first (Explorer -> \\$SambaHost\$SambaShare).
"@
        }
        $paths = Get-ConfigPaths -Root $shareRoot
    }

    if (-not (Test-Path $source)) {
        throw "Source not found: $source"
    }

    if (-not (Test-Path -LiteralPath $paths.ComponentsRoot)) {
        throw "Samba custom_components path not reachable: $($paths.ComponentsRoot)"
    }

    Write-Host "Deploying $source -> $($paths.ComponentDest)"

    if (Test-Path -LiteralPath $paths.ComponentDest) {
        Remove-Item -LiteralPath $paths.ComponentDest -Recurse -Force
    }

    robocopy $source $paths.ComponentDest /E /XD .git __pycache__ /XF at3.PNG /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
    if ($LASTEXITCODE -ge 8) {
        throw "robocopy failed with exit code $LASTEXITCODE"
    }

    $latestPanelSource = Join-Path $source "www\$PanelVersionFile"
    if (-not (Test-Path -LiteralPath $latestPanelSource)) {
        throw "Latest panel JS not found: $latestPanelSource"
    }

    $wwwFiles = @(
        $PanelVersionFile, $LatestPanelAlias,
        'daikin-ac-panel-v17.js', 'daikin-ac-panel-v16.js', 'daikin-ac-panel-v15.js', 'daikin-ac-panel-v14.js', 'daikin-ac-panel-v13.js', 'daikin-ac-panel-v12.js', 'daikin-ac-panel-v11.js', 'daikin-ac-panel-v10.js', 'daikin-ac-panel-v9.js',
        'daikin-ac-panel-v8.js', 'daikin-ac-panel-v7.js', 'daikin-ac-panel-v6.js',
        'daikin-ac-panel-v5.js', 'daikin-ac-panel-v4.js', 'daikin-ac-panel-v3.js',
        'daikin-ac-panel-v2.js'
    ) | Select-Object -Unique

    foreach ($wwwFile in $wwwFiles) {
        $wwwSource = if ($wwwFile -eq $LatestPanelAlias) { $latestPanelSource } else { Join-Path $source "www\$wwwFile" }
        $wwwDest = Join-Path $paths.WwwRoot $wwwFile
        if (Test-Path -LiteralPath $wwwSource) {
            Copy-Item -LiteralPath $wwwSource -Destination $wwwDest -Force
            Write-Host "Deployed dashboard card to $wwwDest" -ForegroundColor Green
        }
    }

    if (-not $SkipLovelaceResourceUpdate) {
        $resourceUrl = Get-DaikinPanelResourceUrl -PanelVersionFile $PanelVersionFile
        Update-DaikinLovelaceResource -StorageRoot $paths.StorageRoot -ResourceUrl $resourceUrl
    }

    Write-Host "Deployed AirTouch 3 component to $($paths.ComponentDest)" -ForegroundColor Green
    $resourceHint = Get-DaikinPanelResourceUrl -PanelVersionFile $PanelVersionFile
    Write-Host "Dashboard card version: $PanelVersionFile (Lovelace resource: $resourceHint)" -ForegroundColor Cyan

    if ($RestartHa) {
        Write-Host "Restart Home Assistant from Settings -> System -> Restart, then add the integration via UI."
    }
}
finally {
    if ($psDriveName) {
        Remove-PSDrive -Name $psDriveName -Force -ErrorAction SilentlyContinue
    }
}
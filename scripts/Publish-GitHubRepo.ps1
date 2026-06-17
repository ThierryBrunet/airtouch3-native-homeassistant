#Requires -Version 7.0
<#
.SYNOPSIS
    Create public GitHub repo and push Daikin_HA main branch.
#>
[CmdletBinding()]
param(
    [string]$RepoName = 'airtouch3-native-homeassistant',
    [string]$Description = 'Native Home Assistant integration for Polyaire AirTouch 3 — direct TCP, custom Lovelace panel, no vzduch-dotek.',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$grokSecrets = 'C:\Users\thier\OneDrive\Workspaces\GrokBuild\.grok\Load-McpSecrets.ps1'
if (-not $env:GITHUB_PERSONAL_ACCESS_TOKEN -and (Test-Path $grokSecrets)) {
    . $grokSecrets
}
if (-not $env:GITHUB_PERSONAL_ACCESS_TOKEN) {
    throw 'GITHUB_PERSONAL_ACCESS_TOKEN is not set. Run Load-McpSecrets.ps1 first.'
}

$headers = @{
    Authorization          = "Bearer $env:GITHUB_PERSONAL_ACCESS_TOKEN"
    Accept                 = 'application/vnd.github+json'
    'X-GitHub-Api-Version' = '2022-11-28'
}

$user = Invoke-RestMethod -Uri 'https://api.github.com/user' -Headers $headers
$owner = $user.login
Write-Host "GitHub user: $owner" -ForegroundColor Cyan

$repoUri = "https://api.github.com/repos/$owner/$RepoName"
$repo = $null
try {
    $repo = Invoke-RestMethod -Uri $repoUri -Headers $headers
    Write-Host "Repository already exists: $($repo.html_url)" -ForegroundColor Yellow
} catch {
    if ($_.Exception.Response.StatusCode.value__ -ne 404) { throw }
    $body = @{
        name        = $RepoName
        description = $Description
        private     = $false
        auto_init     = $false
    } | ConvertTo-Json
    $repo = Invoke-RestMethod -Method Post -Uri 'https://api.github.com/user/repos' -Headers $headers -Body $body -ContentType 'application/json; charset=utf-8'
    Write-Host "Created repository: $($repo.html_url)" -ForegroundColor Green
}

$remoteUrl = "https://github.com/$owner/$RepoName.git"
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
    $remotes = @(git remote)
    if ($remotes -contains 'origin') {
        git remote set-url origin $remoteUrl
    } else {
        git remote add origin $remoteUrl
    }

    $credential = "x-access-token:$($env:GITHUB_PERSONAL_ACCESS_TOKEN)"
    $encoded = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($credential))
    $prevExtra = $env:GIT_CONFIG_COUNT
    $prevKey0 = $env:GIT_CONFIG_KEY_0
    $prevVal0 = $env:GIT_CONFIG_VALUE_0
    $env:GIT_CONFIG_COUNT = '1'
    $env:GIT_CONFIG_KEY_0 = 'http.extraHeader'
    $env:GIT_CONFIG_VALUE_0 = "Authorization: Basic $encoded"

    try {
        git push -u origin main
        if ($LASTEXITCODE -ne 0) { throw "git push failed with exit code $LASTEXITCODE" }
    } finally {
        if ($null -ne $prevExtra) { $env:GIT_CONFIG_COUNT = $prevExtra } else { Remove-Item Env:GIT_CONFIG_COUNT -ErrorAction SilentlyContinue }
        if ($null -ne $prevKey0) { $env:GIT_CONFIG_KEY_0 = $prevKey0 } else { Remove-Item Env:GIT_CONFIG_KEY_0 -ErrorAction SilentlyContinue }
        if ($null -ne $prevVal0) { $env:GIT_CONFIG_VALUE_0 = $prevVal0 } else { Remove-Item Env:GIT_CONFIG_VALUE_0 -ErrorAction SilentlyContinue }
    }

    Write-Host "Pushed main to $remoteUrl" -ForegroundColor Green
    Write-Host "Public URL: $($repo.html_url)" -ForegroundColor Green
} finally {
    Pop-Location
}
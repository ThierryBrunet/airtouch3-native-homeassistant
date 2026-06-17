#Requires -Version 5.1
<#
.SYNOPSIS
    Update the Daikin A/C Lovelace JS resource via Home Assistant WebSocket API.
.DESCRIPTION
    Home Assistant keeps Lovelace resources in memory. Editing .storage/lovelace_resources
    on disk does not reload the frontend; the UI uses WebSocket commands instead.
    This script mirrors that behaviour so deploys take effect without manual edits.
.PARAMETER ResourceUrl
    Target resource URL, e.g. /local/daikin-ac-panel.js?v=24
.PARAMETER HaUrl
    Home Assistant base URL. Defaults to HOMEASSISTANT_URL env var.
.PARAMETER HaToken
    Long-lived access token. Defaults to HOMEASSISTANT_TOKEN env var.
.EXAMPLE
    .\Update-DaikinLovelaceResource.ps1 -ResourceUrl '/local/daikin-ac-panel.js?v=24'
#>
param(
    [Parameter(Mandatory = $true)]
    [string] $ResourceUrl,
    [string] $HaUrl = $env:HOMEASSISTANT_URL,
    [string] $HaToken = $env:HOMEASSISTANT_TOKEN,
    [string] $SambaHost = '192.168.31.233'
)

$ErrorActionPreference = 'Stop'

function Get-HaCredentials {
    if ($HaToken -and $HaUrl) {
        return [PSCustomObject]@{ Url = $HaUrl.TrimEnd('/'); Token = $HaToken }
    }

    $loader = Join-Path $env:USERPROFILE '.grok\skills\secretstore-get\scripts\Load-SecretsToEnv.ps1'
    if (-not (Test-Path -LiteralPath $loader)) {
        throw 'HOMEASSISTANT_TOKEN and HOMEASSISTANT_URL are not set and SecretStore loader was not found.'
    }

    & $loader -Mappings @(
        @{ SecretName = 'HomeAssistant_MazeppaHome_SecObj'; EnvVar = 'HOMEASSISTANT_TOKEN' },
        @{ SecretName = 'HomeAssistant_MazeppaHome_SecObj'; EnvVar = 'HOMEASSISTANT_URL'; Property = 'Url' }
    ) | Out-Null

    if (-not $env:HOMEASSISTANT_TOKEN) {
        throw 'HOMEASSISTANT_TOKEN is not available.'
    }

    $url = if ($env:HOMEASSISTANT_URL) { $env:HOMEASSISTANT_URL.TrimEnd('/') } else { "http://${SambaHost}:8123" }
    return [PSCustomObject]@{ Url = $url; Token = $env:HOMEASSISTANT_TOKEN }
}

function Send-HaWebSocketMessage {
    param(
        [System.Net.WebSockets.ClientWebSocket] $WebSocket,
        [hashtable] $Message
    )

    $payload = ($Message | ConvertTo-Json -Compress)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    $segment = [ArraySegment[byte]]::new($bytes)
    $WebSocket.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
}

function Receive-HaWebSocketMessage {
    param([System.Net.WebSockets.ClientWebSocket] $WebSocket)

    $buffer = [byte[]]::new(65536)
    $segment = [ArraySegment[byte]]::new($buffer)
    $builder = New-Object System.Text.StringBuilder

    do {
        $result = $WebSocket.ReceiveAsync($segment, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
        if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
            throw 'Home Assistant WebSocket closed unexpectedly.'
        }
        $builder.Append([System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count)) | Out-Null
    } while (-not $result.EndOfMessage)

    return $builder.ToString() | ConvertFrom-Json
}

function Invoke-HaWebSocketCommand {
    param(
        [System.Net.WebSockets.ClientWebSocket] $WebSocket,
        [int] $MessageId,
        [hashtable] $Command
    )

    $payload = @{ id = $MessageId } + $Command
    Send-HaWebSocketMessage -WebSocket $WebSocket -Message $payload
    $response = Receive-HaWebSocketMessage -WebSocket $WebSocket
    if ($response.id -ne $MessageId) {
        throw "WebSocket response id mismatch (expected $MessageId, got $($response.id))."
    }
    if (-not $response.success) {
        $errorText = if ($response.error) { ($response.error | ConvertTo-Json -Compress) } else { 'unknown error' }
        throw "Home Assistant WebSocket command '$($Command.type)' failed: $errorText"
    }
    return $response.result
}

$creds = Get-HaCredentials
$wsUrl = ($creds.Url -replace '^http://', 'ws://' -replace '^https://', 'wss://') + '/api/websocket'
$normalizedUrl = $ResourceUrl.Trim()

$webSocket = [System.Net.WebSockets.ClientWebSocket]::new()
try {
    $webSocket.ConnectAsync([Uri]$wsUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null

    $authRequired = Receive-HaWebSocketMessage -WebSocket $webSocket
    if ($authRequired.type -ne 'auth_required') {
        throw "Unexpected WebSocket greeting: $($authRequired.type)"
    }

    Send-HaWebSocketMessage -WebSocket $webSocket -Message @{
        type         = 'auth'
        access_token = $creds.Token
    }
    $authOk = Receive-HaWebSocketMessage -WebSocket $webSocket
    if ($authOk.type -ne 'auth_ok') {
        throw "Home Assistant WebSocket authentication failed: $($authOk.type)"
    }

    $resources = @(Invoke-HaWebSocketCommand -WebSocket $webSocket -MessageId 1 -Command @{
            type = 'lovelace/resources'
        })

    $target = $resources | Where-Object { [string]$_.url -match 'daikin-ac-panel' } | Select-Object -First 1
    if ($target) {
        $updated = Invoke-HaWebSocketCommand -WebSocket $webSocket -MessageId 2 -Command @{
            type        = 'lovelace/resources/update'
            resource_id = $target.id
            url         = $normalizedUrl
            res_type    = 'module'
        }
        Write-Host "Updated Lovelace resource $($target.id) -> $normalizedUrl" -ForegroundColor Green
        return $updated
    }

    $created = Invoke-HaWebSocketCommand -WebSocket $webSocket -MessageId 2 -Command @{
        type     = 'lovelace/resources/create'
        url      = $normalizedUrl
        res_type = 'module'
    }
    Write-Host "Created Lovelace resource -> $normalizedUrl" -ForegroundColor Green
    return $created
}
finally {
    if ($webSocket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $webSocket.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '', [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
    }
    $webSocket.Dispose()
}
param(
    [string]$Subnet = "192.168.31",
    [int]$Port = 8899,
    [string]$Host = "",
    [int]$ApiPort = 5353
)

function Test-TcpPort {
    param([string]$TargetHost, [int]$TargetPort)
    return Test-NetConnection -ComputerName $TargetHost -Port $TargetPort -WarningAction SilentlyContinue -InformationLevel Quiet
}

function Invoke-VzduchApi {
    param([string]$BaseUrl)
    try {
        $response = Invoke-RestMethod -Uri "$BaseUrl/api/aircons" -TimeoutSec 10
        return $response
    }
    catch {
        Write-Warning "API call failed: $($_.Exception.Message)"
        return $null
    }
}

if ($Host) {
    Write-Host "Testing AirTouch controller at ${Host}:${Port}..."
    if (Test-TcpPort -TargetHost $Host -TargetPort $Port) {
        Write-Host "OK: TCP port $Port open on $Host"
    }
    else {
        Write-Host "FAIL: TCP port $Port closed on $Host"
    }

    Write-Host "Testing vzduch-dotek API at ${Host}:${ApiPort}..."
    $api = Invoke-VzduchApi -BaseUrl "http://${Host}:${ApiPort}"
    if ($api) {
        Write-Host "OK: vzduch-dotek API responded"
        $api | ConvertTo-Json -Depth 4
    }
    return
}

Write-Host "Scanning ${Subnet}.0/24 for AirTouch TCP port $Port..."
$found = foreach ($i in 1..254) {
    $ip = "$Subnet.$i"
    if (Test-TcpPort -TargetHost $ip -TargetPort $Port) { $ip }
}

if (-not $found) {
    Write-Host "No hosts found with port $Port open on ${Subnet}.0/24"
    return
}

Write-Host "Found $($found.Count) host(s): $($found -join ', ')"
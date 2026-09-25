$ErrorActionPreference = 'Stop'

for ($attempt = 0; $attempt -lt 15; $attempt++) {
    try {
        $pairing = Invoke-RestMethod -Uri 'http://localhost:3003/api/local/pairing' -TimeoutSec 3
        if ($pairing.tunnelStatus -eq 'online' -and $pairing.tunnelUrl) {
            Write-Host "Thiri Companion tunnel is already running: $($pairing.tunnelUrl)"
            return
        }
        if ($pairing.tunnelStatus -notin @('connecting', 'reconnecting')) { break }
    } catch { break }
    Start-Sleep -Seconds 1
}

$cloudflared = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cloudflared) {
    $bundled = Join-Path $PSScriptRoot '..\.local-tools\cloudflared.exe'
    if (Test-Path -LiteralPath $bundled) { $cloudflared = (Resolve-Path -LiteralPath $bundled).Path }
}
if (-not $cloudflared) {
    throw 'Install cloudflared from https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/ and run this script again.'
}

$toolDir = Join-Path $PSScriptRoot '..\.local-tools'
New-Item -ItemType Directory -Path $toolDir -Force | Out-Null
$log = Join-Path $toolDir 'tunnel.log'
$output = Join-Path $toolDir 'tunnel-output.log'
$process = Start-Process -FilePath $cloudflared -ArgumentList @('tunnel', '--url', 'http://127.0.0.1:3004') -WorkingDirectory (Resolve-Path $toolDir).Path -WindowStyle Hidden -RedirectStandardError $log -RedirectStandardOutput $output -PassThru
$url = $null
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Seconds 1
    if ($process.HasExited) { throw "Cloudflare Tunnel exited. Read $log for details." }
    $content = if (Test-Path -LiteralPath $log) { Get-Content -LiteralPath $log -Raw } else { '' }
    $url = [regex]::Match($content, 'https://[a-z0-9-]+\.trycloudflare\.com').Value
    if ($url) { break }
}
if (-not $url) { throw "Tunnel URL was not found. Read $log for details." }
Write-Host "Thiri Companion tunnel: $url"
Write-Host 'Open http://localhost:3003 → Pair devices for the pairing code.'
Write-Host "Tunnel process ID: $($process.Id)"

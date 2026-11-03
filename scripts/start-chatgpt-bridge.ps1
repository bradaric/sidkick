Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$client = Join-Path $repoRoot 'tools\tunnel-client\bin\tunnel-client.exe'
$python = Join-Path $repoRoot 'civ7\.venv\Scripts\python.exe'
$profileDir = Join-Path $repoRoot '.sidkick\profiles'
$profilePath = Join-Path $profileDir 'sidkick.yaml'
$keyPath = Join-Path $repoRoot '.sidkick\tunnel-runtime-key.txt'
$pythonCommandPath = $python.Replace('\', '/')
$mcpCommand = "`"$pythonCommandPath`" -m sidkick.server --transport stdio"

if (-not (Test-Path -LiteralPath $profilePath)) {
    throw 'Sidkick is not configured. Run configure-chatgpt-tunnel.ps1 first.'
}

$profileText = Get-Content -Raw -LiteralPath $profilePath
$tunnelMatch = [regex]::Match($profileText, '(?m)^\s*"?tunnel_id"?\s*:\s*"([^"]+)"')
if (-not $tunnelMatch.Success) {
    throw 'The Sidkick tunnel profile is missing its tunnel ID.'
}
if (-not (Test-Path -LiteralPath $keyPath)) {
    throw 'The Sidkick tunnel runtime key file is missing. Run configure-chatgpt-tunnel.ps1.'
}
$tunnelId = $tunnelMatch.Groups[1].Value
$keyReference = "file:$keyPath"

$connectOutput = & $client runtimes connect `
    --alias sidkick `
    --profile sidkick `
    --profile-dir $profileDir `
    --tunnel-id $tunnelId `
    --runtime-api-key $keyReference `
    --mcp-command $mcpCommand
if ($LASTEXITCODE -ne 0) {
    throw "tunnel-client connect failed with exit code $LASTEXITCODE"
}

$statusJson = & $client runtimes status sidkick --json
if ($LASTEXITCODE -ne 0) {
    throw "tunnel-client status failed with exit code $LASTEXITCODE"
}
$status = $statusJson | ConvertFrom-Json
if (-not $status.healthy -or -not $status.ready -or -not $status.process_running) {
    throw 'Sidkick started but did not reach a healthy, ready state.'
}

Write-Host 'Sidkick is running and ready.'

